/*
 * Minimal CSV reader/writer (RFC 4180 style) with no dependencies.
 * - Reads quoted cells, doubled quotes, commas and line breaks inside quotes, CRLF/LF.
 * - Strips the UTF-8 byte-order mark Excel adds, and detects , ; or tab separators.
 * - Writes with CRLF line ends and an optional BOM so Excel opens it as UTF-8.
 * - Guards against spreadsheet formula injection (cells starting with = + - @).
 */

const BOM = String.fromCharCode(0xfeff);

/** Picks the separator used by the first line (Excel in some countries saves with ;). */
function detectDelimiter(text: string): string {
  let inQuotes = false;
  const counts: Record<string, number> = { ',': 0, ';': 0, '\t': 0 };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') inQuotes = !inQuotes;
    else if (!inQuotes && (ch === '\n' || ch === '\r')) break;
    else if (!inQuotes && ch in counts) counts[ch]++;
  }
  const best = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  return best[1] > 0 ? best[0] : ',';
}

/** Parses CSV text into rows of cells. Completely empty lines are skipped. */
export function parseCsv(input: string): string[][] {
  const text = input.startsWith(BOM) ? input.slice(1) : input;
  const delimiter = detectDelimiter(text);

  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  const endField = () => {
    row.push(field);
    field = '';
  };
  const endRow = () => {
    endField();
    if (row.some((cell) => cell.trim() !== '')) rows.push(row);
    row = [];
  };

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"' && field === '') {
      inQuotes = true;
    } else if (ch === delimiter) {
      endField();
    } else if (ch === '\n') {
      endRow();
    } else if (ch === '\r') {
      if (text[i + 1] === '\n') i++;
      endRow();
    } else {
      field += ch;
    }
  }
  if (field !== '' || row.length > 0) endRow();

  return rows;
}

export type CsvCell = string | number | boolean | null | undefined;

function escapeCell(value: CsvCell): string {
  if (value === null || value === undefined) return '';
  const str = String(value);
  return /[",\r\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

/** Turns rows into CSV text (CRLF line ends, UTF-8 BOM by default for Excel). */
export function toCsv(rows: CsvCell[][], options: { bom?: boolean } = {}): string {
  const { bom = true } = options;
  return (bom ? BOM : '') + rows.map((r) => r.map(escapeCell).join(',')).join('\r\n') + '\r\n';
}

/**
 * Text cells that start with = + - @ would run as a formula when opened in Excel.
 * Prefix them with an apostrophe; `unguardCell` removes it again on import.
 */
export function guardCell(value: string): string {
  return /^[=+\-@]/.test(value) ? `'${value}` : value;
}

export function unguardCell(value: string): string {
  return /^'[=+\-@]/.test(value) ? value.slice(1) : value;
}
