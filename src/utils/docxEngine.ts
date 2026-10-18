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
 * Cleans a police station string to extract just the station name (e.g. "Murarai", "Bolpur", "Sainthia").
 * Strips prefixes ("Through", "O.C.,", "Birbhum Cyber Crime PS") and suffixes ("PS", "Police Station").
 * Prevents any accidental duplication (e.g. "Murarai Murarai PS").
 */
export function cleanPoliceStationName(rawPs: string): string {
  if (!rawPs) return '';
  let ps = rawPs.trim();
  // Remove leading prefixes
  ps = ps.replace(/^(?:Through|THROUGH)\s*:?\s*/i, '');
  ps = ps.replace(/^(?:O\.?C\.?|Officer[- ]in[- ]charge|Inspector[- ]in[- ]charge|I\.?C\.?)[,\s]*/i, '');
  ps = ps.replace(/^Birbhum\s+Cyber\s+Crime\s+PS\s*/i, '');
  // Remove trailing police station suffixes
  ps = ps.replace(/\s*(?:Police\s*Station|P\.?S\.?)\s*$/i, '');
  ps = ps.replace(/^[,.\s-]+|[,.\s-]+$/g, '').trim();
  return ps;
}

/**
 * Returns the exact Through line format required:
 * "Through O.C., [RECORD_PS] PS"
 */
export function formatThroughLine(rawPs: string): string {
  const clean = cleanPoliceStationName(rawPs);
  if (!clean) return 'Through O.C., concerned PS';
  return `Through O.C., ${clean} PS`;
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
 * preventing accidental replacement of document headings, labels, or fixed master text.
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
 */
export function setRunText(tNode: Element, text: string): void {
  tNode.textContent = text;
  if (text && /[\s\u00A0]/.test(text)) {
    try {
      tNode.setAttribute('xml:space', 'preserve');
    } catch {
      // Fallback
    }
  } else if (!text) {
    tNode.removeAttribute('xml:space');
  }
}

/**
 * Inserts replacement text into a <w:t> element.
 * If replacement contains newlines (\n), generates <w:t> and <w:br/> elements inside parent <w:r>
 * so that line breaks in address or mobile lists preserve paragraph styles.
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
 * If a paragraph contains NO placeholder matches, it is NOT modified at all.
 */
function replaceAcrossParagraphRuns(
  p: Element,
  replacements: Record<string, string>,
  xmlDoc: Document
): boolean {
  const textNodes = Array.from(p.getElementsByTagName('w:t'));
  if (textNodes.length === 0) return false;

  let fullText = '';
  for (const tNode of textNodes) {
    fullText += tNode.textContent || '';
  }

  // Pre-check: Does this paragraph contain any candidate placeholder?
  let hasAnyMatch = false;
  for (const key of Object.keys(replacements)) {
    const patterns = getPlaceholderPatterns(key);
    if (patterns.some(pat => pat.test(fullText))) {
      hasAnyMatch = true;
      break;
    }
  }

  // If no placeholder is found in this paragraph, leave it completely untouched!
  if (!hasAnyMatch) {
    return false;
  }

  let hasModified = false;

  for (const [key, rawValue] of Object.entries(replacements)) {
    const value = rawValue ?? '';
    const patterns = getPlaceholderPatterns(key);

    for (const pattern of patterns) {
      let keepSearching = true;

      while (keepSearching) {
        keepSearching = false;

        const currentTextNodes = Array.from(p.getElementsByTagName('w:t'));
        if (currentTextNodes.length === 0) break;

        let currentFullText = '';
        const ranges: { node: Element; start: number; end: number }[] = [];

        for (const tNode of currentTextNodes) {
          const text = tNode.textContent || '';
          const start = currentFullText.length;
          currentFullText += text;
          ranges.push({ node: tNode, start, end: currentFullText.length });
        }

        pattern.lastIndex = 0;
        const match = pattern.exec(currentFullText);
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
 * Replaces placeholders across all paragraphs in an XML document.
 * Unrelated paragraphs remain completely untouched.
 */
function processDocumentXml(xmlDoc: Document, replacements: Record<string, string>): void {
  const paragraphs = Array.from(xmlDoc.getElementsByTagName('w:p'));
  for (const p of paragraphs) {
    replaceAcrossParagraphRuns(p, replacements, xmlDoc);
  }
}

/**
 * Dedicated handler for the Through transmission line in 179 Notice.
 * Ensures the Through line always uses:
 * "Through O.C., [RECORD_PS] PS"
 *
 * Preserves paragraph alignment, font, font size, bold, indentation, and margins.
 */
function applyThroughLine(xmlDoc: Document, recordPs: string): void {
  const targetThroughLine = formatThroughLine(recordPs);
  const paragraphs = Array.from(xmlDoc.getElementsByTagName('w:p'));

  for (const p of paragraphs) {
    const textNodes = Array.from(p.getElementsByTagName('w:t'));
    const fullText = textNodes.map(t => t.textContent || '').join('').trim();

    // Check if this paragraph is the Through line (e.g. "Through ...")
    if (/^Through\b/i.test(fullText)) {
      const runs = Array.from(p.getElementsByTagName('w:r'));
      if (runs.length > 0) {
        const firstRun = runs[0];
        // Remove all other runs in this paragraph
        for (let i = 1; i < runs.length; i++) {
          p.removeChild(runs[i]);
        }
        // Remove existing children of firstRun except w:rPr (preserving font, size, style)
        const rChildren = Array.from(firstRun.childNodes);
        for (const child of rChildren) {
          if (child.nodeName !== 'w:rPr') {
            firstRun.removeChild(child);
          }
        }
        // Add new w:t node with preserved space
        const t = xmlDoc.createElementNS('http://schemas.openxmlformats.org/wordprocessingml/2006/main', 'w:t');
        setRunText(t, targetThroughLine);
        firstRun.appendChild(t);
      }
      return;
    }
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
  const rawPs = config.manualOverrides?.[record.serial]?.ps ?? record.ps;
  const cleanPs = cleanPoliceStationName(rawPs);
  const psDisplay = cleanPs || 'concerned';

  // Suffix "/2026-Cyber-BHM" is already present in the master DOCX.
  // memoNo MUST be strictly the numeric portion (e.g. "159", "160") to prevent duplication.
  const numericMemo = memoNo.replace(/\/?\d{4}-Cyber-BHM.*$/i, '').trim() || memoNo.trim();

  // Replacements mapping
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
    ADDRESSEE_PS: psDisplay,
    PS: psDisplay,

    // Through line authority mappings
    THROUGH: `O.C., ${psDisplay} PS`,
    THROUGH_PS: `O.C., ${psDisplay} PS`,
    PS_AUTHORITY: `O.C., ${psDisplay} PS`,
    RECORD_PS: psDisplay,

    // Memo number (strictly numeric to prevent duplication with /2026-Cyber-BHM)
    MEMO_NO: numericMemo,
    'MEMO NO': numericMemo,
    'MEMO NO.': numericMemo,

    // Notice common fields
    DATE: config.date || '',
    NOTICE_DATE: config.date || '',
    GDE_NO: config.gdeNo || '',
    GDE_DATE: config.gdeDate || '',
    GD_NO: config.gdeNo || '',
    GD_DATE: config.gdeDate || '',
    IO_NAME: config.ioName || '',
    IO_MOBILE: config.ioMobile || '',

    // Record details
    MOBILE_NO: record.mobiles?.[0] || '',
    MOBILE_NOS: record.mobiles?.join(', ') || '',
    INCIDENT_DATE: record.incidentDate || '',
  };

  // 1. Process Through line specifically to ensure: Through O.C., [RECORD_PS] PS
  applyThroughLine(xmlDoc, psDisplay);

  // 2. Precision placeholder replacement on paragraphs containing placeholders
  processDocumentXml(xmlDoc, replacements);

  // 3. Also process headers & footers if they contain placeholders
  for (const filename of Object.keys(zip.files)) {
    if (filename.startsWith('word/header') || filename.startsWith('word/footer')) {
      const hFile = zip.file(filename);
      if (hFile) {
        const hText = await hFile.async('string');
        const hDoc = parser.parseFromString(hText, 'application/xml');
        processDocumentXml(hDoc, replacements);
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
  records: RegisterRecord[],
  config: RequisitionConfig
): Promise<Blob> {
  const zip = await JSZip.loadAsync(templateBuffer);
  const docFile = zip.file('word/document.xml');
  if (!docFile) throw new Error('Invalid master DOCX: word/document.xml missing');

  const xmlText = await docFile.async('string');
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(xmlText, 'application/xml');

  // Collect unique report IDs
  const reportNos = Array.from(
    new Set(records.map(r => r.reportNo).filter((no): no is string => Boolean(no && no.trim())))
  );
  const reportNosFormatted = reportNos.join(', ');

  // Collect all unique mobile numbers across all selected records
  const allMobiles: string[] = [];
  for (const r of records) {
    if (r.mobiles && r.mobiles.length > 0) {
      for (const m of r.mobiles) {
        if (m && !allMobiles.includes(m)) {
          allMobiles.push(m);
        }
      }
    }
  }

  const mobileList = allMobiles.join('\n');
  const mobileListCsv = allMobiles.join(', ');
  const psPrefix = config.psName ? config.psName.trim() : 'Birbhum Cyber Crime PS';

  const replacements: Record<string, string> = {
    REQ_TYPE: config.requisitionType,
    REQUISITION_TYPE: config.requisitionType,
    TYPE: config.requisitionType,
    REPORT_NOS: reportNosFormatted,
    REPORT_NO: reportNosFormatted,
    REPORT_IDS: reportNosFormatted,
    NCMEC_TIPLINE_NO: reportNosFormatted,
    TIPLINE_NO: reportNosFormatted,
    MOBILE_LIST: mobileList,
    MOBILE_NO: mobileList,
    MOBILE_NOS: mobileListCsv,
    PHONE_NUMBER: mobileList,
    PS_NAME: psPrefix,
    POLICE_STATION: psPrefix,
    GDE_NO: config.gdeNo,
    GDE_DATE: config.gdeDate,
    FROM_DATE: config.fromDate,
    TO_DATE: config.toDate,
    IO_NAME: config.ioName,
    CASE_GIST: config.caseGist || FIXED_CASE_GIST,
    GIST: config.caseGist || FIXED_CASE_GIST,
  };

  processDocumentXml(xmlDoc, replacements);

  for (const filename of Object.keys(zip.files)) {
    if (filename.startsWith('word/header') || filename.startsWith('word/footer')) {
      const hFile = zip.file(filename);
      if (hFile) {
        const hText = await hFile.async('string');
        const hDoc = parser.parseFromString(hText, 'application/xml');
        processDocumentXml(hDoc, replacements);
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
