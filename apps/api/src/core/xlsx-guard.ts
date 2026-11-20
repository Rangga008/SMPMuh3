import { BadRequestException } from '@nestjs/common';
import * as XLSX from 'xlsx';

/**
 * Pembatas untuk parsing spreadsheet unggahan — SheetJS 0.18.5 tidak punya
 * batas bawaan sehingga file jahat (zip-bomb/puluhan ribu sel) bisa menghabiskan
 * CPU/memori API. Batas: buffer mentah, jumlah sheet, dan rentang sel per sheet.
 */
export const XLSX_MAX_BYTES = 8 * 1024 * 1024; // 8MB — impor data tak pernah sebesar ini
const MAX_SHEETS = 20;
const MAX_ROWS = 20_000;
const MAX_COLS = 200;

/** Baca workbook dengan batas ukuran + rentang; lempar BadRequest bila lewat. */
export function parseXlsx(
  buffer: Buffer,
  opts: XLSX.ParsingOptions = {},
): XLSX.WorkBook {
  if (buffer.length > XLSX_MAX_BYTES) {
    throw new BadRequestException('File terlalu besar — maksimal 8MB.');
  }
  const wb = XLSX.read(buffer, { type: 'buffer', ...opts });
  const names = wb.SheetNames ?? [];
  if (names.length > MAX_SHEETS) {
    throw new BadRequestException(`Workbook punya ${names.length} sheet — maksimal ${MAX_SHEETS}.`);
  }
  for (const name of names) {
    const ref = wb.Sheets[name]?.['!ref'];
    if (!ref) continue;
    const range = XLSX.utils.decode_range(ref);
    const rows = range.e.r - range.s.r + 1;
    const cols = range.e.c - range.s.c + 1;
    if (rows > MAX_ROWS || cols > MAX_COLS) {
      throw new BadRequestException(
        `Sheet "${name}" terlalu besar (${rows}×${cols} sel) — maksimal ${MAX_ROWS} baris × ${MAX_COLS} kolom.`,
      );
    }
  }
  return wb;
}
