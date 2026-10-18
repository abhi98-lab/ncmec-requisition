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
  ps = ps.replace(/^Birbhum\s+Cyber\s+Crime\s*/i, '');
  // Remove trailing police station suffixes
  ps = ps.replace(/\s*(?:Police\s*Station|P\.?S\.?)\s*$/i, '');
  ps = ps.replace(/^[,.\s-]+|[,.\s-]+$/g, '').trim();
  // Remove consecutive duplicated words (e.g. "Murarai Murarai" -> "Murarai", "Bolpur Bolpur" -> "Bolpur")
  ps = ps.replace(/\b([A-Za-z]+)\s+\1\b/gi, '$1').trim();
  // The Through authority must NOT use Birbhum Cyber Crime PS
  if (/^Birbhum\s+Cyber\s+Crime$/i.test(ps) || /^Cyber\s+Crime$/i.test(ps)) {
    return '';
  }
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
    new RegExp(`\\{\\{\\s*${escaped}\\s*\\}\\}`, 'gi'),
    new RegExp(`<<\\s*${escaped}\\s*>>`, 'gi'),
    new RegExp(`«\\s*${escaped}\\s*»`, 'gi'),
    new RegExp(`\\{${escaped}\\}`, 'gi'),
    new RegExp(`\\[${escaped}\\]`, 'gi'),
    new RegExp(`<${escaped}>`, 'gi'),
  ];

  if (key.includes('_')) {
    patterns.push(new RegExp(`\\b${escaped}\\b`, 'gi'));
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
      tNode.setAttributeNS('http://www.w3.org/XML/1998/namespace', 'xml:space', 'preserve');
      tNode.setAttribute('xml:space', 'preserve');
    } catch {
      tNode.setAttribute('xml:space', 'preserve');
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

  // Sort keys by length descending so longer placeholders are processed first
  const sortedEntries = Object.entries(replacements).sort((a, b) => b[0].length - a[0].length);

  for (const [key, rawValue] of sortedEntries) {
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

  // If this paragraph was modified, ensure any run with leading or trailing whitespace
  // has xml:space="preserve" set so Word never strips spaces between adjacent runs.
  if (hasModified) {
    const finalNodes = Array.from(p.getElementsByTagName('w:t'));
    for (const t of finalNodes) {
      if (/^\s|\s$/.test(t.textContent || '')) {
        setRunText(t, t.textContent || '');
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
 * Dedicated non-destructive handler for the Through transmission line in 179 Notice.
 * Ensures the Through line always uses:
 * "Through O.C., [RECORD_PS] PS"
 *
 * Replaces ONLY the authority text in the Through paragraph without destroying
 * runs, run properties (font, bold, color, size), indentation, margins, or whitespace.
 */
function applyThroughLine(xmlDoc: Document, recordPs: string): void {
  const cleanPs = cleanPoliceStationName(recordPs) || 'concerned';
  const targetAuthority = `O.C., ${cleanPs} PS`;
  const paragraphs = Array.from(xmlDoc.getElementsByTagName('w:p'));

  for (const p of paragraphs) {
    const textNodes = Array.from(p.getElementsByTagName('w:t'));
    const fullText = textNodes.map(t => t.textContent || '').join('');

    // Check if this paragraph is a Through line (e.g. "Through ...")
    if (/^\s*Through\b/i.test(fullText)) {
      // If the paragraph already has a template placeholder (e.g. {{THROUGH}}, {{RECORD_PS}}),
      // let the placeholder engine replace it precisely.
      if (/\{\{|\{\s*THROUGH|<<|«|\[THROUGH|\[RECORD_PS/i.test(fullText)) {
        return;
      }

      // The paragraph has static text like "Through O.C., Bolpur PS" or "Through Birbhum Cyber Crime PS"
      // or "Through: Bolpur" or "Through".
      // Replace the portion after "Through" (and optional punctuation/spaces) with targetAuthority.
      const match = fullText.match(/^(\s*Through\s*[:,-]?\s*)(.*)$/i);
      if (match) {
        const prefix = match[1];
        const oldAuthority = match[2];

        if (oldAuthority.trim() === targetAuthority.trim()) {
          // Already exact match, nothing to change
          return;
        }

        // Precision replace across the runs:
        // Find runs occupied by oldAuthority and replace with targetAuthority
        const matchStart = prefix.length;
        const matchEnd = fullText.length;

        let currentPos = 0;
        const ranges: { node: Element; start: number; end: number }[] = [];
        for (const tNode of textNodes) {
          const txt = tNode.textContent || '';
          ranges.push({ node: tNode, start: currentPos, end: currentPos + txt.length });
          currentPos += txt.length;
        }

        let startNodeIdx = -1;
        let endNodeIdx = -1;
        for (let i = 0; i < ranges.length; i++) {
          if (startNodeIdx === -1 && matchStart >= ranges[i].start && matchStart <= ranges[i].end) {
            startNodeIdx = i;
          }
          if (matchEnd >= ranges[i].start && matchEnd <= ranges[i].end) {
            endNodeIdx = i;
            break;
          }
        }

        if (startNodeIdx !== -1) {
          if (endNodeIdx === -1) endNodeIdx = ranges.length - 1;

          const startRange = ranges[startNodeIdx];
          const textBefore = (startRange.node.textContent || '').substring(0, matchStart - startRange.start);

          // Update start node with textBefore + targetAuthority
          setRunText(startRange.node, textBefore + targetAuthority);

          // Clear any subsequent runs in this paragraph that belonged to the old authority
          for (let j = startNodeIdx + 1; j <= endNodeIdx; j++) {
            setRunText(ranges[j].node, '');
          }
        }
      }
      return;
    }
  }
}

/**
 * Ensures Memo Number is formatted without duplicating suffix.
 * Handles cases where master DOCX has:
 * - Placeholders: {{MEMO_NO}} / <<MEMO_NO>> / [MEMO_NO]
 * - Static previous memo: No. 150/2026-Cyber-BHM
 * - Deduplicates any accidental repeated suffix like /2026-Cyber-BHM/2026-Cyber-BHM
 */
function applyMemoNumber(xmlDoc: Document, numericMemo: string): void {
  const paragraphs = Array.from(xmlDoc.getElementsByTagName('w:p'));

  for (const p of paragraphs) {
    const textNodes = Array.from(p.getElementsByTagName('w:t'));
    const fullText = textNodes.map(t => t.textContent || '').join('');

    // Check if this paragraph contains a memo line
    if (/(?:No\.?|Memo\s*No\.?)\s*(?:\d+|\.{2,}|_{2,}|\s*)\s*\/\s*\d{4}-Cyber/i.test(fullText)) {
      // If it contains a placeholder, let placeholder replacement handle it first
      if (/\{\{|\{\s*MEMO|<<|«|\[MEMO/i.test(fullText)) {
        continue;
      }

      // Static memo line like "No. 150/2026-Cyber-BHM"
      // Replace the number before the slash with numericMemo
      const memoRegex = /(No\.?\s*)(\d+|\.{2,}|_{2,})(\s*\/\s*\d{4}-Cyber-[A-Za-z]+)/i;
      const match = fullText.match(memoRegex);
      if (match) {
        const targetText = match[1] + numericMemo + match[3];
        // Replace in runs
        const matchStart = match.index!;
        const matchEnd = matchStart + match[0].length;

        let currentPos = 0;
        const ranges: { node: Element; start: number; end: number }[] = [];
        for (const tNode of textNodes) {
          const txt = tNode.textContent || '';
          ranges.push({ node: tNode, start: currentPos, end: currentPos + txt.length });
          currentPos += txt.length;
        }

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
          const startRange = ranges[startNodeIdx];
          const endRange = ranges[endNodeIdx];
          const textBefore = (startRange.node.textContent || '').substring(0, matchStart - startRange.start);
          const textAfter = (endRange.node.textContent || '').substring(matchEnd - endRange.start);

          setRunText(startRange.node, textBefore + targetText);
          for (let j = startNodeIdx + 1; j <= endNodeIdx; j++) {
            setRunText(ranges[j].node, j === endNodeIdx ? textAfter : '');
          }
        }
      }
    }
  }
}

/**
 * Scans all paragraphs for any repeated suffix such as:
 * /2026-Cyber-BHM/2026-Cyber-BHM -> /2026-Cyber-BHM
 */
function deduplicateMemoYearSuffix(xmlDoc: Document): void {
  const paragraphs = Array.from(xmlDoc.getElementsByTagName('w:p'));
  for (const p of paragraphs) {
    const textNodes = Array.from(p.getElementsByTagName('w:t'));
    const fullText = textNodes.map(t => t.textContent || '').join('');

    const dupRegex = /(\/\d{4}-Cyber-[A-Za-z]+)(\s*\1)+/gi;
    if (dupRegex.test(fullText)) {
      for (const t of textNodes) {
        if (t.textContent && dupRegex.test(t.textContent)) {
          dupRegex.lastIndex = 0;
          setRunText(t, t.textContent.replace(dupRegex, '$1'));
        }
      }
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
  const numericMemo = (memoNo.match(/\d+/) || [memoNo.trim()])[0];

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
    MEMO_NUMBER: numericMemo,

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

  // 2. Process Memo number for templates with static memo numbers
  applyMemoNumber(xmlDoc, numericMemo);

  // 3. Precision placeholder replacement on paragraphs containing placeholders
  processDocumentXml(xmlDoc, replacements);

  // 4. Deduplicate any memo year suffix if accidentally duplicated
  deduplicateMemoYearSuffix(xmlDoc);

  // 5. Also process headers & footers if they contain placeholders
  for (const filename of Object.keys(zip.files)) {
    if (filename.startsWith('word/header') || filename.startsWith('word/footer')) {
      const hFile = zip.file(filename);
      if (hFile) {
        const hText = await hFile.async('string');
        const hDoc = parser.parseFromString(hText, 'application/xml');
        processDocumentXml(hDoc, replacements);
        deduplicateMemoYearSuffix(hDoc);
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
