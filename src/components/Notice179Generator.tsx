import React, { useState, useMemo } from 'react';
import {
  FileText,
  Download,
  FolderArchive,
  ExternalLink,
  CheckCircle2,
  AlertCircle,
  Eye,
  ChevronLeft,
  ChevronRight,
  Upload,
} from 'lucide-react';
import { RegisterRecord, Notice179Config, GeneratedDoc } from '../types';
import { StoredMasterTemplate } from '../utils/templateStorage';
import { generate179NoticeDocx, cleanPoliceStationName, formatThroughLine } from '../utils/docxEngine';
import { triggerDownload, openDocumentInDeviceApp, createZipFromDocuments } from '../utils/fileUtils';

interface Props {
  selectedRecords: RegisterRecord[];
  notice179: StoredMasterTemplate | null;
  onOpenTemplates: () => void;
}

export const Notice179Generator: React.FC<Props> = ({
  selectedRecords,
  notice179,
  onOpenTemplates,
}) => {
  // Current year for default memo suffix
  const currentYear = new Date().getFullYear();

  // Form common fields - startingMemoNo is strictly numeric (e.g. 159)
  const [startingMemoNo, setStartingMemoNo] = useState<string>('159');
  const [date, setDate] = useState<string>(new Date().toLocaleDateString('en-GB'));
  const [gdeNo, setGdeNo] = useState<string>('');
  const [gdeDate, setGdeDate] = useState<string>(new Date().toLocaleDateString('en-GB'));
  const [ioName, setIoName] = useState<string>('SI Asif Ikbal');
  const [ioMobile, setIoMobile] = useState<string>('');

  // Manual overrides per record serial for name, address, PS, memoNo
  const [manualOverrides, setManualOverrides] = useState<
    Record<number, { memoNo?: string; name?: string; address?: string; ps?: string }>
  >({});

  // Preview index
  const [previewIdx, setPreviewIdx] = useState<number>(0);

  // Download & generation states
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [downloadStatus, setDownloadStatus] = useState<'idle' | 'downloading' | 'downloaded'>('idle');
  const [generatedDocs, setGeneratedDocs] = useState<GeneratedDoc[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const currentPreviewRecord = selectedRecords[previewIdx] || selectedRecords[0];

  // Helper to compute strictly numeric Memo No for a given record index (e.g. 159, 160)
  const getMemoNoForIndex = (index: number): string => {
    const rec = selectedRecords[index];
    if (rec && manualOverrides[rec.serial]?.memoNo) {
      return manualOverrides[rec.serial].memoNo!.replace(/\/?\d{4}-Cyber-BHM.*$/i, '').trim();
    }
    const startNum = parseInt(startingMemoNo.trim(), 10);
    if (!isNaN(startNum)) {
      return String(startNum + index);
    }
    return startingMemoNo.trim() || '159';
  };

  // Helper to get effective record fields
  const getEffectiveRecord = (rec: RegisterRecord) => {
    const override = manualOverrides[rec.serial] || {};
    return {
      name: override.name ?? rec.extractedName,
      address: override.address ?? rec.extractedAddress,
      ps: override.ps ?? rec.ps,
    };
  };

  // Validation
  const validationError = useMemo(() => {
    if (!notice179) return 'Please add the master template first.';
    if (selectedRecords.length === 0) return 'No records selected.';
    if (!gdeNo.trim()) return 'Please enter GDE No. before generating.';
    if (!gdeDate.trim()) return 'Please enter GDE Date before generating.';
    return null;
  }, [notice179, selectedRecords, gdeNo, gdeDate]);

  const handleGenerate = async () => {
    if (validationError) {
      setErrorMsg(validationError);
      return;
    }
    if (!notice179) return;

    setErrorMsg(null);
    setIsGenerating(true);
    setDownloadStatus('downloading');

    try {
      const config: Notice179Config = {
        startingMemoNo: startingMemoNo.trim(),
        memoYearSuffix: `/${currentYear}-Cyber-BHM`,
        date,
        gdeNo,
        gdeDate,
        ioName,
        ioMobile,
        psAuthority: '', // Not used for Through line; suspect's PS is authoritative
        manualOverrides,
      };

      const docs: GeneratedDoc[] = [];

      for (let i = 0; i < selectedRecords.length; i++) {
        const record = selectedRecords[i];
        // Pass strictly the numeric memo number (e.g. 159, 160)
        const memoNo = getMemoNoForIndex(i);

        // Modify actual master DOCX from IndexedDB buffer
        const docBlob = await generate179NoticeDocx(notice179.buffer, record, config, memoNo);
        const filename = `179_Notice_Sl_${record.serial}_Report_${record.reportNo || 'NA'}.docx`;

        docs.push({
          id: `179-${record.serial}-${Date.now()}-${i}`,
          filename,
          blob: docBlob,
          type: '179',
          recordSerial: record.serial,
          reportNo: record.reportNo,
          createdAt: new Date(),
        });
      }

      setGeneratedDocs(docs);

      // Trigger download
      if (docs.length === 1) {
        triggerDownload(docs[0].blob, docs[0].filename);
      } else {
        const firstSl = selectedRecords[0].serial;
        const lastSl = selectedRecords[selectedRecords.length - 1].serial;
        const zipBlob = await createZipFromDocuments(
          docs,
          `179_Notices_Sl_${firstSl}_to_${lastSl}.zip`
        );
        triggerDownload(zipBlob, `179_Notices_Sl_${firstSl}_to_${lastSl}.zip`);
      }

      setDownloadStatus('downloaded');
    } catch (err: unknown) {
      console.error(err);
      setErrorMsg((err as Error).message || 'Failed to generate 179 BNSS Notices.');
      setDownloadStatus('idle');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleOpenDoc = async (doc: GeneratedDoc) => {
    await openDocumentInDeviceApp(doc.blob, doc.filename);
  };

  const handleDownloadAllZip = async () => {
    if (generatedDocs.length === 0) return;
    const firstSl = selectedRecords[0]?.serial || 1;
    const lastSl = selectedRecords[selectedRecords.length - 1]?.serial || generatedDocs.length;
    const zipBlob = await createZipFromDocuments(
      generatedDocs,
      `179_Notices_Sl_${firstSl}_to_${lastSl}.zip`
    );
    triggerDownload(zipBlob, `179_Notices_Sl_${firstSl}_to_${lastSl}.zip`);
  };

  const updateCurrentRecordOverride = (field: 'memoNo' | 'name' | 'address' | 'ps', val: string) => {
    if (!currentPreviewRecord) return;
    setManualOverrides(prev => ({
      ...prev,
      [currentPreviewRecord.serial]: {
        ...prev[currentPreviewRecord.serial],
        [field]: val,
      },
    }));
  };

  return (
    <div className="bg-white border border-slate-200 rounded-lg p-5 shadow-xs space-y-5">
      <div className="flex items-start justify-between flex-wrap gap-2">
        <div>
          <h3 className="text-sm font-semibold text-slate-900 tracking-tight">
            179 BNSS Notice Generator
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Generates separate notices for each of the {selectedRecords.length} selected record(s) using the uploaded master.
          </p>
        </div>

        {notice179 ? (
          <span className="text-[11px] font-medium text-emerald-800 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded flex items-center gap-1">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            <span>Master Loaded: {notice179.name}</span>
          </span>
        ) : (
          <span className="text-[11px] font-medium text-amber-800 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded flex items-center gap-1">
            <AlertCircle className="w-3.5 h-3.5 text-amber-600" />
            <span>Master Not Added</span>
          </span>
        )}
      </div>

      {errorMsg && (
        <div className="p-3 rounded bg-red-50 border border-red-200 text-xs text-red-800 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Common Editable Fields */}
      <div className="border border-slate-200 rounded-lg p-4 bg-slate-50/50">
        <h4 className="text-xs font-semibold text-slate-800 uppercase tracking-wider mb-3">
          Common Notice Fields
        </h4>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5 text-xs">
          {/* Starting Memo No */}
          <div>
            <label className="block text-slate-700 font-medium mb-1">
              Starting Memo No. (Numeric Only)
            </label>
            <input
              type="text"
              placeholder="e.g. 159"
              value={startingMemoNo}
              onChange={e => setStartingMemoNo(e.target.value.replace(/\/?\d{4}-Cyber-BHM.*$/i, '').trim())}
              className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded text-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-800 font-mono"
            />
            <p className="text-[10px] text-slate-500 mt-1">
              Suffix <code>/2026-Cyber-BHM</code> is preserved from master. Generates 159, 160, 161...
            </p>
          </div>

          {/* Notice Date */}
          <div>
            <label className="block text-slate-700 font-medium mb-1">Notice Date</label>
            <input
              type="text"
              placeholder="DD/MM/YYYY"
              value={date}
              onChange={e => setDate(e.target.value)}
              className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded text-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-800"
            />
          </div>

          {/* GDE No. */}
          <div>
            <label className="block text-slate-700 font-medium mb-1">
              GDE No. <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              placeholder="e.g. 524/2026"
              value={gdeNo}
              onChange={e => setGdeNo(e.target.value)}
              className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded text-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-800"
            />
          </div>

          {/* GDE Date */}
          <div>
            <label className="block text-slate-700 font-medium mb-1">
              GDE Date <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              placeholder="DD/MM/YYYY"
              value={gdeDate}
              onChange={e => setGdeDate(e.target.value)}
              className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded text-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-800"
            />
          </div>

          {/* IO Name */}
          <div>
            <label className="block text-slate-700 font-medium mb-1">IO Name (Optional Override)</label>
            <input
              type="text"
              placeholder="e.g. SI Asif Ikbal"
              value={ioName}
              onChange={e => setIoName(e.target.value)}
              className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded text-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-800"
            />
          </div>

          {/* IO Mobile */}
          <div>
            <label className="block text-slate-700 font-medium mb-1">IO Mobile No. (Optional)</label>
            <input
              type="text"
              placeholder="IO Contact Number"
              value={ioMobile}
              onChange={e => setIoMobile(e.target.value)}
              className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded text-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-800"
            />
          </div>

          {/* Suspect's PS Routing info */}
          <div className="sm:col-span-2 lg:col-span-3 bg-slate-100/80 border border-slate-200 rounded p-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <span className="block text-[11px] font-semibold text-slate-800">
                Through Transmission Routing
              </span>
              <p className="text-[11px] text-slate-600 mt-0.5">
                Automatically uses the suspect's local Police Station parsed from each record.
              </p>
            </div>
            {currentPreviewRecord && (
              <span className="text-xs font-mono font-semibold text-slate-900 bg-white px-2.5 py-1 rounded border border-slate-200 shrink-0">
                {formatThroughLine(getEffectiveRecord(currentPreviewRecord).ps)}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Notice Preview Before Generation */}
      {currentPreviewRecord && (
        <div className="border border-slate-200 rounded-lg p-4 bg-white">
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <Eye className="w-3.5 h-3.5 text-slate-600" />
              <h4 className="text-xs font-semibold text-slate-800 uppercase tracking-wider">
                179 Notice Preview (Notice {previewIdx + 1} of {selectedRecords.length})
              </h4>
            </div>

            {selectedRecords.length > 1 && (
              <div className="flex items-center gap-1.5 text-xs">
                <button
                  type="button"
                  disabled={previewIdx === 0}
                  onClick={() => setPreviewIdx(p => p - 1)}
                  className="p-1 rounded border border-slate-200 hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
                <span className="font-mono text-slate-600 px-1">
                  Serial {currentPreviewRecord.serial} (Report #{currentPreviewRecord.reportNo || 'NA'})
                </span>
                <button
                  type="button"
                  disabled={previewIdx >= selectedRecords.length - 1}
                  onClick={() => setPreviewIdx(p => p + 1)}
                  className="p-1 rounded border border-slate-200 hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>

          {/* Clean Preview Document Box */}
          <div className="p-4 bg-slate-50/70 border border-slate-200 rounded text-xs space-y-3 font-serif text-slate-800">
            <div className="text-center font-bold text-slate-900 border-b border-slate-200 pb-2">
              NOTICE UNDER SECTION 179 BHARTIYA NAGARIK SURAKSHA SANHITA, 2023
            </div>

            <div className="flex justify-between font-mono text-[11px] pt-1">
              <span>
                Memo No:{' '}
                <strong className="text-slate-900 font-semibold font-mono">
                  {getMemoNoForIndex(previewIdx)}/2026-Cyber-BHM
                </strong>
              </span>
              <span>Date: {date || '__________'}</span>
            </div>

            <div className="pt-1 space-y-1">
              <div className="font-bold text-slate-900">To,</div>
              <div className="pl-4 font-sans font-semibold text-slate-900 whitespace-pre-line">
                {getEffectiveRecord(currentPreviewRecord).name || (
                  <span className="text-amber-700 italic bg-amber-50 px-1 rounded">
                    [Addressee Name missing - Click below to enter]
                  </span>
                )}
              </div>
              <div className="pl-4 font-sans text-slate-700 whitespace-pre-line">
                {getEffectiveRecord(currentPreviewRecord).address || (
                  <span className="text-amber-700 italic bg-amber-50 px-1 rounded">
                    [Full Address missing - Click below to enter]
                  </span>
                )}
              </div>
              <div className="pl-4 font-sans text-slate-700">
                PS: <span className="font-semibold">{cleanPoliceStationName(getEffectiveRecord(currentPreviewRecord).ps) || getEffectiveRecord(currentPreviewRecord).ps || '—'}</span>
              </div>
              {/* Prominent Through line preview */}
              <div className="pl-4 pt-1">
                <span className="font-sans font-semibold text-slate-900 bg-slate-200/80 px-2.5 py-1 rounded inline-block text-xs border border-slate-300">
                  Through: <strong className="text-slate-900">{cleanPoliceStationName(getEffectiveRecord(currentPreviewRecord).ps) ? `O.C., ${cleanPoliceStationName(getEffectiveRecord(currentPreviewRecord).ps)} PS` : 'O.C., concerned PS'}</strong>
                </span>
              </div>
            </div>

            <div className="pt-2 text-slate-700 font-sans leading-relaxed text-[11px] border-t border-slate-200">
              <p>
                <span className="font-semibold">Sub:</span> Notice for attendance and examination in connection with Cyber Tipline Report No.{' '}
                <span className="font-mono font-bold text-slate-900 bg-slate-100 px-1 rounded">
                  {currentPreviewRecord.reportNo || '__________'}
                </span>.
              </p>
              <p className="mt-1">
                <span className="font-semibold">Ref:</span> GDE No.{' '}
                <span className="font-mono font-semibold">{gdeNo || '[GDE No]'}</span> dated{' '}
                <span className="font-mono">{gdeDate || '[GDE Date]'}</span> of Birbhum Cyber Crime PS.
              </p>
            </div>

            <div className="pt-2 flex justify-end font-sans text-[11px] text-slate-600 border-t border-slate-200">
              <div className="text-right space-y-0.5">
                <div>Investigating Officer: <span className="font-semibold text-slate-900">{ioName || 'SI Asif Ikbal'}</span></div>
                {ioMobile && <div>Mobile: <span className="font-mono">{ioMobile}</span></div>}
                <div>Police Station: <span className="font-semibold">Birbhum Cyber Crime PS</span></div>
              </div>
            </div>

            {/* Quick manual correction toggle for current preview record */}
            <div className="mt-2 pt-2 border-t border-dashed border-slate-300 font-sans text-[11px] bg-white p-2.5 rounded">
              <span className="font-semibold text-slate-700 block mb-1.5">
                Manual Verification & Edit for Serial {currentPreviewRecord.serial} (if extracted SDR needs correction):
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <input
                  type="text"
                  placeholder="Person Name"
                  value={manualOverrides[currentPreviewRecord.serial]?.name ?? currentPreviewRecord.extractedName}
                  onChange={e => updateCurrentRecordOverride('name', e.target.value)}
                  className="px-2 py-1 border border-slate-300 rounded text-slate-900 text-[11px]"
                />
                <input
                  type="text"
                  placeholder="Full Address"
                  value={manualOverrides[currentPreviewRecord.serial]?.address ?? currentPreviewRecord.extractedAddress}
                  onChange={e => updateCurrentRecordOverride('address', e.target.value)}
                  className="px-2 py-1 border border-slate-300 rounded text-slate-900 text-[11px]"
                />
                <input
                  type="text"
                  placeholder="Police Station (e.g. Murarai)"
                  value={manualOverrides[currentPreviewRecord.serial]?.ps ?? currentPreviewRecord.ps}
                  onChange={e => updateCurrentRecordOverride('ps', e.target.value)}
                  className="px-2 py-1 border border-slate-300 rounded text-slate-900 text-[11px]"
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div className="pt-2 flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-slate-200">
        <div className="text-xs text-slate-500">
          Ready to generate {selectedRecords.length} document{selectedRecords.length === 1 ? '' : 's'}.
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          {!notice179 && (
            <button
              type="button"
              onClick={onOpenTemplates}
              className="w-full sm:w-auto px-4 py-2 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded border border-slate-300 inline-flex items-center justify-center gap-1.5 transition-colors"
            >
              <Upload className="w-3.5 h-3.5" />
              <span>Add 179 Master Template</span>
            </button>
          )}

          <button
            type="button"
            disabled={!notice179 || selectedRecords.length === 0 || isGenerating}
            onClick={handleGenerate}
            className="w-full sm:w-auto px-5 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 disabled:bg-slate-300 disabled:cursor-not-allowed rounded shadow-xs inline-flex items-center justify-center gap-2 transition-colors"
          >
            {isGenerating ? (
              <>
                <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                <span>Generating {selectedRecords.length} Notice(s)...</span>
              </>
            ) : (
              <>
                <FileText className="w-3.5 h-3.5" />
                <span>Generate {selectedRecords.length} Notice(s)</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Generated Documents List */}
      {generatedDocs.length > 0 && (
        <div className="mt-4 pt-4 border-t border-slate-200 space-y-2.5">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <span className="text-xs font-semibold text-slate-800">
              Generated 179 Notices ({generatedDocs.length})
            </span>
            {generatedDocs.length > 1 && (
              <button
                type="button"
                onClick={handleDownloadAllZip}
                className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded transition-colors"
              >
                <FolderArchive className="w-3.5 h-3.5 text-slate-600" />
                <span>Download All as ZIP</span>
              </button>
            )}
          </div>

          <div className="divide-y divide-slate-100 border border-slate-200 rounded bg-slate-50/50 max-h-60 overflow-y-auto">
            {generatedDocs.map((doc, idx) => (
              <div
                key={doc.id}
                className="p-2.5 flex items-center justify-between text-xs hover:bg-white transition-colors"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <FileText className="w-4 h-4 text-slate-500 shrink-0" />
                  <span className="truncate font-mono text-slate-800">{doc.filename}</span>
                </div>
                <div className="flex items-center gap-1.5 shrink-0 ml-2">
                  <button
                    type="button"
                    onClick={() => handleOpenDoc(doc)}
                    className="px-2 py-1 rounded border border-slate-200 bg-white hover:bg-slate-50 text-[11px] font-medium text-slate-700 inline-flex items-center gap-1"
                    title="Open document directly in device app"
                  >
                    <ExternalLink className="w-3 h-3 text-slate-500" />
                    <span>Open</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => triggerDownload(doc.blob, doc.filename)}
                    className="px-2 py-1 rounded bg-slate-900 hover:bg-slate-800 text-white text-[11px] font-medium inline-flex items-center gap-1"
                    title="Download DOCX"
                  >
                    <Download className="w-3 h-3" />
                    <span>Download</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
