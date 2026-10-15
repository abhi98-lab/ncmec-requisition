import JSZip from 'jszip';
import { RegisterRecord, Notice179Config, RequisitionConfig, FIXED_CASE_GIST } from '../types';
import { extractAllMobileNumbers } from './phoneUtils';

/**
 * Escapes regex special characters.
 */
function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Builds placeholder search patterns for a given key.
 * Supports:
 * - {{KEY}} or {{ KEY }}
 * - <<KEY>> or «KEY» (Word Mail Merge style)
 * - {KEY}
 * - [KEY]
 * - <KEY>
 *
 * NOTE: Bare word replacement (e.g. \bKEY\b) is ONLY allowed for keys
 * containing an underscore (like MEMO_NO, GDE_NO, IO_NAME, REPORT_NO).
 * Generic English words like NAME, DATE, PS, ADDRESS are NEVER bare-replaced,
 * preventing accidental replacement of document headings, labels, or "Cyber Crime PS".
 */
function getPlaceholderPatterns(key: string): RegExp[] {
  const escaped = escapeRegExp(key);
  const patterns: RegExp[] = [
    new RegExp(`\\{\\{\\s*${escaped}\\s*\\}\\}`, 'g'),
    new RegExp(`<<\\s*${escaped}\\s*>>`, 'g'),
    new RegExp(`«\\s*${escaped}\\s*»`, 'g'),
    new RegExp(`\\{${escaped}\\}`, 'g'),
    new RegExp(`\\[${escaped}\\]`, 'g'),
    new RegExp(`<${escaped}>`, 'g'),
  ];

  // Only allow bare word replacement if the key contains an underscore.
  // This safely handles identifier tokens like MEMO_NO, GDE_NO, IO_NAME, REPORT_NO
  // while strictly avoiding regular English words like DATE, NAME, PS, ADDRESS.
  if (key.includes('_')) {
    patterns.push(new RegExp(`\\b${escaped}\\b`, 'g'));
  }

  return patterns;
}

/**
 * Sets text content on a Word XML text node (<w:t>) while strictly preserving
 * whitespace rules required by Microsoft Word OpenXML.
 *
 * Microsoft Word requires xml:space="preserve" whenever a <w:t> contains
 * leading space, trailing space, or multiple words separated by whitespace.
 * Without this attribute, Word's XML parser collapses and trims whitespace.
 */
export function setRunText(tNode: Element, text: string): void {
  tNode.textContent = text;
  if (text && /[\s\u00A0]/.test(text)) {
    try {
      tNode.setAttributeNS('http://www.w3.org/XML/1998/namespace', 'xml:space', 'preserve');
    } catch {
      tNode.setAttribute('xml:space', 'preserve');
    }
  } else if (!text) {
    tNode.removeAttribute('xml:space');
  }
}

/**
 * Universal whitespace preservation pass across all <w:t> elements in a Word XML document.
 * Ensures that all master runs that contain leading/trailing/internal whitespace
 * have xml:space="preserve" explicitly present, guaranteeing that Microsoft Word
 * will never strip or collapse spaces anywhere in the document.
 */
export function ensureAllTextNodesPreserveSpace(xmlDoc: Document): void {
  const allTNodes = Array.from(xmlDoc.getElementsByTagName('w:t'));
  for (const t of allTNodes) {
    const text = t.textContent;
    if (text && /[\s\u00A0]/.test(text)) {
      try {
        t.setAttributeNS('http://www.w3.org/XML/1998/namespace', 'xml:space', 'preserve');
      } catch {
        t.setAttribute('xml:space', 'preserve');
      }
    }
  }
}

/**
 * Inserts replacement text into a <w:t> element.
 * If replacement contains newlines (\n), generates <w:t> and <w:br/> elements inside parent <w:r>
 * so that line breaks in the mobile list preserve paragraph styles and maintain the one-page layout.
 *
 * Never trims text. Always ensures xml:space="preserve" on all generated runs with whitespace.
 */
function insertContentIntoRun(
  tNode: Element,
  textBefore: string,
  replacement: string,
  textAfter: string,
  xmlDoc: Document
): void {
  const parentRun = tNode.parentElement;
  if (!parentRun || !replacement.includes('\n')) {
    const combined = textBefore + replacement + textAfter;
    setRunText(tNode, combined);
    return;
  }

  const lines = replacement.split('\n');
  const frag = xmlDoc.createDocumentFragment();

  // First segment with textBefore
  const firstT = xmlDoc.createElementNS('http://schemas.openxmlformats.org/wordprocessingml/2006/main', 'w:t');
  setRunText(firstT, textBefore + lines[0]);
  frag.appendChild(firstT);

  for (let i = 1; i < lines.length; i++) {
    const br = xmlDoc.createElementNS('http://schemas.openxmlformats.org/wordprocessingml/2006/main', 'w:br');
    frag.appendChild(br);

    const nextT = xmlDoc.createElementNS('http://schemas.openxmlformats.org/wordprocessingml/2006/main', 'w:t');
    const segText = lines[i] + (i === lines.length - 1 ? textAfter : '');
    setRunText(nextT, segText);
    frag.appendChild(nextT);
  }

  parentRun.replaceChild(frag, tNode);
}

/**
 * Precision placeholder replacer that operates ONLY on the exact placeholder runs/characters.
 * Unrelated runs, paragraphs, styles, alignments, fonts, and images in the master DOCX
 * remain completely untouched.
 *
 * Preserves all original whitespace and sets xml:space="preserve" where required.
 */
function replaceAcrossParagraphRuns(
  p: Element,
  replacements: Record<string, string>,
  xmlDoc: Document
): boolean {
  let hasModified = false;

  for (const [key, rawValue] of Object.entries(replacements)) {
    const value = rawValue ?? '';
    const patterns = getPlaceholderPatterns(key);

    for (const pattern of patterns) {
      let keepSearching = true;

      while (keepSearching) {
        keepSearching = false;

        const textNodes = Array.from(p.getElementsByTagName('w:t'));
        if (textNodes.length === 0) break;

        let fullText = '';
        const ranges: { node: Element; start: number; end: number }[] = [];

        for (const tNode of textNodes) {
          const text = tNode.textContent || '';
          const start = fullText.length;
          fullText += text;
          ranges.push({ node: tNode, start, end: fullText.length });
        }

        pattern.lastIndex = 0;
        const match = pattern.exec(fullText);
        if (!match) break;

        const matchStart = match.index;
        const matchEnd = matchStart + match[0].length;

        // Locate start node and end node in run ranges
        let startNodeIdx = -1;
        let endNodeIdx = -1;

        for (let i = 0; i < ranges.length; i++) {
          if (startNodeIdx === -1 && matchStart >= ranges[i].start && matchStart < ranges[i].end) {
            startNodeIdx = i;
          }
          if (matchEnd > ranges[i].start && matchEnd <= ranges[i].end) {
            endNodeIdx = i;
            break;
          }
        }

        if (startNodeIdx !== -1 && endNodeIdx !== -1) {
          hasModified = true;
          keepSearching = true; // Search again in case pattern occurs multiple times
          const startRange = ranges[startNodeIdx];
          const endRange = ranges[endNodeIdx];

          const textBefore = (startRange.node.textContent || '').substring(0, matchStart - startRange.start);
          const textAfter = (endRange.node.textContent || '').substring(matchEnd - endRange.start);

          if (startNodeIdx === endNodeIdx) {
            // Both start and end in the same run: replace ONLY the matched portion
            insertContentIntoRun(startRange.node, textBefore, value, textAfter, xmlDoc);
          } else {
            // Placeholder spans across multiple runs:
            // 1. Put (textBefore + value) into start node
            insertContentIntoRun(startRange.node, textBefore, value, '', xmlDoc);
            // 2. Clear intermediate nodes strictly inside the placeholder
            for (let j = startNodeIdx + 1; j < endNodeIdx; j++) {
              ranges[j].node.textContent = '';
              ranges[j].node.removeAttribute('xml:space');
            }
            // 3. Put textAfter into end node with preserved whitespace
            setRunText(endRange.node, textAfter);
          }
        }
      }
    }
  }

  return hasModified;
}

/**
 * Replaces placeholders across all paragraphs and tables in an XML document.
 */
function processDocumentXml(xmlDoc: Document, replacements: Record<string, string>): void {
  const paragraphs = Array.from(xmlDoc.getElementsByTagName('w:p'));
  for (const p of paragraphs) {
    replaceAcrossParagraphRuns(p, replacements, xmlDoc);
  }
}

/**
 * Generate 179 BNSS Notice DOCX for a single record from the uploaded Master DOCX.
 */
export async function generate179NoticeDocx(
  templateBuffer: ArrayBuffer,
  record: RegisterRecord,
  config: Notice179Config,
  memoNo: string
): Promise<Blob> {
  const zip = await JSZip.loadAsync(templateBuffer);
  const docFile = zip.file('word/document.xml');
  if (!docFile) throw new Error('Invalid master DOCX: word/document.xml missing');

  const xmlText = await docFile.async('string');
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(xmlText, 'application/xml');

  const name = config.manualOverrides?.[record.serial]?.name ?? record.extractedName;
  const address = config.manualOverrides?.[record.serial]?.address ?? record.extractedAddress;
  const ps = config.manualOverrides?.[record.serial]?.ps ?? record.ps;

  // Replacements mapping as per prompt specifications
  const replacements: Record<string, string> = {
    // Report ID mappings
    NCMEC_TIPLINE_NO: record.reportNo || '',
    REPORT_NO: record.reportNo || '',
    CYBER_TIPLINE_REPORT_NO: record.reportNo || '',
    TIPLINE_NO: record.reportNo || '',
    'Cyber Tipline Report No.': record.reportNo || '',
    'Cyber Tipline Report No': record.reportNo || '',
    'NCMEC Tipline Report No.': record.reportNo || '',

    // Addressee details
    ADDRESSEE_NAME: name || '',
    NAME: name || '',
    FULL_ADDRESS: address || '',
    ADDRESS: address || '',
    ADDRESSEE_PS: ps || '',
    PS: ps || '',

    // Notice common fields
    MEMO_NO: memoNo || '',
    DATE: config.date || '',
    NOTICE_DATE: config.date || '',
    GDE_NO: config.gdeNo || '',
    GDE_DATE: config.gdeDate || '',
    GD_NO: config.gdeNo || '',
    GD_DATE: config.gdeDate || '',
    IO_NAME: config.ioName || '',
    IO_MOBILE: config.ioMobile || '',
    PS_AUTHORITY: config.psAuthority || ps || '',
    POLICE_STATION: config.psAuthority || ps || '',

    // Record details
    MOBILE_NO: record.mobiles?.[0] || '',
    MOBILE_NOS: record.mobiles?.join(', ') || '',
    INCIDENT_DATE: record.incidentDate || '',
  };

  processDocumentXml(xmlDoc, replacements);
  ensureAllTextNodesPreserveSpace(xmlDoc);

  // Also process headers & footers
  for (const filename of Object.keys(zip.files)) {
    if (filename.startsWith('word/header') || filename.startsWith('word/footer')) {
      const hFile = zip.file(filename);
      if (hFile) {
        const hText = await hFile.async('string');
        const hDoc = parser.parseFromString(hText, 'application/xml');
        processDocumentXml(hDoc, replacements);
        ensureAllTextNodesPreserveSpace(hDoc);
        const serializer = new XMLSerializer();
        zip.file(filename, serializer.serializeToString(hDoc));
      }
    }
  }

  const serializer = new XMLSerializer();
  const updatedXml = serializer.serializeToString(xmlDoc);
  zip.file('word/document.xml', updatedXml);

  return await zip.generateAsync({
    type: 'blob',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  });
}

/**
 * Generate CAF / CDR / SDR Requisition DOCX for selected records from the uploaded Master DOCX.
 * GROUP BASED: ONE single requisition containing all selected NCMEC Report IDs.
 */
export async function generateRequisitionDocx(
  templateBuffer: ArrayBuffer,
  selectedRecords: RegisterRecord[],
  config: RequisitionConfig
): Promise<Blob> {
  const zip = await JSZip.loadAsync(templateBuffer);
  const docFile = zip.file('word/document.xml');
  if (!docFile) throw new Error('Invalid master DOCX: word/document.xml missing');

  const xmlText = await docFile.async('string');
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(xmlText, 'application/xml');

  // 1. Collect Report IDs in original register order
  const reportIds = selectedRecords
    .map(r => r.reportNo)
    .filter(Boolean);

  // 2. Build Case / G.D. Reference in exact requested style:
  // Ref: Birbhum Cyber Crime PS GDE No. [GDE_NO] dtd. [GDE_DATE] in c/w Cyber NCMEC Tipline Report No. [REPORT_1], [REPORT_2]...
  const psPrefix = config.psName ? config.psName.trim() : 'Birbhum Cyber Crime PS';
  const reportsListStr = reportIds.join(', ');
  const fullCaseRef = `Ref: ${psPrefix} GDE No. ${config.gdeNo} dtd. ${config.gdeDate} in c/w Cyber NCMEC Tipline Report No. ${reportsListStr}`;

  // 3. Collect ALL mobile numbers linked to ALL selected Report IDs
  // Deduplicate only if exact same mobile is repeated within the group
  // Ensure every number is strictly 10 digits and country code 91 is stripped
  const seenNumbers = new Set<string>();
  const targetNumbers: string[] = [];

  for (const rec of selectedRecords) {
    const candidateStrings: string[] = [];
    if (rec.mobiles && rec.mobiles.length > 0) {
      candidateStrings.push(...rec.mobiles);
    }
    if (rec.rawMobiles) {
      candidateStrings.push(rec.rawMobiles);
    }

    for (const raw of candidateStrings) {
      const extracted = extractAllMobileNumbers(raw);
      for (const mob of extracted) {
        if (mob.length === 10 && /^[6-9]\d{9}$/.test(mob) && !seenNumbers.has(mob)) {
          seenNumbers.add(mob);
          targetNumbers.push(mob);
        }
      }
    }
  }

  // 4. Format serial-wise mobile list as required:
  // Example:
  // 1) 8348242256
  // 2) 9735368034
  // ...
  const serialMobileList = targetNumbers.map((num, i) => `${i + 1}) ${num}`).join('\n');

  // Complete points of data text:
  // CDR, CAF, SDR of-
  // 1) ...
  // w.e.f. [FROM_DATE] to [TO_DATE]
  const fullPointsOfData = `${config.requisitionType} of-\n${serialMobileList}\nw.e.f. ${config.fromDate} to ${config.toDate}`;

  // 5. Build full replacements dictionary
  const replacements: Record<string, string> = {
    // Case reference mappings
    CASE_REFERENCE: fullCaseRef,
    CASE_REF: fullCaseRef,
    'Case / G.D. Reference': fullCaseRef,
    'Case Reference': fullCaseRef,
    GDE_REFERENCE: fullCaseRef,

    // Gist mapping (fixed official gist)
    CASE_GIST: FIXED_CASE_GIST,
    GIST: FIXED_CASE_GIST,
    'Case Gist': FIXED_CASE_GIST,

    // Requisition Type
    REQUISITION_TYPE: config.requisitionType,
    POINTS_OF_DATA: fullPointsOfData,

    // Target Mobile list
    MOBILE_LIST: serialMobileList,
    MOBILE_NUMBER: serialMobileList,
    MOBILE_NUMBERS: serialMobileList,
    TARGET_NUMBERS: serialMobileList,
    TARGET_MOBILE_NUMBERS: serialMobileList,

    // Dates
    FROM_DATE: config.fromDate,
    TO_DATE: config.toDate,
    DATE: new Date().toLocaleDateString('en-GB'),
    GDE_NO: config.gdeNo,
    GDE_DATE: config.gdeDate,

    // Officer details
    IO_NAME: config.ioName || 'SI Asif Ikbal of Cyber Crime PS',
    REQUISITIONING_OFFICER: config.ioName || 'SI Asif Ikbal of Cyber Crime PS',
    PS_NAME: psPrefix,
  };

  processDocumentXml(xmlDoc, replacements);

  // If the master template has a table with template rows:
  // e.g. <w:tr> containing {{ROW_MOBILE}} or {{MOBILE_NO}} or {{ROW_SL}}
  const rows = Array.from(xmlDoc.getElementsByTagName('w:tr'));
  let templateRow: Element | null = null;
  let templateTable: Element | null = null;

  for (const row of rows) {
    const text = row.textContent || '';
    if (text.includes('ROW_MOBILE') || text.includes('ROW_SL') || text.includes('{{MOBILE_NO}}')) {
      templateRow = row;
      templateTable = row.parentElement;
      break;
    }
  }

  if (templateRow && templateTable) {
    const parent = templateTable;
    for (let i = 0; i < targetNumbers.length; i++) {
      const mob = targetNumbers[i];
      const newRow = templateRow.cloneNode(true) as Element;

      const rowReplacements: Record<string, string> = {
        ROW_SL: String(i + 1),
        ROW_MOBILE: mob,
        MOBILE_NO: mob,
        REQUISITION_TYPE: config.requisitionType,
        FROM_DATE: config.fromDate,
        TO_DATE: config.toDate,
      };

      const dummyDoc = parser.parseFromString('<root></root>', 'application/xml');
      dummyDoc.documentElement.appendChild(newRow);
      processDocumentXml(dummyDoc, rowReplacements);
      ensureAllTextNodesPreserveSpace(dummyDoc);

      parent.insertBefore(newRow, templateRow);
    }
    parent.removeChild(templateRow);
  }

  ensureAllTextNodesPreserveSpace(xmlDoc);

  // Also check header / footer XML files
  for (const filename of Object.keys(zip.files)) {
    if (filename.startsWith('word/header') || filename.startsWith('word/footer')) {
      const hFile = zip.file(filename);
      if (hFile) {
        const hText = await hFile.async('string');
        const hDoc = parser.parseFromString(hText, 'application/xml');
        processDocumentXml(hDoc, replacements);
        ensureAllTextNodesPreserveSpace(hDoc);
        const serializer = new XMLSerializer();
        zip.file(filename, serializer.serializeToString(hDoc));
      }
    }
  }

  const serializer = new XMLSerializer();
  const updatedXml = serializer.serializeToString(xmlDoc);
  zip.file('word/document.xml', updatedXml);

  return await zip.generateAsync({
    type: 'blob',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  });
}
