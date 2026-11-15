import * as mammoth from 'mammoth';
import { Document, Packer, Paragraph, Table, TableCell, TableRow, TextRun, WidthType } from 'docx';

/** Placeholder gambar di dalam HTML hasil parse — disubstitusi setelah upload ke storage. */
export const mediaMarker = (key: string) => `{{media:${key}}}`;

export interface RawImage {
  /** Penanda unik sementara di HTML (diganti URL setelah upload). */
  ref: string;
  buf: Buffer;
  ext: string;
  mime: string;
}
export interface ParsedDocxPassage {
  code: string;
  /** HTML bacaan — berisi penanda {{media:key}} untuk gambar. */
  content: string;
  images: RawImage[];
}
export interface ParsedDocxQuestion {
  number: number;
  type: 'MCQ' | 'MCQ_COMPLEX' | 'TRUE_FALSE' | 'TRUE_FALSE_COMPLEX';
  weight: number;
  prompt: string;
  options?: unknown;
  key?: unknown;
  passageCode?: string;
  images: RawImage[];
}
export interface ParsedDocx {
  passages: ParsedDocxPassage[];
  questions: ParsedDocxQuestion[];
  errors: string[];
}

const decode = (s: string) =>
  s.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'");

const stripTags = (html: string) => decode(html.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

/** Sanitasi HTML hasil mammoth — whitelist tag aman, buang atribut berbahaya, sisakan src gambar. */
export function sanitizeHtml(html: string): string {
  let out = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '');
  // Buang atribut on* dan style; pertahankan src/alt pada <img>.
  out = out.replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '');
  out = out.replace(/\sstyle\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '');
  const keep = /^(p|b|i|u|em|strong|ul|ol|li|br|img|sup|sub|span|div|table|thead|tbody|tr|td|th|h[1-6]|hr|blockquote)$/i;
  out = out.replace(/<\/?([a-zA-Z0-9]+)((?:\s[^<>]*)?)>/g, (m, tag: string, attrs: string) => {
    if (!keep.test(tag)) return '';
    if (tag.toLowerCase() === 'img') {
      const src = /\ssrc\s*=\s*"([^"]*)"/i.exec(attrs)?.[1] ?? '';
      return `<img src="${src}">`;
    }
    return m.startsWith('</') ? `</${tag.toLowerCase()}>` : `<${tag.toLowerCase()}>`;
  });
  return out.trim();
}

/** Ambil semua gambar base64 di HTML → kembalikan HTML dengan penanda + daftar buffer. */
function extractImages(html: string, prefix: string): { html: string; images: RawImage[] } {
  const images: RawImage[] = [];
  const out = html.replace(/data:image\/(png|jpeg|jpg|gif|webp);base64,([A-Za-z0-9+/=\s]+)/g,
    (m, ext: string, b64: string) => {
      const e = ext === 'jpeg' ? 'jpg' : ext.toLowerCase();
      const ref = `__IMG_${prefix}_${images.length}__`;
      images.push({ ref, buf: Buffer.from(b64.replace(/\s/g, ''), 'base64'), ext: e, mime: `image/${e === 'jpg' ? 'jpeg' : e}` });
      return mediaMarker(ref);
    });
  return { html: out, images };
}

const tableBlocks = (html: string) => html.match(/<table[\s>][\s\S]*?<\/table>/gi) ?? [];
const rowBlocks = (tbl: string) => tbl.match(/<tr[\s>][\s\S]*?<\/tr>/gi) ?? [];
const cellBlocks = (row: string) => row.match(/<t[dh][\s>][\s\S]*?<\/t[dh]>/gi) ?? [];

function typeOf(v: string): ParsedDocxQuestion['type'] | '' {
  const t = v.toUpperCase().replace(/[\s-]+/g, '_');
  if (/^(PG|MCQ|PILIHAN_GANDA)$/.test(t)) return 'MCQ';
  if (/^(PGK|MCQ_COMPLEX|PILIHAN_GANDA_KOMPLEKS)/.test(t)) return 'MCQ_COMPLEX';
  if (/^(BS|B_S|TRUE_FALSE|BENAR_SALAH)$/.test(t)) return 'TRUE_FALSE';
  if (/^(BSK|B_S_K|BENAR_SALAH_KOMPLEKS|TRUE_FALSE_COMPLEX|TFK)/.test(t)) return 'TRUE_FALSE_COMPLEX';
  return '';
}

/**
 * Parse Word → soal. Format: satu tabel per soal; tabel bacaan diawali sel "BACAAN: <kode>".
 * Tabel soal — baris meta (NO/TIPE/BOBOT/BACAAN), baris SOAL, baris opsi A–E (PG/PGK)
 * atau P1–P9 (BSK), dan baris KUNCI. Gambar di sel ikut terbawa.
 */
export async function parseQuestionDocxBuffer(buf: Buffer): Promise<ParsedDocx> {
  let rawHtml: string;
  try {
    ({ value: rawHtml } = await mammoth.convertToHtml({ buffer: buf }));
  } catch {
    return { passages: [], questions: [], errors: ['File Word tidak dapat dibaca — pastikan format .docx dari Microsoft Word/Google Docs.'] };
  }
  const errors: string[] = [];
  const passages: ParsedDocxPassage[] = [];
  const questions: ParsedDocxQuestion[] = [];
  let qIdx = 0;

  for (const tbl of tableBlocks(rawHtml)) {
    const rows = rowBlocks(tbl).map((r) =>
      cellBlocks(r).map((c) => c.replace(/^<t[dh][^>]*>/i, '').replace(/<\/t[dh]>$/i, '')));
    if (!rows.length) continue;
    const firstText = stripTags(rows[0]?.[0] ?? '');

    // ---- Tabel BACAAN ----
    const bm = /^BACAAN\s*:?\s*(\S+)?/i.exec(firstText);
    if (bm) {
      const code = (bm[1] ?? stripTags(rows[0]?.[1] ?? '')).trim().toUpperCase();
      if (!code) { errors.push('Tabel BACAAN tanpa kode — tulis "BACAAN: B1".'); continue; }
      const contentRows = rows.slice(1).flat().map((c) => sanitizeHtml(c)).filter(Boolean);
      const content = contentRows.join('');
      if (!content) { errors.push(`Bacaan ${code}: isi kosong.`); continue; }
      const { html, images } = extractImages(content, `p${code}`);
      passages.push({ code, content: html, images });
      continue;
    }

    // ---- Tabel SOAL ----
    qIdx++;
    let type: ParsedDocxQuestion['type'] | '' = '';
    let weight = 1;
    let no: number | null = null;
    let passageCode: string | undefined;
    let promptHtml = '';
    const choiceMap = new Map<string, string>(); // A..E atau P1..P9 → html
    let keyRaw = '';

    const kv = (cellHtml: string): [string, string] | null => {
      const m = /^(NO|NOMOR|TIPE|TYPE|BOBOT|BACAAN|KUNCI|JAWABAN)\s*:?\s*(.*)$/i.exec(stripTags(cellHtml));
      return m ? [(m[1] ?? '').toUpperCase(), (m[2] ?? '').trim()] : null;
    };

    for (const cells of rows) {
      for (let ci = 0; ci < cells.length; ci++) {
        const txt = stripTags(cells[ci] ?? '');
        const next = cells[ci + 1];
        const meta = kv(cells[ci] ?? '');
        if (meta) {
          const [k, v] = meta;
          const val = v || (next ? stripTags(next) : '');
          if (/^(NO|NOMOR)$/.test(k)) { no = parseInt(val ?? '', 10) || null; if (!v) ci++; }
          else if (/^(TIPE|TYPE)$/.test(k)) { type = typeOf(val); if (!v) ci++; }
          else if (k === 'BOBOT') { weight = Math.max(1, Math.round(Number(val)) || 1); if (!v) ci++; }
          else if (k === 'BACAAN') { passageCode = val && val !== '-' ? val.toUpperCase() : undefined; if (!v) ci++; }
          else if (/^(KUNCI|JAWABAN)$/.test(k)) { keyRaw = val; if (!v) ci++; }
          continue;
        }
        // Baris SOAL — label "SOAL"/"PERTANYAAN" di sel label, isi di sel berikutnya.
        if (/^(SOAL|PERTANYAAN)\s*:?$/i.test(txt) && next !== undefined) {
          promptHtml += sanitizeHtml(next);
          ci++;
          continue;
        }
        if (/^(SOAL|PERTANYAAN)\s*:\s*(.+)$/i.test(txt)) {
          promptHtml += sanitizeHtml(cells[ci] ?? '');
          continue;
        }
        // Opsi A–E / Pernyataan P1–P9 — label di sel sendiri, isi sel berikutnya.
        const om = /^([A-E]|P[1-9])\s*[.:)]?\s*$/i.exec(txt);
        if (om && next !== undefined) {
          choiceMap.set((om[1] ?? '').toUpperCase(), sanitizeHtml(next));
          ci++;
          continue;
        }
        // Atau satu sel: "A. teks opsi" / "P1: pernyataan".
        const om2 = /^([A-E]|P[1-9])\s*[.:)]\s*(.+)$/i.exec(txt);
        if (om2 && !/^(NO|TIPE|BOBOT)$/i.test(om2[1] ?? '')) {
          choiceMap.set((om2[1] ?? '').toUpperCase(), sanitizeHtml(cells[ci] ?? '').replace(/^([A-E]|P[1-9])\s*[.:)]\s*/i, ''));
          continue;
        }
      }
    }

    const label = `Soal tabel ke-${qIdx}`;
    if (!type) { errors.push(`${label}: TIPE tidak dikenal (PG/PGK/BS/BSK).`); continue; }
    if (!promptHtml) { errors.push(`${label}: baris SOAL kosong.`); continue; }
    if (no === null) no = questions.length + 1;

    const letters = 'ABCDE'.split('').filter((l) => choiceMap.has(l));
    const stmts = [...choiceMap.keys()].filter((k) => k.startsWith('P')).sort((a, b) => +a.slice(1) - +b.slice(1));
    const kMarks = keyRaw.split(/[,;\s]+/).filter(Boolean).map((m) => m.toUpperCase());
    const truth = (m: string) => /^(B|BENAR|TRUE)$/.test(m);
    const letterIdx = (s: string) => 'ABCDE'.indexOf(s);

    let options: unknown;
    let key: unknown;
    if (type === 'MCQ' || type === 'MCQ_COMPLEX') {
      if (letters.length < 2) { errors.push(`${label}: pilihan A–E minimal 2 baris.`); continue; }
      options = { choices: letters.map((l) => choiceMap.get(l) ?? '') };
      const idx = kMarks.map(letterIdx).filter((x) => x >= 0 && x < letters.length);
      if (type === 'MCQ') {
        if (idx.length !== 1) { errors.push(`${label}: kunci PG harus satu huruf A–E.`); continue; }
        key = idx[0];
      } else {
        if (!idx.length) { errors.push(`${label}: kunci PGK minimal satu huruf (mis. A,C).`); continue; }
        key = [...new Set(idx)];
      }
    } else if (type === 'TRUE_FALSE') {
      if (!/^(B|BENAR|S|SALAH|TRUE|FALSE)$/i.test(keyRaw)) { errors.push(`${label}: kunci BS harus B atau S.`); continue; }
      key = truth(keyRaw);
    } else {
      if (stmts.length < 2) { errors.push(`${label}: BSK butuh ≥2 pernyataan (baris P1, P2, …).`); continue; }
      options = { statements: stmts.map((k) => choiceMap.get(k) ?? '') };
      if (kMarks.length !== stmts.length || kMarks.some((m) => !/^(B|BENAR|S|SALAH|TRUE|FALSE)$/.test(m))) {
        errors.push(`${label}: kunci BSK = B/S per pernyataan, ${stmts.length} buah dipisah koma (mis. B,S,B).`); continue;
      }
      key = kMarks.map(truth);
    }

    // Ekstrak gambar dari soal + pilihan — img dipindah ke media soal bila ada di opsi.
    const { html: pHtml, images } = extractImages(promptHtml, `q${qIdx}`);
    // Opsi juga boleh bergambar — proses per item.
    if (options && typeof options === 'object') {
      const o = options as { choices?: string[]; statements?: string[] };
      const fix = (arr: string[] | undefined) => arr?.map((t) => {
        const r = extractImages(t, `q${qIdx}o`);
        images.push(...r.images);
        return r.html;
      });
      o.choices = fix(o.choices) ?? [];
      o.statements = fix(o.statements) ?? [];
    }
    questions.push({ number: no, type, weight, prompt: pHtml, options, key, images, ...(passageCode ? { passageCode } : {}) });
  }

  if (!questions.length && !passages.length && !errors.length) {
    errors.push('Tidak ada tabel soal yang dikenali — pakai template Word yang disediakan.');
  }
  const dup = new Set<number>();
  for (const q of questions) {
    if (dup.has(q.number)) errors.push(`Nomor soal ${q.number} ganda.`);
    dup.add(q.number);
  }
  return { passages, questions, errors };
}

// ================= Template Word =================

const p = (text: string, bold = false) => new Paragraph({ children: [new TextRun({ text, bold })] });
const cell = (text: string) => new TableCell({ children: [p(text)] });
const richCell = (lines: (string | { text: string; bold?: boolean; italics?: boolean })[]) =>
  new TableCell({
    children: [new Paragraph({
      children: lines.map((l) => typeof l === 'string' ? new TextRun(l) : new TextRun(l)),
    })],
  });

/** Template .docx — satu tabel per soal + tabel BACAAN, petunjuk + contoh semua tipe. */
export async function buildQuestionTemplateDocx(): Promise<Buffer> {
  const qTable = (meta: string[], soal: string, rows: [string, string][], kunci: string) =>
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        new TableRow({ children: meta.map((m) => new TableCell({ children: [p(m, true)] })) }),
        new TableRow({ children: [cell('SOAL'), cell(soal)] }),
        ...rows.map(([l, v]) => new TableRow({ children: [cell(l), cell(v)] })),
        new TableRow({ children: [cell('KUNCI'), cell(kunci)] }),
      ],
    });
  const spacer = new Paragraph({ children: [new TextRun('')] });
  const h = (t: string) => new Paragraph({ children: [new TextRun({ text: t, bold: true, size: 28 })] });
  const note = (t: string) => new Paragraph({ children: [new TextRun({ text: t, size: 20 })] });

  const passageTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({ children: [new TableCell({ children: [p('BACAAN: B1', true)] })] }),
      new TableRow({
        children: [richCell([
          { text: 'Siti adalah siswa kelas 9 yang rajin. Setiap pagi ia berangkat ke sekolah naik sepeda. Ia gemar membaca buku cerita di perpustakaan sekolah. Suatu hari ia menemukan buku tua bersampul biru di rak paling ujung. (Ganti dengan teks bacaanmu — boleh disisipi gambar.)' },
        ])],
      }),
    ],
  });

  const doc = new Document({
    sections: [{
      children: [
        h('TEMPLATE IMPORT SOAL — WORD'),
        note('Satu tabel per soal — salin blok tabel contoh sesuai kebutuhan. Tabel bacaan diawali sel "BACAAN: <kode>". Gambar boleh disisipkan langsung di sel SOAL, opsi, maupun bacaan — ikut terunggah otomatis.'),
        note('TIPE: PG = pilihan ganda (kunci 1 huruf) · PGK = pilihan ganda kompleks (kunci ≥1 huruf, mis. A,C) · BS = benar/salah (kunci B atau S) · BSK = benar/salah kompleks (baris P1–P9, kunci B/S per pernyataan, mis. B,S,B).'),
        note('BACAAN di baris meta mengacu ke kode tabel bacaan — kosongkan/tulis "-" bila tidak pakai. NO & BOBOT boleh dikosongkan (otomatis).'),
        spacer,
        h('BACAAN (opsional — letakkan di atas soal yang memakainya)'),
        passageTable,
        spacer,
        h('CONTOH 1 — Pilihan Ganda (PG)'),
        qTable(['NO: 1', 'TIPE: PG', 'BOBOT: 1', 'BACAAN: B1'],
          'Berdasarkan bacaan B1, alat transportasi Siti ke sekolah adalah…',
          [['A', 'Bus kota'], ['B', 'Sepeda'], ['C', 'Motor'], ['D', 'Jalan kaki']], 'B'),
        spacer,
        h('CONTOH 2 — Pilihan Ganda Kompleks (PGK)'),
        qTable(['NO: 2', 'TIPE: PGK', 'BOBOT: 2', 'BACAAN: -'],
          'Pilih semua bilangan prima berikut:',
          [['A', '2'], ['B', '4'], ['C', '5'], ['D', '9']], 'A,C'),
        spacer,
        h('CONTOH 3 — Benar/Salah (BS)'),
        qTable(['NO: 3', 'TIPE: BS', 'BOBOT: 1', 'BACAAN: -'],
          'Indonesia merdeka pada tahun 1945.', [], 'B'),
        spacer,
        h('CONTOH 4 — Benar/Salah Kompleks (BSK)'),
        qTable(['NO: 4', 'TIPE: BSK', 'BOBOT: 2', 'BACAAN: -'],
          'Tentukan benar/salah untuk tiap pernyataan berikut:',
          [['P1', 'Air mendidih pada suhu 100°C'], ['P2', 'Es lebih padat daripada air'], ['P3', 'Bandung terletak di Jawa Barat']], 'B,S,B'),
        spacer,
        note('Catatan: label opsi boleh ditulis "A", "A.", atau "A:" — begitu pula P1–P9 untuk BSK. Label meta & isi boleh digabung satu sel ("NO: 1") atau dipisah dua sel.'),
      ],
    }],
  });
  return Buffer.from(await Packer.toBuffer(doc));
}
