import React, { useRef, useState } from 'react';
import { X, Upload, Check, Trash2, RefreshCw, FileText, AlertCircle } from 'lucide-react';
import {
  saveMasterTemplate,
  removeMasterTemplate,
  StoredMasterTemplate,
} from '../utils/templateStorage';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  notice179: StoredMasterTemplate | null;
  requisition: StoredMasterTemplate | null;
  onTemplatesChanged: () => void;
}

export const TemplateManagerModal: React.FC<Props> = ({
  isOpen,
  onClose,
  notice179,
  requisition,
  onTemplatesChanged,
}) => {
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [activeSlot, setActiveSlot] = useState<'179' | 'REQUISITION' | null>(null);

  const fileInputRef179 = useRef<HTMLInputElement>(null);
  const fileInputRefReq = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleFileSelected = async (
    type: '179' | 'REQUISITION',
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.toLowerCase().endsWith('.docx')) {
      setErrorMsg('Only .docx files are accepted.');
      if (e.target) e.target.value = '';
      return;
    }

    setErrorMsg(null);
    try {
      await saveMasterTemplate(type, file);
      onTemplatesChanged();
    } catch (err: unknown) {
      console.error(err);
      setErrorMsg((err as Error).message || 'Failed to save master template.');
    } finally {
      if (e.target) e.target.value = '';
    }
  };

  const handleRemove = async (type: '179' | 'REQUISITION') => {
    try {
      await removeMasterTemplate(type);
      onTemplatesChanged();
    } catch (err: unknown) {
      console.error(err);
      setErrorMsg((err as Error).message || 'Failed to remove master template.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
      <div className="w-full max-w-lg rounded-lg bg-white p-5 shadow-xl border border-slate-200">
        {/* Modal Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-200">
          <h2 className="text-sm font-semibold text-slate-900">
            Master Templates
          </h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 p-1 rounded"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {errorMsg && (
          <div className="mt-3 p-2.5 rounded bg-red-50 border border-red-200 text-xs text-red-800 flex items-center gap-1.5">
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        <input
          ref={fileInputRef179}
          type="file"
          accept=".docx"
          className="hidden"
          onChange={e => handleFileSelected('179', e)}
        />
        <input
          ref={fileInputRefReq}
          type="file"
          accept=".docx"
          className="hidden"
          onChange={e => handleFileSelected('REQUISITION', e)}
        />

        <div className="mt-4 space-y-4">
          {/* SLOT 1: 179 BNSS Notice */}
          <div className="p-4 rounded-lg border border-slate-200 bg-slate-50/60">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-slate-900">
                1. 179 BNSS Notice
              </span>
              {notice179 && (
                <span className="text-[11px] font-medium text-emerald-700 flex items-center gap-1">
                  <Check className="w-3.5 h-3.5" />
                  Master Loaded
                </span>
              )}
            </div>

            {!notice179 ? (
              <div className="mt-2">
                <button
                  type="button"
                  onClick={() => fileInputRef179.current?.click()}
                  className="px-3.5 py-1.5 bg-slate-900 text-white rounded text-xs font-medium hover:bg-slate-800 transition flex items-center gap-1.5"
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>Upload Master DOCX</span>
                </button>
              </div>
            ) : (
              <div className="mt-2 space-y-2.5">
                <div className="flex items-center gap-2 p-2 bg-white rounded border border-slate-200">
                  <FileText className="w-4 h-4 text-slate-500 shrink-0" />
                  <span className="text-xs font-mono text-slate-800 truncate">
                    {notice179.name}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => fileInputRef179.current?.click()}
                    className="px-2.5 py-1 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded hover:bg-slate-50 flex items-center gap-1"
                  >
                    <RefreshCw className="w-3 h-3" />
                    <span>Replace</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRemove('179')}
                    className="px-2.5 py-1 text-xs font-medium text-red-600 hover:text-red-700 hover:bg-red-50 rounded flex items-center gap-1 transition"
                  >
                    <Trash2 className="w-3 h-3" />
                    <span>Remove</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* SLOT 2: CAF / CDR / SDR Requisition */}
          <div className="p-4 rounded-lg border border-slate-200 bg-slate-50/60">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-slate-900">
                2. CAF / CDR / SDR Requisition
              </span>
              {requisition && (
                <span className="text-[11px] font-medium text-emerald-700 flex items-center gap-1">
                  <Check className="w-3.5 h-3.5" />
                  Master Loaded
                </span>
              )}
            </div>

            {!requisition ? (
              <div className="mt-2">
                <button
                  type="button"
                  onClick={() => fileInputRefReq.current?.click()}
                  className="px-3.5 py-1.5 bg-slate-900 text-white rounded text-xs font-medium hover:bg-slate-800 transition flex items-center gap-1.5"
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>Upload Master DOCX</span>
                </button>
              </div>
            ) : (
              <div className="mt-2 space-y-2.5">
                <div className="flex items-center gap-2 p-2 bg-white rounded border border-slate-200">
                  <FileText className="w-4 h-4 text-slate-500 shrink-0" />
                  <span className="text-xs font-mono text-slate-800 truncate">
                    {requisition.name}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => fileInputRefReq.current?.click()}
                    className="px-2.5 py-1 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded hover:bg-slate-50 flex items-center gap-1"
                  >
                    <RefreshCw className="w-3 h-3" />
                    <span>Replace</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRemove('REQUISITION')}
                    className="px-2.5 py-1 text-xs font-medium text-red-600 hover:text-red-700 hover:bg-red-50 rounded flex items-center gap-1 transition"
                  >
                    <Trash2 className="w-3 h-3" />
                    <span>Remove</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Modal Footer */}
        <div className="mt-5 pt-3 border-t border-slate-200 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-900 text-white rounded text-xs font-medium hover:bg-slate-800 transition"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
