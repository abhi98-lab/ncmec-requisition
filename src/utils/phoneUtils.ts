/**
 * Phone number utilities for Indian mobile numbers in NCMEC Registers.
 * Requirements:
 * - Extract individual Indian mobile numbers independently.
 * - Recognize each occurrence of 91 + 10-digit Indian mobile number ([6-9]\d{9}) as ONE separate mobile number.
 * - Split concatenated sequences (e.g. 917908779129918653354801919647806709) at country code 91 boundaries.
 * - After extraction, remove ONLY the leading country code 91 from each individual number.
 * - VALIDATION: After normalization, every target mobile number MUST contain exactly 10 digits ([6-9]\d{9}).
 *   NEVER allow a 20-digit, 30-digit, 40-digit etc. value.
 */

/**
 * Normalizes a single phone string candidate into a valid 10-digit Indian mobile number.
 * Returns null if it cannot be normalized to exactly 10 digits.
 */
export function cleanIndianMobileNumber(raw: string): string {
  if (!raw) return '';
  const trimmed = raw.trim();

  // Strip all non-digits
  const digits = trimmed.replace(/\D/g, '');

  // If 12 digits starting with 91 followed by valid Indian mobile [6-9]\d{9}
  if (digits.length === 12 && digits.startsWith('91') && /^[6-9]/.test(digits.slice(2))) {
    return digits.slice(2);
  }

  // If 11 digits starting with 0 followed by [6-9]\d{9}
  if (digits.length === 11 && digits.startsWith('0') && /^[6-9]/.test(digits.slice(1))) {
    return digits.slice(1);
  }

  // If already standard 10-digit Indian mobile [6-9]\d{9}
  if (digits.length === 10 && /^[6-9]\d{9}$/.test(digits)) {
    return digits;
  }

  // If the string contains multiple numbers concatenated together,
  // do NOT return the concatenated string. Extract the first valid 10-digit number.
  const all = extractAllMobileNumbers(raw);
  return all.length > 0 ? all[0] : '';
}

/**
 * Extracts ALL individual Indian mobile numbers from a cell's text content.
 * Handles:
 * - Line breaks, commas, semicolons, slashes, spaces
 * - Split Word runs (<w:t>)
 * - Long concatenated strings (e.g. 917908779129918653354801919647806709)
 *   by splitting at every valid repeated Indian country code boundary "91"
 * - Strictly validates that every returned mobile number has EXACTLY 10 digits.
 */
export function extractAllMobileNumbers(cellText: string): string[] {
  if (!cellText || !cellText.trim()) return [];

  const results: string[] = [];

  const addValidNumber = (num: string) => {
    if (num && num.length === 10 && /^[6-9]\d{9}$/.test(num)) {
      if (!results.includes(num)) {
        results.push(num);
      }
    }
  };

  // Step 1: Split by obvious separators (newlines, carriage returns, commas, semicolons, slashes, pipes, 'and', spaces)
  const tokens = cellText
    .split(/[\r\n,;/|&]+|\band\b|\s+/i)
    .map(t => t.trim())
    .filter(Boolean);

  for (const token of tokens) {
    // Strip non-digits
    const digits = token.replace(/\D/g, '');
    if (!digits) continue;

    // Check if this token is a concatenated string containing multiple numbers
    // e.g. 917908779129918653354801919647806709 (length 36)
    // Or two 12-digit numbers: 918617073548917908779129 (length 24)
    if (digits.length > 12 || (digits.length >= 20 && digits.includes('91'))) {
      // Split on country code boundary 91 followed by [6-9]\d{9}
      const regex91 = /91([6-9]\d{9})/g;
      let match;
      let matchedAny = false;
      while ((match = regex91.exec(digits)) !== null) {
        matchedAny = true;
        addValidNumber(match[1]);
      }

      if (matchedAny) continue;

      // What if concatenated 10-digit numbers without 91?
      // e.g. 79087791298653354801 (length 20)
      if (digits.length % 10 === 0) {
        const chunks: string[] = [];
        let allChunksValid = true;
        for (let i = 0; i < digits.length; i += 10) {
          const chunk = digits.substring(i, i + 10);
          if (/^[6-9]\d{9}$/.test(chunk)) {
            chunks.push(chunk);
          } else {
            allChunksValid = false;
            break;
          }
        }
        if (allChunksValid && chunks.length > 0) {
          chunks.forEach(addValidNumber);
          continue;
        }
      }
    }

    // Single 12-digit number starting with 91
    if (digits.length === 12 && digits.startsWith('91') && /^[6-9]/.test(digits.slice(2))) {
      addValidNumber(digits.slice(2));
      continue;
    }

    // Single 11-digit number starting with 0
    if (digits.length === 11 && digits.startsWith('0') && /^[6-9]/.test(digits.slice(1))) {
      addValidNumber(digits.slice(1));
      continue;
    }

    // Single 10-digit number
    if (digits.length === 10 && /^[6-9]\d{9}$/.test(digits)) {
      addValidNumber(digits);
      continue;
    }

    // If token has more or fewer digits, try regex scanning inside it for 91[6-9]\d{9} or [6-9]\d{9}
    const subMatch91 = digits.match(/91([6-9]\d{9})/g);
    if (subMatch91) {
      for (const m of subMatch91) {
        addValidNumber(m.slice(2));
      }
      continue;
    }

    const subMatch10 = digits.match(/([6-9]\d{9})/g);
    if (subMatch10) {
      for (const m of subMatch10) {
        addValidNumber(m);
      }
      continue;
    }
  }

  // Step 2: Fallback across the entire raw text if no numbers were extracted
  // or if formatting was completely lost
  if (results.length === 0) {
    const rawDigits = cellText.replace(/\D/g, '');

    // Search all 91[6-9]\d{9} sequences
    const global91 = /91([6-9]\d{9})/g;
    let m;
    while ((m = global91.exec(rawDigits)) !== null) {
      addValidNumber(m[1]);
    }

    // If still empty, search all [6-9]\d{9} sequences
    if (results.length === 0) {
      const global10 = /([6-9]\d{9})/g;
      while ((m = global10.exec(rawDigits)) !== null) {
        addValidNumber(m[1]);
      }
    }
  }

  // Step 3: STRICT VALIDATION
  // Filter out any entry that is not exactly 10 digits matching [6-9]\d{9}
  // NEVER allow 20-digit, 30-digit, 40-digit strings
  return results.filter(num => num.length === 10 && /^[6-9]\d{9}$/.test(num));
}
