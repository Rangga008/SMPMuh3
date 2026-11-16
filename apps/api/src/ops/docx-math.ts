import { XMLParser } from 'fast-xml-parser';
import JSZip from 'jszip';

/**
 * Dukungan simbol matematika di impor Word.
 * Persamaan Word (Insert → Equation) disimpan sebagai OMML (<m:oMath>) dan
 * dibuang begitu saja oleh mammoth. Modul ini menconversi tiap blok oMath di
 * document.xml menjadi run teks "$latex$" SEBELUM mammoth membaca file, lalu
 * frontend merender $…$ via KaTeX.
 */

// ---------- konversi OMML → LaTeX ----------

type Node = Record<string, unknown>;
/** Elemen anak dengan tag tertentu — preserveOrder: elemen = {tag: anak, ':@': atribut}. */
const elems = (n: Node | Node[] | undefined, tag: string): Node[] => {
  if (!n) return [];
  const arr = Array.isArray(n) ? n : [n];
  return arr.filter((it) => it[tag] !== undefined);
};
const first = (n: Node | Node[] | undefined, tag: string) => elems(n, tag)[0];
/** Children di dalam sebuah elemen — untuk { 'm:e': [child…], ':@': … }. */
const kids = (n: Node | Node[] | undefined, tag: string): Node[] => {
  const out: Node[] = [];
  for (const el of elems(n, tag)) {
    const c = el[tag];
    if (Array.isArray(c)) out.push(...(c as Node[]));
  }
  return out;
};

const SYM: Record<string, string> = {
  '×': '\\times ', '÷': '\\div ', '−': '-', '±': '\\pm ', '∓': '\\mp ',
  '≤': '\\le ', '≥': '\\ge ', '≠': '\\ne ', '≈': '\\approx ', '≡': '\\equiv ',
  '∞': '\\infty ', 'π': '\\pi ', 'Π': '\\Pi ', '°': '^{\\circ}',
  'α': '\\alpha ', 'β': '\\beta ', 'γ': '\\gamma ', 'δ': '\\delta ',
  'ε': '\\varepsilon ', 'θ': '\\theta ', 'λ': '\\lambda ', 'μ': '\\mu ',
  'σ': '\\sigma ', 'φ': '\\varphi ', 'ω': '\\omega ', 'Ω': '\\Omega ',
  'Σ': '\\Sigma ', 'Δ': '\\Delta ', '→': '\\to ', '←': '\\leftarrow ',
  '⇒': '\\Rightarrow ', '⇔': '\\Leftrightarrow ', '↔': '\\leftrightarrow ',
  '∈': '\\in ', '∉': '\\notin ', '⊂': '\\subset ', '⊆': '\\subseteq ',
  '∪': '\\cup ', '∩': '\\cap ', '∅': '\\varnothing ', '∀': '\\forall ',
  '∃': '\\exists ', '∠': '\\angle ', '⊥': '\\perp ', '∥': '\\parallel ',
  '∴': '\\therefore ', '∵': '\\because ', '∝': '\\propto ', '·': '\\cdot ',
  '•': '\\cdot ', '⋅': '\\cdot ', '√': '\\surd ', '′': "'", '″': "''",
  '½': '\\tfrac12 ', '¼': '\\tfrac14 ', '¾': '\\tfrac34 ',
  '⟨': '\\langle ', '⟩': '\\rangle ', '⌊': '\\lfloor ', '⌋': '\\rfloor ',
  '⌈': '\\lceil ', '⌉': '\\rceil ',
};

const escText = (t: string) => {
  let s = '';
  for (const ch of t) {
    if (SYM[ch]) s += SYM[ch];
    else if (ch === '\\') s += '\\backslash ';
    else if ('{}$&#_'.includes(ch)) s += `\\${ch}`;
    else if (ch === '^') s += '\\^{}';
    else s += ch;
  }
  return s;
};

/** Teks literal sebuah node (gabungan semua teks di dalamnya). */
const rawText = (n: Node | Node[] | undefined): string => {
  if (!n) return '';
  const arr = Array.isArray(n) ? n : [n];
  let s = '';
  for (const it of arr) {
    for (const key of Object.keys(it)) {
      if (key === '#text') s += String(it[key] ?? '');
      else if (!key.startsWith(':@')) s += rawText(it[key] as Node | Node[]);
    }
  }
  return s;
};

const attr = (n: Node | undefined, name: string): string => {
  if (!n) return '';
  const a = n[':@'] as Record<string, string> | undefined;
  return a?.[`@_${name}`] ?? '';
};

const DELIM: Record<string, string> = {
  '(': '(', ')': ')', '[': '[', ']': ']', '{': '\\{', '}': '\\}',
  '|': '|', '⌊': '\\lfloor ', '⌋': '\\rfloor ', '⌈': '\\lceil ',
  '⌉': '\\rceil ', '⟨': '\\langle ', '⟩': '\\rangle ',
};
const NARY: Record<string, string> = {
  '∑': '\\sum', '∏': '\\prod', '∐': '\\coprod', '∫': '\\int',
  '∬': '\\iint', '∭': '\\iiint', '∮': '\\oint', '⋂': '\\bigcap',
  '⋃': '\\bigcup', '⋁': '\\bigvee', '⋀': '\\bigwedge',
};
const ACC: Record<string, string> = {
  '̂': '\\hat', 'ˆ': '\\hat', '¯': '\\bar', '‾': '\\overline',
  '˙': '\\dot', '¨': '\\ddot', '˜': '\\tilde', '⃗': '\\vec',
  'ˇ': '\\check', '˘': '\\breve',
};
const FUNC = new Set(['sin','cos','tan','cot','sec','csc','ln','log','lim','min','max','arg','deg','det','exp','inf','sup','gcd','ker','dim','hom','mod','Pr']);

const br = (s: string) => `{${s}}`;
/** Render satu m:e dkk — bila multi-elemen, gabungkan. */
const renderKids = (n: Node | Node[] | undefined): string => render(n);

function render(n: Node | Node[] | undefined): string {
  if (!n) return '';
  const arr = Array.isArray(n) ? n : [n];
  let out = '';
  for (const item of arr) {
    for (const [tag, v] of Object.entries(item)) {
      const children = v as Node[] | undefined;
      switch (tag) {
        case '#text': {
          out += escText(String(v ?? ''));
          break;
        }
        case 'm:t': case 'w:t': {
          out += escText(rawText(children));
          break;
        }
        case ':@': break;
        case 'm:r': case 'w:r': case 'm:e': case 'm:num': case 'm:den':
        case 'm:sub': case 'm:sup': case 'm:deg': case 'm:lim': case 'm:fName':
        case 'm:mr': case 'm:oMath': case 'm:oMathPara':
        case 'm:box': case 'm:borderBox': case 'm:phant': case 'm:phantPr':
          out += render(children);
          break;
        case 'm:sSup': {
          out += `${render(first(v as Node, 'm:e')) || '{}'}^${br(render(first(v as Node, 'm:sup')))}`;
          break;
        }
        case 'm:sSub': {
          out += `${render(first(v as Node, 'm:e')) || '{}'}_${br(render(first(v as Node, 'm:sub')))}`;
          break;
        }
        case 'm:sSubSup': {
          out += `${render(first(v as Node, 'm:e')) || '{}'}_${br(render(first(v as Node, 'm:sub')))}^${br(render(first(v as Node, 'm:sup')))}`;
          break;
        }
        case 'm:f': {
          const num = render(first(v as Node, 'm:num'));
          const den = render(first(v as Node, 'm:den'));
          out += `\\frac${br(num || ' ')}${br(den || ' ')}`;
          break;
        }
        case 'm:rad': {
          const deg = render(first(v as Node, 'm:deg'));
          const e = render(first(v as Node, 'm:e'));
          out += deg ? `\\sqrt[${deg}]${br(e)}` : `\\sqrt${br(e)}`;
          break;
        }
        case 'm:d': {
          const pr = first(v as Node, 'm:dPr');
          const beg = attr(first(pr, 'm:begChr'), 'm:val') || '(';
          const end = attr(first(pr, 'm:endChr'), 'm:val') || ')';
          const es = kids(v as Node, 'm:e').map((x) => render(x)).join(' , ');
          out += `\\left${DELIM[beg] ?? beg} ${es} \\right${DELIM[end] ?? end}`;
          break;
        }
        case 'm:nary': {
          const pr = first(v as Node, 'm:naryPr');
          const chr = attr(first(pr, 'm:chr'), 'm:val') || '∑';
          const op = NARY[chr] ?? '\\sum';
          const hidden = (el: Node | undefined) =>
            !!el && !['0', 'false', 'off'].includes(attr(el, 'm:val'));
          const subHide = hidden(first(pr, 'm:subHide'));
          const supHide = hidden(first(pr, 'm:supHide'));
          const sub = render(first(v as Node, 'm:sub'));
          const sup = render(first(v as Node, 'm:sup'));
          const e = render(first(v as Node, 'm:e'));
          out += op;
          if (sub && !subHide) out += `_${br(sub)}`;
          if (sup && !supHide) out += `^${br(sup)}`;
          out += ` ${e}`;
          break;
        }
        case 'm:func': {
          const fName = first(v as Node, 'm:fName');
          const fKids = (fName?.['m:fName'] as Node[] | undefined) ?? [];
          const e = render(first(v as Node, 'm:e'));
          if (elems(fKids, 'm:limLow').length || elems(fKids, 'm:limUpp').length) {
            // lim dsb — batas atas/bawah di-render limLow/limUpp sendiri.
            out += render(fName) + (e ? ` ${e}` : '');
          } else {
            const name = rawText(fName).trim() || 'f';
            out += FUNC.has(name.toLowerCase()) ? `\\${name.toLowerCase()} ${e}` : `${name} ${e}`;
          }
          break;
        }
        case 'm:acc': {
          const chr = attr(first(first(v as Node, 'm:accPr'), 'm:chr'), 'm:val') || '̂';
          out += `${ACC[chr] ?? '\\hat'}${br(render(first(v as Node, 'm:e')))}`;
          break;
        }
        case 'm:bar': {
          const pos = attr(first(first(v as Node, 'm:barPr'), 'm:pos'), 'm:val');
          const e = br(render(first(v as Node, 'm:e')));
          out += pos === 'bot' ? `\\underline${e}` : `\\overline${e}`;
          break;
        }
        case 'm:groupChr': {
          const chr = attr(first(first(v as Node, 'm:groupChrPr'), 'm:chr'), 'm:val');
          const e = render(first(v as Node, 'm:e'));
          const lim = render(first(v as Node, 'm:lim'));
          out += (chr === '︷' || chr === '⏞') ? `\\overbrace${br(e)}${lim ? `^${br(lim)}` : ''}` : `\\underbrace${br(e)}${lim ? `_${br(lim)}` : ''}`;
          break;
        }
        case 'm:limLow': {
          const base = render(first(v as Node, 'm:e'));
          const bn = FUNC.has(base.trim().toLowerCase()) ? `\\${base.trim()}` : base;
          out += `${bn}_${br(render(first(v as Node, 'm:lim')))}`;
          break;
        }
        case 'm:limUpp': {
          const base = render(first(v as Node, 'm:e'));
          const bn = FUNC.has(base.trim().toLowerCase()) ? `\\${base.trim()}` : base;
          out += `${bn}^${br(render(first(v as Node, 'm:lim')))}`;
          break;
        }
        case 'm:m': {
          const rows = kids(v as Node, 'm:mr').map((r) =>
            kids(r, 'm:e').map((c) => render(c)).join(' & '),
          );
          out += `\\begin{pmatrix} ${rows.join(' \\\\ ')} \\end{pmatrix}`;
          break;
        }
        case 'm:eqArr': {
          const lines = kids(v as Node, 'm:e').map((c) => render(c));
          out += `\\begin{array}{l} ${lines.join(' \\\\ ')} \\end{array}`;
          break;
        }
        default: {
          // *Pr (properties) & elemen tak dikenal — properti dilewati, lainnya dirender.
          if (!tag.endsWith('Pr') && !tag.startsWith(':@')) out += render(children);
          break;
        }
      }
    }
  }
  return out;
}

const xml = new XMLParser({ preserveOrder: true, ignoreAttributes: false, attributeNamePrefix: '@_' });

/** Konversi satu blok "<m:oMath>…</m:oMath>" menjadi LaTeX. */
export function ommlToLatex(block: string): string {
  try {
    const parsed = xml.parse(block) as Node[];
    const tex = render(parsed).replace(/\s+/g, ' ').replace(/\s*([_^])/g, '$1').trim();
    return tex;
  } catch {
    // Fallback: ambil teks literalnya saja.
    return escText(block.replace(/<[^>]+>/g, '')).trim();
  }
}

const escXml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const runText = (tex: string) =>
  `<w:r><w:rPr><w:i/></w:rPr><w:t xml:space="preserve"> $${escXml(tex)}$ </w:t></w:r>`;

/**
 * Baca .docx → konversi semua persamaan OMML menjadi run teks "$latex$",
 * lalu kembalikan buffer .docx baru yang aman dibaca mammoth.
 */
export async function inlineMathInDocx(buf: Buffer): Promise<Buffer> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(buf);
  } catch {
    return buf; // bukan zip/docx — biarkan mammoth yang menolak.
  }
  const docFile = zip.file('word/document.xml');
  if (!docFile) return buf;
  let xmlStr = await docFile.async('string');
  const hasMath = xmlStr.includes('<m:oMath');
  const hasVert = xmlStr.includes('w:vertAlign');
  if (!hasMath && !hasVert) return buf;

  // Pangkat/bawah yang diketik sebagai FORMAT teks (Ctrl+=, Ctrl+Shift+=)
  // — w:vertAlign superscript/subscript — diabaikan mammoth. Ubah tiap run
  // vertAlign menjadi run teks LaTeX ${}^{n}$ / $_{n}$ supaya ter-render KaTeX.
  xmlStr = xmlStr.replace(/<w:r\b[^>]*>[\s\S]*?<\/w:r>/g, (run) => {
    const va = /<w:vertAlign[^>]*w:val="(superscript|subscript)"/.exec(run)?.[1];
    if (!va) return run;
    const texts = [...run.matchAll(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g)].map((m) => m[1]).join('');
    if (!texts.trim()) return run;
    const sym = va === 'superscript' ? '^' : '_';
    return `<w:r><w:t xml:space="preserve">${'$'}{}${sym}{${escXml(texts)}}$</w:t></w:r>`;
  });

  // Blok display: <m:oMathPara>…</m:oMathPara> — ganti dengan paragraf teks berisi $…$.
  xmlStr = xmlStr.replace(/<m:oMathPara\b[^>]*>([\s\S]*?)<\/m:oMathPara>/g, (whole) => {
    const inner = [...whole.matchAll(/<m:oMath\b[^>]*>[\s\S]*?<\/m:oMath>/g)]
      .map((m) => ommlToLatex(m[0])).filter(Boolean).join(' \\quad ');
    return `<w:p>${runText(inner)}</w:p>`;
  });
  // Inline: <m:oMath>…</m:oMath> tersisa → run teks di paragraf yang sama.
  xmlStr = xmlStr.replace(/<m:oMath\b[^>]*>[\s\S]*?<\/m:oMath>/g, (whole) => runText(ommlToLatex(whole)));

  zip.file('word/document.xml', xmlStr);
  return Buffer.from(await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }));
}
