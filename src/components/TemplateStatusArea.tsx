import React from 'react';
import { StoredMasterTemplate } from '../utils/templateStorage';

interface Props {
  notice179: StoredMasterTemplate | null;
  requisition: StoredMasterTemplate | null;
  onOpenTemplates: () => void;
}

export const TemplateStatusArea: React.FC<Props> = ({
  notice179,
  requisition,
  onOpenTemplates,
}) => {
  return (
    <div className="bg-white border border-slate-200 rounded-lg p-3.5 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
      <div className="flex items-center gap-2">
        <span className="font-semibold text-slate-800 tracking-tight">Templates</span>
      </div>

      <div className="flex items-center gap-6 text-xs">
        <div className="flex items-center gap-2">
          <span className="text-slate-600 font-medium">179 BNSS</span>
          {notice179 ? (
            <span className="text-emerald-700 font-semibold flex items-center gap-0.5">
              <span>✓</span> Ready
            </span>
          ) : (
            <span className="text-slate-400 font-normal">Not Added</span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <span className="text-slate-600 font-medium">CAF/CDR/SDR</span>
          {requisition ? (
            <span className="text-emerald-700 font-semibold flex items-center gap-0.5">
              <span>✓</span> Ready
            </span>
          ) : (
            <span className="text-slate-400 font-normal">Not Added</span>
          )}
        </div>
      </div>

      <button
        type="button"
        onClick={onOpenTemplates}
        className="text-[11px] text-slate-600 hover:text-slate-900 font-medium underline-offset-2 hover:underline self-end sm:self-auto"
      >
        Manage Masters →
      </button>
    </div>
  );
};
