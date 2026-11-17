import tkpiBaseRaw from '../data/tkpi2020Base.json';
import type { TkpiFoodItem } from '../types';

export const BASE_TKPI_2020_ITEMS: TkpiFoodItem[] = (tkpiBaseRaw as TkpiFoodItem[]).map(
  (item) => ({
    ...item,
    sourceType: 'tkpi',
  })
);

export function normalizeGoogleSheetsCsvUrl(rawUrl: string): string {
  const trimmed = rawUrl.trim();
  if (!trimmed) return '';
  const gsheetMatch = trimmed.match(
    /https?:\/\/docs\.google\.com\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/
  );
  if (gsheetMatch) {
    const sheetId = gsheetMatch[1];
    const gidMatch = trimmed.match(/[?&#]gid=(\d+)/);
    const gid = gidMatch ? gidMatch[1] : '0';
    if (
      trimmed.includes('format=csv') ||
      trimmed.includes('output=csv') ||
      trimmed.includes('tqx=out:csv')
    ) {
      return trimmed;
    }
    return `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${gid}`;
  }
  return trimmed;
}

export function parseCsvMatrix(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        cell += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        row.push(cell);
        cell = '';
      } else if (ch === '\r') {
        // Ignore CR
      } else if (ch === '\n') {
        row.push(cell);
        rows.push(row);
        row = [];
        cell = '';
      } else {
        cell += ch;
      }
    }
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

function parseLocaleNumber(raw: string | undefined, fallback = 0): number {
  if (!raw) return fallback;
  const cleaned = String(raw).replace(/\s+/g, '').replace(/,/g, '');
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : fallback;
}

function cleanText(raw: string | undefined): string {
  return (raw || '').replace(/\s+/g, ' ').trim();
}

/**
 * Parses either:
 * 1) Official TKPI 2020 spreadsheet layout (NO, NAMA BAHAN, SUMBER, BERAT STANDAR, % BDD, ENERGI, PROTEIN, LEMAK, KH, SERAT...)
 * 2) Custom spreadsheet layout with headers containing NAMA BAHAN, BDD, ENERGI, PROTEIN, LEMAK, KH, SERAT, HARGA, SATUAN
 */
export function parseTkpiSpreadsheetCsv(
  csvText: string,
  sourceType: 'spreadsheet' | 'tkpi' = 'spreadsheet'
): TkpiFoodItem[] {
  const matrix = parseCsvMatrix(csvText);
  if (matrix.length === 0) return [];

  let headerRowIdx = -1;
  let colMap = {
    no: 0,
    namaBahan: 1,
    sumber: 2,
    beratStandar: 3,
    bdd: 4,
    energi: 5,
    protein: 6,
    lemak: 7,
    kh: 8,
    serat: 9,
    harga: -1,
    satuan: -1,
  };

  for (let r = 0; r < Math.min(12, matrix.length); r++) {
    const upperCells = matrix[r].map((c) => cleanText(c).toUpperCase());
    const nameCol = upperCells.findIndex(
      (c) => c === 'NAMA BAHAN' || c === 'BAHAN MAKANAN' || c === 'NAMA'
    );
    const energiCol = upperCells.findIndex((c) => c.includes('ENERGI'));
    if (nameCol >= 0 || energiCol >= 0) {
      headerRowIdx = r;
      if (nameCol >= 0) colMap.namaBahan = nameCol;
      const noCol = upperCells.findIndex((c) => c === 'NO' || c === 'NO.');
      if (noCol >= 0) colMap.no = noCol;
      const sumberCol = upperCells.findIndex((c) => c === 'SUMBER');
      if (sumberCol >= 0) colMap.sumber = sumberCol;
      const beratCol = upperCells.findIndex((c) => c.includes('BERAT'));
      if (beratCol >= 0) colMap.beratStandar = beratCol;

      // Check current or next row (TKPI puts % BDD, ENERGI on row 3 below row 2)
      const searchRows = [upperCells];
      if (matrix[r + 1]) searchRows.push(matrix[r + 1].map((c) => cleanText(c).toUpperCase()));
      for (const rowCells of searchRows) {
        const bddIdx = rowCells.findIndex((c) => c.includes('BDD'));
        const eIdx = rowCells.findIndex((c) => c.includes('ENERGI') || c.includes('KALORI'));
        const pIdx = rowCells.findIndex((c) => c === 'PROTEIN' || c.startsWith('PROTEIN'));
        const lIdx = rowCells.findIndex((c) => c === 'LEMAK' || c.startsWith('LEMAK'));
        const kIdx = rowCells.findIndex(
          (c) => c === 'KH' || c.includes('KARBO') || c.startsWith('KH ')
        );
        const sIdx = rowCells.findIndex((c) => c === 'SERAT' || c.startsWith('SERAT'));
        const hIdx = rowCells.findIndex((c) => c.includes('HARGA'));
        const satIdx = rowCells.findIndex((c) => c.includes('SATUAN'));

        if (bddIdx >= 0) colMap.bdd = bddIdx;
        if (eIdx >= 0) colMap.energi = eIdx;
        if (pIdx >= 0) colMap.protein = pIdx;
        if (lIdx >= 0) colMap.lemak = lIdx;
        if (kIdx >= 0) colMap.kh = kIdx;
        if (sIdx >= 0) colMap.serat = sIdx;
        if (hIdx >= 0) colMap.harga = hIdx;
        if (satIdx >= 0) colMap.satuan = satIdx;
      }
      break;
    }
  }

  const startIdx = headerRowIdx >= 0 ? headerRowIdx + 1 : 0;
  const items: TkpiFoodItem[] = [];
  const seenNames = new Set<string>();

  for (let i = startIdx; i < matrix.length; i++) {
    const row = matrix[i];
    if (!row || row.length < 3) continue;
    const namaBahan = cleanText(row[colMap.namaBahan]);
    if (!namaBahan) continue;
    const upperName = namaBahan.toUpperCase();
    if (
      upperName === 'NAMA BAHAN' ||
      upperName === 'BAHAN MAKANAN' ||
      upperName.startsWith('TABEL KOMPOSISI') ||
      upperName === '(%)' ||
      upperName === '(KAL)'
    ) {
      continue;
    }

    const noVal = cleanText(row[colMap.no]) || String(items.length + 1);
    const bddRaw = parseLocaleNumber(row[colMap.bdd], 100);
    const beratStd = parseLocaleNumber(row[colMap.beratStandar], 100);
    const energi = parseLocaleNumber(row[colMap.energi], 0);
    const protein = parseLocaleNumber(row[colMap.protein], 0);
    const lemak = parseLocaleNumber(row[colMap.lemak], 0);
    const kh = parseLocaleNumber(row[colMap.kh], 0);
    const serat = parseLocaleNumber(row[colMap.serat], 0);

    // Skip subheader unit rows like ",,(%),(Kal)..."
    if (
      namaBahan === '' ||
      (energi === 0 && protein === 0 && lemak === 0 && kh === 0 && cleanText(row[colMap.bdd]) === '(%)')
    ) {
      continue;
    }

    const normKey = namaBahan.toLowerCase();
    if (seenNames.has(normKey)) continue;
    seenNames.add(normKey);

    const harga = colMap.harga >= 0 ? parseLocaleNumber(row[colMap.harga], 0) : 0;
    const satuan = colMap.satuan >= 0 ? cleanText(row[colMap.satuan]) : '';

    items.push({
      id: `${sourceType}_${noVal}_${i}`,
      no: noVal,
      namaBahan,
      sumber: cleanText(row[colMap.sumber]) || 'Spreadsheet TKPI',
      beratStandar: beratStd > 0 ? beratStd : 100,
      bdd: bddRaw > 0 ? bddRaw : 100,
      energi,
      protein,
      lemak,
      kh,
      serat,
      ...(harga > 0 ? { defaultHargaSatuan: harga } : {}),
      ...(satuan ? { defaultSatuan: satuan } : {}),
      sourceType,
    });
  }

  return items;
}

/**
 * Merges base TKPI 2020 items with spreadsheet-synced items and manually added items.
 * Priority: Manual > Spreadsheet > Base TKPI 2020 (by case-insensitive namaBahan).
 */
export function mergeTkpiCatalog(
  syncedItems: TkpiFoodItem[] = [],
  customItems: TkpiFoodItem[] = []
): TkpiFoodItem[] {
  const byName = new Map<string, TkpiFoodItem>();

  for (const item of BASE_TKPI_2020_ITEMS) {
    byName.set(item.namaBahan.toLowerCase(), item);
  }
  for (const item of syncedItems) {
    if (item.namaBahan.trim()) {
      byName.set(item.namaBahan.trim().toLowerCase(), {
        ...item,
        sourceType: 'spreadsheet',
      });
    }
  }
  for (const item of customItems) {
    if (item.namaBahan.trim()) {
      byName.set(item.namaBahan.trim().toLowerCase(), {
        ...item,
        sourceType: 'manual',
      });
    }
  }

  return Array.from(byName.values());
}
