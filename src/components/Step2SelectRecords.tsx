import React, { useState } from 'react';
import { Eye } from 'lucide-react';
import { RegisterRecord } from '../types';
import { PreviewModal } from './PreviewModal';

interface Props {
  totalRecords: number;
  allRecords: RegisterRecord[];
  selectedRecords: RegisterRecord[];
  fromSerial: string;
  toSerial: string;
  specificSerials: string;
  onFromChange: (val: string) => void;
  onToChange: (val: string) => void;
  onSpecificChange: (val: string) => void;
  onSelectAll: () => void;
  disabled?: boolean;
}

export const Step2SelectRecords: React.FC<Props> = ({
  totalRecords,
  allRecords,
  selectedRecords,
  fromSerial,
  toSerial,
  specificSerials,
  onFromChange,
  onToChange,
  onSpecificChange,
  onSelectAll,
  disabled = false,
}) => {
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);

  // Compute total linked mobile numbers across selected records
  const linkedMobileCount = selectedRecords.reduce((acc, rec) => {
    return acc + (rec.mobiles.length > 0 ? rec.mobiles.length : (rec.rawMobiles ? 1 : 0));
  }, 0);

  return (
    <section className={`bg-white border border-slate-200 rounded-lg p-5 shadow-xs ${disabled ? 'opacity-60 pointer-events-none' : ''}`}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="w-5 h-5 rounded-full bg-slate-100 text-slate-700 text-xs font-semibold flex items-center justify-center border border-slate-300">
            2
          </span>
          <h2 className="text-sm font-semibold text-slate-900 tracking-tight">
            Select Records
          </h2>
        </div>

        {totalRecords > 0 && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onSelectAll}
              className="text-xs text-slate-600 hover:text-slate-900 font-medium underline-offset-2 hover:underline"
            >
              Select All (1–{totalRecords})
            </button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-12 gap-3.5 items-end">
        {/* Range Fields */}
        <div className="sm:col-span-3">
          <label className="block text-xs font-medium text-slate-700 mb-1">
            From Serial
          </label>
          <input
            type="number"
            min={1}
            max={totalRecords || 1}
            placeholder="1"
            value={fromSerial}
            onChange={e => onFromChange(e.target.value)}
            disabled={disabled}
            className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-800"
          />
        </div>

        <div className="sm:col-span-3">
          <label className="block text-xs font-medium text-slate-700 mb-1">
            To Serial
          </label>
          <input
            type="number"
            min={1}
            max={totalRecords || 1}
            placeholder={String(Math.min(totalRecords || 1, 10))}
            value={toSerial}
            onChange={e => onToChange(e.target.value)}
            disabled={disabled}
            className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-800"
          />
        </div>

        {/* Specific Serials */}
        <div className="sm:col-span-6">
          <label className="block text-xs font-medium text-slate-700 mb-1 flex items-center justify-between">
            <span>Specific Serials <span className="text-slate-400 font-normal">(optional)</span></span>
            <span className="text-[11px] text-slate-400 font-mono">e.g. 1,4,7,12</span>
          </label>
          <input
            type="text"
            placeholder="1,4,7,12"
            value={specificSerials}
            onChange={e => onSpecificChange(e.target.value)}
            disabled={disabled}
            className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-800 font-mono"
          />
        </div>
      </div>

      {/* Selected Summary and Preview Action */}
      <div className="mt-4 pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 text-xs">
          <div className="flex items-center gap-1.5">
            <span className="text-slate-600">Selected Reports:</span>
            <span className="px-2 py-0.5 rounded bg-slate-900 text-white font-semibold">
              {selectedRecords.length}
            </span>
          </div>
          <span className="text-slate-300">•</span>
          <div className="flex items-center gap-1.5">
            <span className="text-slate-600">Linked Mobile Numbers:</span>
            <span className="px-2 py-0.5 rounded bg-blue-100 text-blue-900 font-semibold border border-blue-200">
              {linkedMobileCount}
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setIsPreviewOpen(true)}
          disabled={selectedRecords.length === 0}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded text-xs font-medium text-slate-800 transition disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Eye className="w-3.5 h-3.5" />
          <span>Preview Selected</span>
        </button>
      </div>

      <PreviewModal
        isOpen={isPreviewOpen}
        onClose={() => setIsPreviewOpen(false)}
        selectedRecords={selectedRecords}
      />
    </section>
  );
};
