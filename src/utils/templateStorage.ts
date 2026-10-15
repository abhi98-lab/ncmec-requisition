/**
 * Template Storage utility using browser IndexedDB.
 * Securely stores the complete DOCX binaries for master templates:
 * 1. 179 BNSS Notice Master
 * 2. CAF / CDR / SDR Requisition Master
 *
 * All files remain 100% local to the browser/device.
 */

const DB_NAME = 'NcmecRequisitionDB';
const STORE_NAME = 'master_templates';
const DB_VERSION = 2;

export interface StoredMasterTemplate {
  buffer: ArrayBuffer;
  name: string;
  size: number;
  updatedAt: string;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (event) => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function saveMasterTemplate(
  type: '179' | 'REQUISITION',
  file: File
): Promise<StoredMasterTemplate> {
  const buffer = await file.arrayBuffer();
  const data: StoredMasterTemplate = {
    buffer,
    name: file.name,
    size: file.size,
    updatedAt: new Date().toISOString(),
  };

  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.put(data, type);
    tx.oncomplete = () => resolve(data);
    tx.onerror = () => reject(tx.error);
  });
}

export async function removeMasterTemplate(type: '179' | 'REQUISITION'): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.delete(type);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getMasterTemplate(
  type: '179' | 'REQUISITION'
): Promise<StoredMasterTemplate | null> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(type);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.error('Failed to read master template from IndexedDB:', err);
    return null;
  }
}

export async function getAllMasterTemplatesStatus(): Promise<{
  notice179: StoredMasterTemplate | null;
  requisition: StoredMasterTemplate | null;
}> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req1 = store.get('179');
      const req2 = store.get('REQUISITION');

      let res1: StoredMasterTemplate | null = null;
      let res2: StoredMasterTemplate | null = null;

      req1.onsuccess = () => {
        res1 = req1.result || null;
        if (req2.readyState === 'done') finish();
      };
      req2.onsuccess = () => {
        res2 = req2.result || null;
        if (req1.readyState === 'done') finish();
      };
      req1.onerror = () => reject(req1.error);
      req2.onerror = () => reject(req2.error);

      function finish() {
        resolve({
          notice179: res1,
          requisition: res2,
        });
      }
    });
  } catch {
    return {
      notice179: null,
      requisition: null,
    };
  }
}
