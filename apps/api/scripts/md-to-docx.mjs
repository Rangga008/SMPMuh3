/**
 * Konversi modul Markdown → Word (.docx) — khusus panduan sosialisasi.
 * Jalankan dari apps/api:  node scripts/md-to-docx.mjs <in.md> <out.docx> [in2.md out2.docx ...]
 *
 * Didukung: #..#### heading, tabel |, list - & 1., > kutipan, ``` kode,
 * **tebal** *miring* `kode`, [FOTO n — …] → kotak kuning tempat sisip gambar,
 * --- → garis, [teks](tautan) → teks.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import {
  AlignmentType, BorderStyle, Document, HeadingLevel, ImageRun, LevelFormat,
  Packer, Paragraph, ShadingType, Table, TableCell, TableRow, TextRun, WidthType,
} from 'docx';

const BORDER = { style: BorderStyle.SINGLE, size: 4, color: 'D1D5DB' };
/** Lebar gambar maks (px @96dpi) — ±15cm muat margin A4. */
const IMG_MAX_W = 560;
/** Ukuran PNG dari header IHDR. */
const pngSize = (buf) => ({ w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) });
/** Folder screenshot: ../modul/shots relatif file .md yang dikonversi. */
const shotDir = (mdPath) => resolve(dirname(mdPath), 'shots');

/** Teks markdown inline → TextRun[]. */
function runs(text) {
  const clean = text.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1'); // [t](url) → t
  const out = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*)/g;
  let last = 0, m;
  while ((m = re.exec(clean))) {
    if (m.index > last) out.push(new TextRun(clean.slice(last, m.index)));
    const t = m[0];
    if (t.startsWith('**')) out.push(new TextRun({ text: t.slice(2, -2), bold: true }));
    else if (t.startsWith('`')) out.push(new TextRun({ text: t.slice(1, -1), font: 'Consolas' }));
    else out.push(new TextRun({ text: t.slice(1, -1), italics: true }));
    last = m.index + t.length;
  }
  if (last < clean.length) out.push(new TextRun(clean.slice(last)));
  return out.length ? out : [new TextRun('')];
}

/** Gambar tersedia → caption + ImageRun; tidak → kotak kuning sisip-manual. */
function fotoBox(label, imgPath) {
  const caption = new Paragraph({
    spacing: { before: 160, after: 40 },
    children: [new TextRun({ text: `📷 ${label}`, bold: true, size: 18, color: '475569' })],
  });
  if (imgPath && existsSync(imgPath)) {
    const buf = readFileSync(imgPath);
    const { w, h } = pngSize(buf);
    const width = Math.min(IMG_MAX_W, w);
    return [
      caption,
      new Paragraph({
        spacing: { after: 200 },
        children: [new ImageRun({ data: buf, type: 'png', transformation: { width, height: Math.round((h * width) / w) } })],
      }),
    ];
  }
  const warn = new Paragraph({
    spacing: { before: 0, after: 0 },
    children: [new TextRun({ text: '   — tempel/insert tangkapan layar pada kotak di bawah', bold: true, color: 'B45309', size: 18 })],
  });
  const box = (children) => new Paragraph({
    spacing: { before: 40, after: 40 },
    border: {
      top: { style: BorderStyle.DASHED, size: 8, color: 'D97706' },
      bottom: { style: BorderStyle.DASHED, size: 8, color: 'D97706' },
      left: { style: BorderStyle.DASHED, size: 8, color: 'D97706' },
      right: { style: BorderStyle.DASHED, size: 8, color: 'D97706' },
    },
    shading: { type: ShadingType.SOLID, color: 'FFF7CC' },
    children,
  });
  return [
    new Paragraph({
      spacing: { before: 160, after: 0 },
      children: [new TextRun({ text: `📷 ${label}`, bold: true, size: 22 })],
    }),
    warn,
    box([new TextRun(''), new TextRun({ break: 1, text: '' }), new TextRun({ break: 1, text: '' }), new TextRun({ break: 1, text: '' }), new TextRun({ break: 1, text: '' }), new TextRun({ break: 1, text: '' }), new TextRun({ break: 1, text: '' })]),
  ];
}

function tableBlock(rows) {
  const cells = rows.map((r) => r.replace(/^\||\|$/g, '').split('|').map((c) => c.trim()));
  const width = Math.max(...cells.map((c) => c.length));
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: BORDER, bottom: BORDER, left: BORDER, right: BORDER,
      insideHorizontal: BORDER, insideVertical: BORDER,
    },
    rows: cells.map((row, ri) => new TableRow({
      children: Array.from({ length: width }, (_, ci) => new TableCell({
        shading: ri === 0 ? { type: ShadingType.SOLID, color: 'E8EDF2' } : undefined,
        children: [new Paragraph({ children: runs(row[ci] ?? '') })],
      })),
    })),
  });
}

function convert(md, mdPath) {
  const shots = shotDir(mdPath);
  // Nomor modul dari nama file: 01-… → m1, 02-… → m2 (fallback: m1)
  const mod = /0?(\d+)/.exec(mdPath.match(/[^\\/]+$/)?.[0] ?? '')?.[1] ?? '1';
  const lines = md.split(/\r?\n/);
  const els = [];
  let i = 0, numSeq = 0;
  while (i < lines.length) {
    const line = lines[i];
    // blok kode
    if (/^```/.test(line)) {
      const buf = [];
      for (i++; i < lines.length && !/^```/.test(lines[i]); i++) buf.push(lines[i]);
      i++;
      for (const l of buf) els.push(new Paragraph({
        shading: { type: ShadingType.SOLID, color: 'F4F4F5' },
        spacing: { before: 0, after: 0 },
        children: [new TextRun({ text: l || ' ', font: 'Consolas', size: 16 })],
      }));
      els.push(new Paragraph({ spacing: { after: 120 }, children: [] }));
      continue;
    }
    // tabel
    if (/^\s*\|.*\|\s*$/.test(line)) {
      const rows = [];
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) rows.push(lines[i++]);
      els.push(tableBlock(rows.filter((r) => !/^\s*\|[\s:|-]+\|\s*$/.test(r))));
      els.push(new Paragraph({ spacing: { after: 120 }, children: [] }));
      continue;
    }
    // placeholder foto
    const foto = /^\**\[(FOTO\s*(\d+)[^\]]*)\]\**/.exec(line.trim());
    if (foto) {
      const num = String(Number(foto[2])).padStart(2, '0');
      els.push(...fotoBox(foto[1], `${shots}/m${mod}-f${num}.png`));
      i++; continue;
    }
    // heading
    const h = /^(#{1,4})\s+(.*)/.exec(line);
    if (h) {
      const level = [HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3, HeadingLevel.HEADING_4][h[1].length - 1];
      els.push(new Paragraph({ heading: level, spacing: { before: 280, after: 120 }, children: runs(h[2]) }));
      i++; continue;
    }
    // garis pisah
    if (/^\s*(---+|\*\*\*+)\s*$/.test(line)) {
      els.push(new Paragraph({ spacing: { before: 120, after: 120 }, border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: '9CA3AF' } }, children: [] }));
      i++; continue;
    }
    // kutipan
    if (/^>\s?/.test(line)) {
      els.push(new Paragraph({
        indent: { left: 360 },
        border: { left: { style: BorderStyle.SINGLE, size: 16, color: '7C8B9E' } },
        spacing: { before: 60, after: 60 },
        children: runs(line.replace(/^>\s?/, '')),
      }));
      i++; continue;
    }
    // list bullet
    const bul = /^\s*[-*]\s+(.*)/.exec(line);
    if (bul) { els.push(new Paragraph({ bullet: { level: 0 }, children: runs(bul[1]) })); i++; continue; }
    // list nomor — referensi baru per blok agar penomoran restart
    const num = /^\s*(\d+)[.)]\s+(.*)/.exec(line);
    if (num) {
      if (!/^\s*\d+[.)]\s/.test(lines[i - 1] ?? '')) numSeq++;
      els.push(new Paragraph({ numbering: { reference: `n${numSeq}`, level: 0 }, children: runs(num[2]) }));
      i++; continue;
    }
    // paragraf biasa
    if (line.trim()) els.push(new Paragraph({ spacing: { after: 100 }, children: runs(line) }));
    i++;
  }
  return els;
}

const args = process.argv.slice(2);
if (!args.length || args.length % 2) {
  console.error('Pakai: node scripts/md-to-docx.mjs <in.md> <out.docx> [pasangan lain…]');
  process.exit(1);
}
const numbering = { config: Array.from({ length: 80 }, (_, k) => ({
  reference: `n${k + 1}`,
  levels: [{ level: 0, format: LevelFormat.DECIMAL, text: '%1.', alignment: AlignmentType.START,
    style: { paragraph: { indent: { left: 480, hanging: 280 } } } }],
})) };

for (let a = 0; a < args.length; a += 2) {
  const [src, dst] = [args[a], args[a + 1]];
  const doc = new Document({
    numbering,
    styles: { default: { document: { run: { font: 'Calibri', size: 22 } } } },
    sections: [{ children: convert(readFileSync(src, 'utf8'), src) }],
  });
  writeFileSync(dst, await Packer.toBuffer(doc));
  console.log(`✔ ${dst}`);
}
