/**
 * Utilities for extracting Addressee Name and Full Address from SDR string.
 * SDR usually contains Name, Parentage (S/o, D/o, W/o, C/o), Village/Street, Post Office, Police Station, District, PIN.
 *
 * CRITICAL RULE:
 * Preserves all natural spaces, line breaks, punctuation (slashes, hyphens, commas), and structure.
 * Never collapses spaces or strips parentage markers like "D/O - Kutubuddin Sekh".
 */

export function parseSdrDetails(sdrText: string): { name: string; address: string } {
  if (!sdrText || !sdrText.trim()) {
    return { name: '', address: '' };
  }

  const cleanText = sdrText.trim();

  // 1. Multiline format: line 1 is Name or Parentage, subsequent lines are Address
  const lines = cleanText.split(/[\r\n]+/).map(l => l.trim()).filter(Boolean);
  if (lines.length > 1) {
    const firstLine = lines[0];
    return {
      name: firstLine,
      address: lines.slice(1).join('\n'),
    };
  }

  // 2. Explicit "Name:" pattern
  const nameMatch = cleanText.match(/(?:Name|NAME)\s*[:=-]\s*([^,\n\r]+)/i);
  if (nameMatch && nameMatch[1]) {
    const rawName = nameMatch[1].trim();
    let address = cleanText.replace(nameMatch[0], '').trim();
    address = address.replace(/^[,;\s-]+/, '').trim();
    return {
      name: rawName,
      address: address || cleanText,
    };
  }

  // 3. Parentage split on a single line: "S/O", "D/O", "W/O", "C/O"
  const parentageRegex = /\b(?:S\/O|D\/O|W\/O|C\/O|S\/o|D\/o|W\/o|C\/o)\b/i;
  const matchIndex = cleanText.search(parentageRegex);
  if (matchIndex > 0) {
    const namePart = cleanText.substring(0, matchIndex).trim().replace(/[,;\s-]+$/, '');
    const addressPart = cleanText.substring(matchIndex).trim();
    if (namePart.length > 0) {
      return {
        name: namePart,
        address: addressPart,
      };
    }
  }

  // 4. Comma split on single line
  const commaParts = cleanText.split(',');
  if (commaParts.length > 1) {
    const firstPart = commaParts[0].trim();
    if (firstPart.length > 1 && firstPart.length < 50 && !/\d{4,}/.test(firstPart)) {
      return {
        name: firstPart,
        address: commaParts.slice(1).map(p => p.trim()).join(', '),
      };
    }
  }

  // 5. Fallback
  return {
    name: '',
    address: cleanText,
  };
}
