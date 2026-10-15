import React from 'react';
import { X, Eye } from 'lucide-react';
import { RegisterRecord } from '../types';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  selectedRecords: RegisterRecord[];
  onUpdateRecord?: (index: number, updated: Partial<RegisterRecord>) => void;
}

export const PreviewModal: React.FC<Props> = ({
  isOpen,
  onClose,
  selectedRecords,
  onUpdateRecord,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-3 sm:p-6 backdrop-blur-xs">
      <div className="w-full max-w-4xl max-h-[90vh] flex flex-col rounded-lg bg-white shadow-2xl border border-slate-200">
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between shrink-0 bg-slate-50 rounded-t-lg">
          <div className="flex items-center gap-2">
            <Eye className="w-4 h-4 text-slate-700" />
            <h3 className="text-sm font-semibold text-slate-900">
              Selected Records Preview ({selectedRecords.length})
            </h3>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 p-1 rounded hover:bg-slate-200/50 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Table */}
        <div className="p-4 overflow-y-auto overflow-x-auto flex-1">
          {selectedRecords.length === 0 ? (
            <div className="text-center py-8 text-xs text-slate-500">
              No records selected. Please adjust your range or specific serial numbers.
            </div>
          ) : (
            <div className="border border-slate-200 rounded-md overflow-hidden">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-100 border-b border-slate-200 font-semibold text-slate-700">
                  <tr>
                    <th className="py-2.5 px-3 w-14 text-center">Serial</th>
                    <th className="py-2.5 px-3 w-28">Report No.</th>
                    <th className="py-2.5 px-3 w-36">Mobile No(s)</th>
                    <th className="py-2.5 px-3">Name / SDR</th>
                    <th className="py-2.5 px-3 w-28">PS</th>
                    <th className="py-2.5 px-3 w-24">Incident Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 text-slate-800">
                  {selectedRecords.map(rec => (
                    <tr key={rec.serial} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-2 px-3 text-center font-mono font-medium text-slate-500">
                        {rec.serial}
                      </td>
                      <td className="py-2 px-3 font-mono font-medium text-slate-900">
                        {rec.reportNo || '—'}
                      </td>
                      <td className="py-2 px-3 font-mono text-slate-900">
                        {rec.mobiles.length > 0 ? (
                          <div className="space-y-0.5">
                            {rec.mobiles.map((m, idx) => (
                              <span
                                key={idx}
                                className="inline-block bg-slate-100 text-slate-800 px-1.5 py-0.5 rounded text-[11px] font-semibold border border-slate-200 mr-1"
                              >
                                {m}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-slate-400 italic">None</span>
                        )}
                      </td>
                      <td className="py-2 px-3 max-w-xs">
                        <div className="font-semibold text-slate-900">
                          {rec.extractedName || <span className="text-slate-400 italic">No name</span>}
                        </div>
                        <div className="text-[11px] text-slate-500 line-clamp-2 mt-0.5" title={rec.sdr}>
                          {rec.extractedAddress || rec.sdr || '—'}
                        </div>
                      </td>
                      <td className="py-2 px-3 text-slate-700 font-medium">
                        {rec.ps || '—'}
                      </td>
                      <td className="py-2 px-3 text-slate-600 font-mono text-[11px]">
                        {rec.incidentDate || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-slate-200 flex justify-end shrink-0 bg-slate-50 rounded-b-lg">
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-900 text-white rounded text-xs font-medium hover:bg-slate-800 transition"
          >
            Close Preview
          </button>
        </div>
      </div>
    </div>
  );
};
