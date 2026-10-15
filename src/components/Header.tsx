import React from 'react';
import { PWAInstallButton } from './PWAInstallButton';
import { Settings2 } from 'lucide-react';

interface HeaderProps {
  onOpenTemplates: () => void;
}

export const Header: React.FC<HeaderProps> = ({ onOpenTemplates }) => {
  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded bg-slate-900 flex items-center justify-center text-white font-semibold text-sm">
            NR
          </div>
          <div>
            <h1 className="text-base font-semibold text-slate-900 tracking-tight leading-none">
              NCMEC Requisition
            </h1>
            <p className="text-[11px] text-slate-500 font-medium mt-0.5">
              Document Generation Utility
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={onOpenTemplates}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-300 transition-colors"
            title="Upload and manage Master DOCX templates"
          >
            <Settings2 className="w-3.5 h-3.5 text-slate-600" />
            <span>Master Templates</span>
          </button>
          <PWAInstallButton />
        </div>
      </div>
    </header>
  );
};
