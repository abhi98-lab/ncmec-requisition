import React, { useState, useMemo } from 'react';
import {
  PhoneCall,
  Download,
  ExternalLink,
  CheckCircle2,
  AlertCircle,
  Hash,
  Eye,
  Upload,
} from 'lucide-react';
import {
  RegisterRecord,
  RequisitionConfig,
  RequisitionType,
  GeneratedDoc,
  FIXED_CASE_GIST,
} from '../types';
import { StoredMasterTemplate } from '../utils/templateStorage';
import { generateRequisitionDocx } from '../utils/docxEngine';
import { triggerDownload, openDocumentInDeviceApp } from '../utils/fileUtils';
import { extractAllMobileNumbers } from '../utils/phoneUtils';

interface Props {
  selectedRecords: RegisterRecord[];
  requisition: StoredMasterTemplate | null;
  onOpenTemplates: () => void;
}

const REQUISITION_OPTIONS: RequisitionType[] = [
  'CAF',
  'CDR',
  'SDR',
  'CAF + CDR',
  'CAF + SDR',
  'CDR + SDR',
  'CAF + CDR + SDR',
];

export const RequisitionGenerator: React.FC<Props> = ({
  selectedRecords,
  requisition,
  onOpenTemplates,
}) => {
  // Form common fields
  const [requisitionType, setRequisitionType] = useState<RequisitionType>('CAF + CDR + SDR');
  const [psName, setPsName] = useState<string>('Birbhum Cyber Crime PS');
  const [gdeNo, setGdeNo] = useState<string>('');
  const [gdeDate, setGdeDate] = useState<string>(new Date().toLocaleDateString('en-GB'));
  const [fromDate, setFromDate] = useState<string>('');
  const [toDate, setToDate] = useState<string>('');
  const [ioName, setIoName] = useState<string>('SI Asif Ikbal of Cyber Crime PS');

  // Generation status
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [downloadStatus, setDownloadStatus] = useState<'idle' | 'downloading' | 'downloaded'>('idle');
  const [generatedDoc, setGeneratedDoc] = useState<GeneratedDoc | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Collect target mobile numbers:
  // - Preserve ALL mobile numbers across ALL selected reports
  // - Leading 91 removed when valid Indian 10-digit number
  // - Deduplicate only if exact same number repeated within group
  const { targetMobiles, reportIds } = useMemo(() => {
    const numbers: string[] = [];
    const seen = new Set<string>();
    const rIds: string[] = [];

    for (const rec of selectedRecords) {
      if (rec.reportNo && !rIds.includes(rec.reportNo)) {
        rIds.push(rec.reportNo);
      }

      const candidateStrings: string[] = [];
      if (rec.mobiles && rec.mobiles.length > 0) {
        candidateStrings.push(...rec.mobiles);
      }
      if (rec.rawMobiles) {
        candidateStrings.push(rec.rawMobiles);
      }

      for (const raw of candidateStrings) {
        const extracted = extractAllMobileNumbers(raw);
        for (const mob of extracted) {
          if (mob.length === 10 && /^[6-9]\d{9}$/.test(mob) && !seen.has(mob)) {
            seen.add(mob);
            numbers.push(mob);
          }
        }
      }
    }

    return { targetMobiles: numbers, reportIds: rIds };
  }, [selectedRecords]);

  // Formatted Case / G.D. Reference in requested style:
  // Ref: Birbhum Cyber Crime PS GDE No. [GDE_NO] dtd. [GDE_DATE] in c/w Cyber NCMEC Tipline Report No. [REPORT_1], [REPORT_2]...
  const computedCaseReference = useMemo(() => {
    const ps = psName.trim() || 'Birbhum Cyber Crime PS';
    const reportsStr = reportIds.join(', ') || '[Selected Report IDs]';
    const gNo = gdeNo.trim() || '[GDE_NO]';
    const gDate = gdeDate.trim() || '[GDE_DATE]';
    return `Ref: ${ps} GDE No. ${gNo} dtd. ${gDate} in c/w Cyber NCMEC Tipline Report No. ${reportsStr}`;
  }, [psName, gdeNo, gdeDate, reportIds]);

  // Validation
  const validationError = useMemo(() => {
    if (!requisition) return 'Please add the master template first.';
    if (selectedRecords.length === 0) return 'No records selected.';
    if (targetMobiles.length === 0) return 'No mobile numbers found in selected records.';
    if (!gdeNo.trim()) return 'Please enter GDE No. before generating.';
    if (!gdeDate.trim()) return 'Please enter GDE Date before generating.';
    if (!fromDate.trim() || !toDate.trim()) return 'Please specify From Date and To Date for period required.';
    return null;
  }, [requisition, selectedRecords, targetMobiles, gdeNo, gdeDate, fromDate, toDate]);

  const handleGenerate = async () => {
    if (validationError) {
      setErrorMsg(validationError);
      return;
    }
    if (!requisition) return;

    setErrorMsg(null);
    setIsGenerating(true);
    setDownloadStatus('downloading');

    try {
      const config: RequisitionConfig = {
        requisitionType,
        psName,
        gdeNo,
        gdeDate,
        fromDate,
        toDate,
        ioName,
        caseGist: FIXED_CASE_GIST,
      };

      // Generate single group-based DOCX from actual master DOCX in IndexedDB
      const docBlob = await generateRequisitionDocx(requisition.buffer, selectedRecords, config);
      const safeReqName = requisitionType.replace(/\s*\+\s*/g, '_');
      const filename = `Requisition_${safeReqName}_${selectedRecords.length}_Reports.docx`;

      const doc: GeneratedDoc = {
        id: `REQ-${Date.now()}`,
        filename,
        blob: docBlob,
        type: 'REQUISITION',
        recordCount: selectedRecords.length,
        createdAt: new Date(),
      };

      setGeneratedDoc(doc);

      // Trigger immediate download
      triggerDownload(docBlob, filename);

      setDownloadStatus('downloaded');
    } catch (err: unknown) {
      console.error(err);
      setErrorMsg((err as Error).message || 'Failed to generate Requisition Document.');
      setDownloadStatus('idle');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleOpenDoc = async () => {
    if (!generatedDoc) return;
    await openDocumentInDeviceApp(generatedDoc.blob, generatedDoc.filename);
  };

  return (
    <div className="bg-white border border-slate-200 rounded-lg p-5 shadow-xs space-y-5">
      <div className="flex items-start justify-between flex-wrap gap-2">
        <div>
          <h3 className="text-sm font-semibold text-slate-900 tracking-tight">
            CAF / CDR / SDR Requisition Generator
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Group-based requisition: Generates ONE master document containing all {selectedRecords.length} selected NCMEC Report IDs and {targetMobiles.length} linked target mobile number(s).
          </p>
        </div>

        {requisition ? (
          <span className="text-[11px] font-medium text-emerald-800 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded flex items-center gap-1">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            <span>Master Loaded: {requisition.name}</span>
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

      {/* Selectable Requisition Type */}
      <div>
        <label className="block text-xs font-semibold text-slate-800 uppercase tracking-wider mb-2">
          Points of Data Required
        </label>
        <div className="flex flex-wrap gap-1.5">
          {REQUISITION_OPTIONS.map(opt => (
            <button
              key={opt}
              type="button"
              onClick={() => setRequisitionType(opt)}
              className={`px-3 py-1.5 rounded text-xs font-medium transition ${
                requisitionType === opt
                  ? 'bg-slate-900 text-white font-semibold shadow-xs'
                  : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200'
              }`}
            >
              {opt}
            </button>
          ))}
        </div>
      </div>

      {/* Common Editable Fields */}
      <div className="border border-slate-200 rounded-lg p-4 bg-slate-50/50 space-y-3.5">
        <h4 className="text-xs font-semibold text-slate-800 uppercase tracking-wider">
          Requisition Details
        </h4>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5 text-xs">
          <div>
            <label className="block text-slate-700 font-medium mb-1">
              Police Station Name / Unit
            </label>
            <input
              type="text"
              placeholder="Birbhum Cyber Crime PS"
              value={psName}
              onChange={e => setPsName(e.target.value)}
              className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded text-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-800"
            />
          </div>

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

          <div>
            <label className="block text-slate-700 font-medium mb-1">
              From Date (Period w.e.f.) <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              placeholder="DD/MM/YYYY"
              value={fromDate}
              onChange={e => setFromDate(e.target.value)}
              className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded text-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-800"
            />
          </div>

          <div>
            <label className="block text-slate-700 font-medium mb-1">
              To Date (Period to) <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              placeholder="DD/MM/YYYY"
              value={toDate}
              onChange={e => setToDate(e.target.value)}
              className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded text-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-800"
            />
          </div>

          <div>
            <label className="block text-slate-700 font-medium mb-1">
              Requisitioning Officer
            </label>
            <input
              type="text"
              placeholder="SI Asif Ikbal of Cyber Crime PS"
              value={ioName}
              onChange={e => setIoName(e.target.value)}
              className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded text-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-800"
            />
          </div>
        </div>

        {/* Case Gist Display (Fixed Official Text) */}
        <div className="pt-2 border-t border-slate-200">
          <label className="block text-[11px] font-semibold text-slate-700 uppercase tracking-wider mb-1">
            Case Gist (Fixed Official NCMEC Requisition Gist)
          </label>
          <div className="p-2.5 rounded bg-white border border-slate-200 text-xs text-slate-700 leading-relaxed font-sans">
            "{FIXED_CASE_GIST}"
          </div>
        </div>
      </div>

      {/* Requisition Document Preview Before Generation */}
      <div className="border border-slate-200 rounded-lg p-4 bg-white">
        <div className="flex items-center gap-2 mb-3">
          <Eye className="w-3.5 h-3.5 text-slate-600" />
          <h4 className="text-xs font-semibold text-slate-800 uppercase tracking-wider">
            Requisition Document Preview
          </h4>
        </div>

        <div className="p-4 bg-slate-50/70 border border-slate-200 rounded text-xs space-y-3 font-serif text-slate-800">
          <div className="text-center font-bold text-slate-900 border-b border-slate-200 pb-2">
            REQUISITION FOR {requisitionType} UNDER SECTION 94 BNSS, 2023
          </div>

          <div className="p-2.5 bg-white rounded border border-slate-200 font-mono text-[11px] text-slate-900 leading-relaxed">
            <span className="font-bold text-slate-800">Case Reference:</span>
            <div className="mt-1 font-sans text-xs text-slate-900">{computedCaseReference}</div>
          </div>

          <div className="space-y-1">
            <span className="font-bold font-sans text-xs text-slate-900">
              Selected NCMEC Report IDs ({reportIds.length}):
            </span>
            <div className="font-mono text-[11px] text-slate-700 bg-white p-2 rounded border border-slate-200">
              {reportIds.join(', ')}
            </div>
          </div>

          {/* Target Mobile Numbers serial-wise */}
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="font-bold font-sans text-xs text-slate-900">
                Points of Data Required: {requisitionType} of-
              </span>
              <span className="text-[11px] font-mono text-slate-500">
                {targetMobiles.length} target numbers (Serial 1 to {targetMobiles.length})
              </span>
            </div>

            <div className="bg-white p-2.5 rounded border border-slate-200 max-h-36 overflow-y-auto font-mono text-[11px] text-slate-900 space-y-0.5">
              {targetMobiles.map((num, i) => (
                <div key={i}>
                  {i + 1}) {num}
                </div>
              ))}
            </div>

            <div className="text-[11px] font-sans font-semibold text-slate-700 pt-1">
              w.e.f. <span className="font-mono">{fromDate || '[From Date]'}</span> to <span className="font-mono">{toDate || '[To Date]'}</span>
            </div>
          </div>

          <div className="pt-2 flex justify-between items-end border-t border-slate-200 font-sans text-[11px]">
            <div>
              <span className="text-slate-500">Fixed Gist Applied: </span>
              <span className="text-emerald-700 font-semibold">✓ Standard NCMEC</span>
            </div>
            <div className="text-right">
              <div>Requisitioning Officer:</div>
              <div className="font-bold text-slate-900">{ioName || 'SI Asif Ikbal of Cyber Crime PS'}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Action / Master Template Missing Check */}
      <div className="pt-1">
        {!requisition ? (
          <div className="p-3.5 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-900 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
              <span>Please add the master template first.</span>
            </div>
            <button
              type="button"
              onClick={onOpenTemplates}
              className="px-3 py-1.5 bg-amber-800 text-white rounded text-xs font-medium hover:bg-amber-900 transition flex items-center gap-1.5 self-start sm:self-auto"
            >
              <Upload className="w-3.5 h-3.5" />
              <span>Upload Master DOCX</span>
            </button>
          </div>
        ) : (
          <div>
            {downloadStatus === 'idle' && (
              <button
                type="button"
                onClick={handleGenerate}
                disabled={isGenerating || !!validationError}
                className="w-full sm:w-auto px-6 py-2.5 bg-slate-900 text-white rounded-md text-xs font-semibold hover:bg-slate-800 transition shadow-xs flex items-center justify-center gap-2 disabled:opacity-50"
              >
                <PhoneCall className="w-4 h-4" />
                <span>Generate DOCX (1 Requisition for {selectedRecords.length} Reports)</span>
              </button>
            )}

            {downloadStatus === 'downloading' && (
              <div className="p-4 rounded-lg bg-slate-50 border border-slate-200 flex items-center gap-3">
                <div className="w-5 h-5 border-2 border-slate-900 border-t-transparent rounded-full animate-spin shrink-0" />
                <span className="text-xs font-semibold text-slate-800">Downloading...</span>
              </div>
            )}

            {downloadStatus === 'downloaded' && generatedDoc && (
              <div className="p-4 rounded-lg bg-emerald-50/70 border border-emerald-200 space-y-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                    <div>
                      <h4 className="text-xs font-bold text-slate-900">Downloaded ✓</h4>
                      <p className="text-[11px] text-slate-600 font-mono">
                        {generatedDoc.filename}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleOpenDoc}
                      className="px-4 py-2 bg-slate-900 text-white rounded text-xs font-semibold hover:bg-slate-800 transition flex items-center gap-1.5 shadow-xs"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      <span>Open</span>
                    </button>
                    <button
                      onClick={() => triggerDownload(generatedDoc.blob, generatedDoc.filename)}
                      className="px-3.5 py-2 bg-white border border-slate-300 text-slate-800 rounded text-xs font-medium hover:bg-slate-50 transition flex items-center gap-1.5"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Download Again</span>
                    </button>
                  </div>
                </div>

                <div className="pt-1 flex justify-end">
                  <button
                    type="button"
                    onClick={() => setDownloadStatus('idle')}
                    className="text-[11px] text-slate-500 hover:text-slate-800 underline"
                  >
                    Modify Fields & Generate Again
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
