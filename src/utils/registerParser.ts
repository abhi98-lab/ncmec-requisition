import JSZip from 'jszip';
import { RegisterRecord } from '../types';
import { extractAllMobileNumbers } from './phoneUtils';
import { parseSdrDetails } from './sdrUtils';
import { cleanPoliceStationName } from './docxEngine';

/**
 * Extracts cell text while preserving paragraph boundaries (<w:p>),
 * tab elements (<w:tab/>), and line-break elements (<w:br/>, <w:cr/>)
 * so words and lines are never collapsed or concatenated together.
 */
function extractCellText(tcNode: Element): string {
  const paragraphs = Array.from(tcNode.getElementsByTagName('w:p'));
  if (paragraphs.length === 0) {
    return tcNode.textContent?.trim() || '';
  }

  const paragraphTexts: string[] = [];

  for (const p of paragraphs) {
    let pText = '';
    const childNodes = Array.from(p.childNodes);

    for (const child of childNodes) {
      if (child.nodeName === 'w:r') {
        const rChildren = Array.from(child.childNodes);
        for (const rChild of rChildren) {
          if (rChild.nodeName === 'w:t') {
            pText += rChild.textContent || '';
          } else if (rChild.nodeName === 'w:tab') {
            pText += ' ';
          } else if (rChild.nodeName === 'w:br' || rChild.nodeName === 'w:cr') {
            pText += '\n';
          }
        }
      } else if (child.nodeName === 'w:tab') {
        pText += ' ';
      } else if (child.nodeName === 'w:br' || child.nodeName === 'w:cr') {
        pText += '\n';
      }
    }

    if (pText.trim().length > 0) {
      paragraphTexts.push(pText.trim());
    }
  }

  return paragraphTexts.join('\n');
}

export async function parseDocxRegister(file: File | ArrayBuffer): Promise<RegisterRecord[]> {
  const zip = await JSZip.loadAsync(file);
  const docXmlFile = zip.file('word/document.xml');
  if (!docXmlFile) {
    throw new Error('Invalid DOCX file: word/document.xml not found.');
  }

  const xmlText = await docXmlFile.async('string');
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(xmlText, 'application/xml');

  // Check for XML parse errors
  const parseError = xmlDoc.getElementsByTagName('parsererror');
  if (parseError.length > 0) {
    throw new Error('Failed to parse document XML: ' + parseError[0].textContent);
  }

  const tables = xmlDoc.getElementsByTagName('w:tbl');
  if (tables.length === 0) {
    throw new Error('No tables found in the uploaded register DOCX document.');
  }

  // Iterate over tables to find the register table
  for (let tIdx = 0; tIdx < tables.length; tIdx++) {
    const table = tables[tIdx];
    const rows = Array.from(table.getElementsByTagName('w:tr'));
    if (rows.length < 2) continue; // Need at least header + 1 record

    const tableData: string[][] = [];

    for (const row of rows) {
      const cells = Array.from(row.getElementsByTagName('w:tc'));
      const rowTexts: string[] = [];

      for (const cell of cells) {
        // Use paragraph-aware cell text extraction
        const cellText = extractCellText(cell);
        rowTexts.push(cellText);
      }

      if (rowTexts.some(cell => cell.length > 0)) {
        tableData.push(rowTexts);
      }
    }

    if (tableData.length < 2) continue;

    // Detect header row index and column mappings
    let headerRowIdx = -1;
    let colReport = -1;
    let colMobile = -1;
    let colSdr = -1;
    let colPs = -1;
    let colDate = -1;

    for (let r = 0; r < Math.min(tableData.length, 5); r++) {
      const row = tableData[r];
      let hasHeaderKeywords = false;

      for (let c = 0; c < row.length; c++) {
        const text = row[c].toLowerCase();
        if (text.includes('tipline') || text.includes('report')) {
          colReport = c;
          hasHeaderKeywords = true;
        } else if (text.includes('mobile') || text.includes('phone') || text.includes('contact')) {
          colMobile = c;
          hasHeaderKeywords = true;
        } else if (text.includes('sdr') || text.includes('address') || text.includes('name')) {
          colSdr = c;
          hasHeaderKeywords = true;
        } else if (
          text === 'ps' ||
          text === 'p.s' ||
          text === 'p.s.' ||
          /\b(?:ps|p\.s\.?|police\s*station)\b/i.test(text)
        ) {
          colPs = c;
          hasHeaderKeywords = true;
        } else if (text.includes('incident') || (text.includes('date') && !text.includes('gde'))) {
          colDate = c;
          hasHeaderKeywords = true;
        }
      }

      if (hasHeaderKeywords && (colReport !== -1 || colMobile !== -1 || colSdr !== -1)) {
        headerRowIdx = r;
        break;
      }
    }

    // Fallbacks if not all columns detected
    if (colReport === -1) colReport = 1; // Default: 2nd column
    if (colMobile === -1) colMobile = 2; // Default: 3rd column
    if (colSdr === -1) colSdr = 3;       // Default: 4th column
    if (colPs === -1) colPs = 4;        // Default: 5th column
    if (colDate === -1) colDate = 5;      // Default: 6th column

    const startIdx = headerRowIdx >= 0 ? headerRowIdx + 1 : 1;
    const records: RegisterRecord[] = [];
    let visibleSerial = 1;

    for (let r = startIdx; r < tableData.length; r++) {
      const row = tableData[r];
      // Skip empty row or repeated headers
      if (!row || row.every(c => !c.trim())) continue;
      const isRepeatHeader = row.some(
        c => c.toLowerCase().includes('tipline report') || c.toLowerCase().includes('incident date')
      );
      if (isRepeatHeader) continue;

      const reportNo = (row[colReport] || '').trim();
      const rawMobile = (row[colMobile] || '').trim();
      const sdr = (row[colSdr] || '').trim();
      let rawPs = (row[colPs] || '').trim();
      const incidentDate = (row[colDate] || '').trim();

      // If all critical fields are empty, skip
      if (!reportNo && !rawMobile && !sdr) continue;

      // Extract all mobile numbers independently
      const mobiles = extractAllMobileNumbers(rawMobile);
      const { name, address } = parseSdrDetails(sdr);

      // If PS column was empty, attempt extraction from SDR text
      if (!rawPs && sdr) {
        const sdrPsMatch = sdr.match(/(?:P\.?S\.?|Police\s*Station)\s*[:=-]?\s*([A-Za-z\s]+?)(?:[,\n\r\d]|$)/i);
        if (sdrPsMatch && sdrPsMatch[1]) {
          rawPs = sdrPsMatch[1].trim();
        }
      }

      const cleanPs = cleanPoliceStationName(rawPs) || rawPs;

      records.push({
        serial: visibleSerial++,
        reportNo,
        rawMobiles: rawMobile,
        mobiles,
        sdr,
        extractedName: name,
        extractedAddress: address,
        ps: cleanPs,
        incidentDate,
      });
    }

    if (records.length > 0) {
      return records;
    }
  }

  throw new Error('Could not identify valid register records in the uploaded DOCX document.');
}
