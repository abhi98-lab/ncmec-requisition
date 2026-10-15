/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { RegisterRecord } from './types';
import { Header } from './components/Header';
import { Step1Register } from './components/Step1Register';
import { Step2SelectRecords } from './components/Step2SelectRecords';
import { Step3DocType, SelectedDocType } from './components/Step3DocType';
import { Notice179Generator } from './components/Notice179Generator';
import { RequisitionGenerator } from './components/RequisitionGenerator';
import { TemplateManagerModal } from './components/TemplateManagerModal';
import { TemplateStatusArea } from './components/TemplateStatusArea';
import { OfflineIndicator } from './components/OfflineIndicator';
import {
  getAllMasterTemplatesStatus,
  StoredMasterTemplate,
} from './utils/templateStorage';

export default function App() {
  const [allRecords, setAllRecords] = useState<RegisterRecord[]>([]);
  const [fileName, setFileName] = useState<string | null>(null);

  // Master templates stored locally in IndexedDB
  const [notice179Template, setNotice179Template] = useState<StoredMasterTemplate | null>(null);
  const [requisitionTemplate, setRequisitionTemplate] = useState<StoredMasterTemplate | null>(null);

  // Step 2 selection inputs
  const [fromSerial, setFromSerial] = useState<string>('1');
  const [toSerial, setToSerial] = useState<string>('');
  const [specificSerials, setSpecificSerials] = useState<string>('');

  // Step 3 document type
  const [selectedDocType, setSelectedDocType] = useState<SelectedDocType>('179');

  // Master template manager modal
  const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false);

  // Load stored templates from IndexedDB
  const refreshTemplates = useCallback(async () => {
    const status = await getAllMasterTemplatesStatus();
    setNotice179Template(status.notice179);
    setRequisitionTemplate(status.requisition);
  }, []);

  useEffect(() => {
    refreshTemplates();
  }, [refreshTemplates]);

  // Handle register loaded
  const handleRecordsLoaded = (records: RegisterRecord[], name: string) => {
    setAllRecords(records);
    setFileName(name);
    setFromSerial('1');
    setToSerial(String(Math.min(records.length, 10)));
    setSpecificSerials('');
  };

  const handleResetRegister = () => {
    setAllRecords([]);
    setFileName(null);
    setFromSerial('1');
    setToSerial('');
    setSpecificSerials('');
  };

  // Compute selected records
  const selectedRecords = useMemo(() => {
    if (allRecords.length === 0) return [];

    const selectedSet = new Set<number>();

    // Process range if provided
    const fromNum = parseInt(fromSerial.trim(), 10);
    const toNum = parseInt(toSerial.trim(), 10);

    if (!isNaN(fromNum) && !isNaN(toNum) && fromNum > 0 && toNum >= fromNum) {
      for (let s = fromNum; s <= toNum; s++) {
        selectedSet.add(s);
      }
    } else if (!isNaN(fromNum) && isNaN(toNum) && !specificSerials.trim()) {
      selectedSet.add(fromNum);
    }

    // Process specific serials: e.g. "1,4,7,12"
    if (specificSerials.trim()) {
      const tokens = specificSerials.split(/[,\s]+/).map(t => parseInt(t.trim(), 10));
      for (const tok of tokens) {
        if (!isNaN(tok) && tok > 0) {
          selectedSet.add(tok);
        }
      }
    }

    return allRecords
      .filter(r => selectedSet.has(r.serial))
      .sort((a, b) => a.serial - b.serial);
  }, [allRecords, fromSerial, toSerial, specificSerials]);

  const handleSelectAll = () => {
    if (allRecords.length === 0) return;
    setFromSerial('1');
    setToSerial(String(allRecords.length));
    setSpecificSerials('');
  };

  const isRegisterLoaded = allRecords.length > 0;

  return (
    <div className="min-h-screen bg-slate-100/70 text-slate-900 flex flex-col font-sans antialiased">
      <Header onOpenTemplates={() => setIsTemplateModalOpen(true)} />

      <main className="flex-1 max-w-4xl w-full mx-auto px-4 py-6 space-y-4">
        {/* Template Status Area on Main Screen */}
        <TemplateStatusArea
          notice179={notice179Template}
          requisition={requisitionTemplate}
          onOpenTemplates={() => setIsTemplateModalOpen(true)}
        />

        {/* Step 1: Upload Register */}
        <Step1Register
          records={allRecords}
          fileName={fileName}
          onRecordsLoaded={handleRecordsLoaded}
          onResetRegister={handleResetRegister}
        />

        {/* Step 2: Select Records */}
        <Step2SelectRecords
          totalRecords={allRecords.length}
          allRecords={allRecords}
          selectedRecords={selectedRecords}
          fromSerial={fromSerial}
          toSerial={toSerial}
          specificSerials={specificSerials}
          onFromChange={setFromSerial}
          onToChange={setToSerial}
          onSpecificChange={setSpecificSerials}
          onSelectAll={handleSelectAll}
          disabled={!isRegisterLoaded}
        />

        {/* Step 3: Document Type */}
        <Step3DocType
          selectedType={selectedDocType}
          onSelectType={setSelectedDocType}
          disabled={!isRegisterLoaded || selectedRecords.length === 0}
        />

        {/* Generator / Missing Template for selected type */}
        {isRegisterLoaded && selectedRecords.length > 0 && selectedDocType === '179' && (
          <Notice179Generator
            selectedRecords={selectedRecords}
            notice179={notice179Template}
            onOpenTemplates={() => setIsTemplateModalOpen(true)}
          />
        )}

        {isRegisterLoaded && selectedRecords.length > 0 && selectedDocType === 'REQUISITION' && (
          <RequisitionGenerator
            selectedRecords={selectedRecords}
            requisition={requisitionTemplate}
            onOpenTemplates={() => setIsTemplateModalOpen(true)}
          />
        )}
      </main>

      <footer className="border-t border-slate-200/80 bg-white py-3 text-center text-[11px] text-slate-500">
        <div className="max-w-4xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-1">
          <span>NCMEC Requisition • Internal Document Utility</span>
          <span>100% Client-Side Processing • Stored Locally in IndexedDB</span>
        </div>
      </footer>

      {/* Master Templates Management Modal */}
      <TemplateManagerModal
        isOpen={isTemplateModalOpen}
        onClose={() => setIsTemplateModalOpen(false)}
        notice179={notice179Template}
        requisition={requisitionTemplate}
        onTemplatesChanged={refreshTemplates}
      />

      {/* Offline Mode Indicator */}
      <OfflineIndicator />
    </div>
  );
}
