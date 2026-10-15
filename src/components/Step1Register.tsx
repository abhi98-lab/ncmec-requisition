import React, { useRef, useState } from 'react';
import { Upload, CheckCircle2, FileSpreadsheet, RefreshCw, AlertCircle } from 'lucide-react';
import { RegisterRecord } from '../types';
import { parseDocxRegister } from '../utils/registerParser';

interface Props {
  records: RegisterRecord[];
  fileName: string | null;
  onRecordsLoaded: (records: RegisterRecord[], fileName: string) => void;
  onResetRegister: () => void;
}

export const Step1Register: React.FC<Props> = ({
  records,
  fileName,
  onRecordsLoaded,
  onResetRegister,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  const processFile = async (file: File) => {
    if (!file.name.toLowerCase().endsWith('.docx')) {
      setErrorMsg('Please upload a valid Word document (.docx).');
      return;
    }
    setErrorMsg(null);
    setIsParsing(true);
    try {
      const parsedRecords = await parseDocxRegister(file);
      if (parsedRecords.length === 0) {
        throw new Error('No valid records found in register table.');
      }
      onRecordsLoaded(parsedRecords, file.name);
    } catch (err: unknown) {
      console.error(err);
      setErrorMsg((err as Error).message || 'Failed to parse register document.');
    } finally {
      setIsParsing(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processFile(file);
    }
    // reset input
    if (e.target) e.target.value = '';
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      processFile(file);
    }
  };

  const isLoaded = records.length > 0;

  return (
    <section className="bg-white border border-slate-200 rounded-lg p-5 shadow-xs">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="w-5 h-5 rounded-full bg-slate-100 text-slate-700 text-xs font-semibold flex items-center justify-center border border-slate-300">
            1
          </span>
          <h2 className="text-sm font-semibold text-slate-900 tracking-tight">
            Register
          </h2>
        </div>

        {isLoaded && (
          <button
            onClick={() => fileInputRef.current?.click()}
            className="text-xs text-slate-600 hover:text-slate-900 flex items-center gap-1 font-medium underline-offset-2 hover:underline"
          >
            <RefreshCw className="w-3 h-3" />
            <span>Replace Register</span>
          </button>
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept=".docx"
        className="hidden"
        onChange={handleFileChange}
      />

      {errorMsg && (
        <div className="mb-3 p-2.5 rounded bg-red-50 border border-red-200 text-xs text-red-800 flex items-center gap-1.5">
          <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {!isLoaded ? (
        <div
          onDragOver={e => {
            e.preventDefault();
            setIsDragOver(true);
          }}
          onDragLeave={() => setIsDragOver(false)}
          onDrop={handleDrop}
          className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
            isDragOver
              ? 'border-slate-800 bg-slate-50'
              : 'border-slate-200 hover:border-slate-300 bg-slate-50/50'
          }`}
        >
          <div className="max-w-xs mx-auto flex flex-col items-center">
            <div className="w-10 h-10 rounded-full bg-white border border-slate-200 flex items-center justify-center text-slate-700 mb-3 shadow-xs">
              <Upload className="w-5 h-5" />
            </div>

            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isParsing}
              className="px-4 py-2 bg-slate-900 text-white rounded-md text-xs font-semibold hover:bg-slate-800 transition disabled:opacity-50"
            >
              {isParsing ? 'Parsing Register…' : 'Upload NCMEC Register'}
            </button>

            <p className="text-[11px] text-slate-500 mt-2">
              Select or drop source DOCX register file (e.g. NCMEC REGISTER-2.docx)
            </p>
          </div>
        </div>
      ) : (
        <div className="bg-slate-50 rounded-lg p-4 border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-600 shrink-0">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-semibold text-slate-900">
                  Register Loaded
                </span>
                <span className="text-emerald-700 font-bold text-xs">✓</span>
              </div>
              <p className="text-[11px] text-slate-600 mt-0.5 truncate max-w-xs sm:max-w-md">
                {fileName || 'NCMEC Register'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-center">
            <div className="px-3 py-1 bg-white border border-slate-200 rounded text-xs font-semibold text-slate-800">
              Total Records: {records.length}
            </div>
          </div>
        </div>
      )}
    </section>
  );
};
