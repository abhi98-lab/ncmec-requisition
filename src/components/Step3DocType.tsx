import React from 'react';
import { FileText, PhoneCall, Check } from 'lucide-react';

export type SelectedDocType = '179' | 'REQUISITION' | null;

interface Props {
  selectedType: SelectedDocType;
  onSelectType: (type: '179' | 'REQUISITION') => void;
  disabled?: boolean;
}

export const Step3DocType: React.FC<Props> = ({
  selectedType,
  onSelectType,
  disabled = false,
}) => {
  return (
    <section className={`bg-white border border-slate-200 rounded-lg p-5 shadow-xs ${disabled ? 'opacity-60 pointer-events-none' : ''}`}>
      <div className="flex items-center gap-2 mb-4">
        <span className="w-5 h-5 rounded-full bg-slate-100 text-slate-700 text-xs font-semibold flex items-center justify-center border border-slate-300">
          3
        </span>
        <h2 className="text-sm font-semibold text-slate-900 tracking-tight">
          Document Type
        </h2>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
        {/* Card 1: 179 BNSS NOTICE */}
        <button
          type="button"
          onClick={() => onSelectType('179')}
          className={`text-left p-4 rounded-lg border transition relative flex items-start gap-3.5 ${
            selectedType === '179'
              ? 'border-slate-900 bg-slate-50/80 ring-1 ring-slate-900'
              : 'border-slate-200 hover:border-slate-300 bg-white'
          }`}
        >
          <div
            className={`w-9 h-9 rounded-md flex items-center justify-center shrink-0 ${
              selectedType === '179'
                ? 'bg-slate-900 text-white'
                : 'bg-slate-100 text-slate-700'
            }`}
          >
            <FileText className="w-4 h-4" />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-slate-900 tracking-tight">
                179 BNSS NOTICE
              </h3>
              {selectedType === '179' && (
                <span className="w-4 h-4 rounded-full bg-slate-900 text-white flex items-center justify-center text-[10px]">
                  <Check className="w-3 h-3 stroke-[3]" />
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-500 mt-1">
              Section 179 BNSS (crpc 160) witness/suspect examination notice based on 179_Notice_Master_FINAL_v2.docx
            </p>
          </div>
        </button>

        {/* Card 2: CAF / CDR / SDR */}
        <button
          type="button"
          onClick={() => onSelectType('REQUISITION')}
          className={`text-left p-4 rounded-lg border transition relative flex items-start gap-3.5 ${
            selectedType === 'REQUISITION'
              ? 'border-slate-900 bg-slate-50/80 ring-1 ring-slate-900'
              : 'border-slate-200 hover:border-slate-300 bg-white'
          }`}
        >
          <div
            className={`w-9 h-9 rounded-md flex items-center justify-center shrink-0 ${
              selectedType === 'REQUISITION'
                ? 'bg-slate-900 text-white'
                : 'bg-slate-100 text-slate-700'
            }`}
          >
            <PhoneCall className="w-4 h-4" />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-slate-900 tracking-tight">
                CAF / CDR / SDR
              </h3>
              {selectedType === 'REQUISITION' && (
                <span className="w-4 h-4 rounded-full bg-slate-900 text-white flex items-center justify-center text-[10px]">
                  <Check className="w-3 h-3 stroke-[3]" />
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-500 mt-1">
              Telecom TSP requisition for CAF/CDR/SDR based on CDR_CAF_SDR_MASTER_WITH_CASE_GIST.docx
            </p>
          </div>
        </button>
      </div>
    </section>
  );
};
