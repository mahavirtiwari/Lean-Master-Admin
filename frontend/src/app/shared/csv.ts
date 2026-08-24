/**
 * CSV export/import helpers shared by the master-data screens.
 *
 * Excel opens CSV natively, so a .csv download is the "Export to Excel" the
 * screens offer; a UTF-8 BOM is prepended so Excel reads Indian names and the
 * rupee sign correctly rather than as mojibake.
 */

/** Quotes one cell for CSV: wraps in quotes and doubles any embedded quote. */
function cell(value: unknown): string {
  return `"${String(value ?? '').replace(/"/g, '""')}"`;
}

/**
 * Builds a CSV from a header row and body rows and starts a download. The rows
 * are plain arrays so every caller shapes its own columns.
 */
export function downloadCsv(filename: string, header: string[], rows: unknown[][]): void {
  const body = rows.map((r) => r.map(cell).join(','));
  const csv = '﻿' + [header.map(cell).join(','), ...body].join('\r\n');

  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

/** Today as YYYY-MM-DD, for stamping export filenames. */
export function stamp(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Parses a CSV string into rows of string cells. Handles quoted fields,
 * embedded commas/quotes/newlines, and a leading UTF-8 BOM. Good enough for the
 * templates these screens export and re-import; not a full RFC-4180 library.
 */
export function parseCsv(text: string): string[][] {
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];

    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') { field += '"'; i++; }
        else quoted = false;
      } else field += ch;
      continue;
    }

    if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (ch !== '\r') field += ch;
  }

  // Flush the last field/row unless the file ended on a newline.
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }

  return rows;
}
