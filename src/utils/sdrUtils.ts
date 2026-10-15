/**
 * Utilities for extracting Addressee Name and Full Address from SDR string.
 * SDR usually contains Name, Parentage (S/o, D/o, W/o, C/o), Village/Street, Post Office, Police Station, District, PIN.
 */

export function parseSdrDetails(sdrText: string): { name: string; address: string } {
  if (!sdrText || !sdrText.trim()) {
    return { name: '', address: '' };
  }

  const cleanText = sdrText.trim();

  // Check for explicit "Name:" pattern
  const nameMatch = cleanText.match(/(?:Name|NAME)\s*[:=-]\s*([^,\n\r]+)/i);
  if (nameMatch && nameMatch[1]) {
    const rawName = nameMatch[1].trim();
    // Address is either whatever follows the name or the full text minus "Name: XXX"
    let address = cleanText.replace(nameMatch[0], '').trim();
    address = address.replace(/^[,;\s-]+/, '').trim();
    return {
      name: sanitizeName(rawName),
      address: address || cleanText,
    };
  }

  // Check for multiline
  const lines = cleanText.split(/[\r\n]+/).map(l => l.trim()).filter(Boolean);
  if (lines.length > 1) {
    const firstLine = lines[0];
    // If first line has no obvious address markers like "Vill", "Dist", "PIN", etc.
    if (!/(?:vill|dist|pin|post|p\.o|p\.s|road|lane|street|sector)\b/i.test(firstLine)) {
      return {
        name: sanitizeName(firstLine),
        address: lines.slice(1).join(', '),
      };
    }
  }

  // Check for parentage split: "S/O", "D/O", "W/O", "C/O", "S/o", "D/o", "W/o", "C/o"
  const parentageRegex = /\b(?:S\/O|D\/O|W\/O|C\/O|S\/o|D\/o|W\/o|C\/o|SO|DO|WO|CO)\b/i;
  const matchIndex = cleanText.search(parentageRegex);
  if (matchIndex > 0) {
    const namePart = cleanText.substring(0, matchIndex).trim().replace(/[,;\s-]+$/, '');
    const addressPart = cleanText.substring(matchIndex).trim();
    if (namePart.length > 0 && namePart.length < 60) {
      return {
        name: sanitizeName(namePart),
        address: addressPart,
      };
    }
  }

  // Check comma split: first chunk if it looks like a name
  const commaParts = cleanText.split(',');
  if (commaParts.length > 1) {
    const firstPart = commaParts[0].trim();
    if (firstPart.length > 1 && firstPart.length < 50 && !/\d{4,}/.test(firstPart)) {
      return {
        name: sanitizeName(firstPart),
        address: commaParts.slice(1).join(',').trim(),
      };
    }
  }

  // If no clear boundary, return first 30 chars as candidate or empty name and full text as address
  return {
    name: sanitizeName(cleanText.split(' ').slice(0, 3).join(' ')),
    address: cleanText,
  };
}

function sanitizeName(name: string): string {
  return name
    .replace(/^(?:Shri|Smt|Mr|Mrs|Ms|Md|Mohd|Dr)\.?\s+/i, '')
    .replace(/[^\w\s.'-]/g, '')
    .trim();
}
