import JSZip from 'jszip';
import { GeneratedDoc } from '../types';

/**
 * Triggers a file download in the browser.
 */
export function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

/**
 * Attempts to open the generated DOCX in the device's available Word/document application.
 * Uses Web Share API (which natively presents "Open in Microsoft Word", "Open in Office", etc.)
 * Fallback to direct blob open / download trigger.
 */
export async function openDocumentInDeviceApp(blob: Blob, filename: string): Promise<boolean> {
  const file = new File([blob], filename, {
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  });

  // Try Web Share API (supported in mobile and desktop browsers for native app handoff)
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({
        files: [file],
        title: filename,
        text: 'NCMEC Requisition Document',
      });
      return true;
    } catch (err: unknown) {
      if ((err as Error).name !== 'AbortError') {
        console.warn('Web Share API error:', err);
      }
    }
  }

  // Fallback: Open blob URL in a new tab or trigger save
  const url = URL.createObjectURL(blob);
  const win = window.open(url, '_blank');
  if (!win) {
    // If popup blocked, trigger standard download
    triggerDownload(blob, filename);
  }
  return false;
}

/**
 * Package multiple generated documents into a single ZIP file for "Download All".
 */
export async function createZipFromDocuments(
  docs: GeneratedDoc[],
  zipFilename: string
): Promise<Blob> {
  const zip = new JSZip();

  for (const doc of docs) {
    zip.file(doc.filename, doc.blob);
  }

  return await zip.generateAsync({ type: 'blob' });
}
