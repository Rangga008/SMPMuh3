'use client';

import katex from 'katex';
import { API } from './api';

/**
 * Matematika telanjang (tanpa "$…$") yang umum diketik guru — konversi ke LaTeX
 * lalu ikut dirender: pangkat `x^2`/`x^{2n}`/`x^(a+b)`, subskrip `x_1`/`x_{ij}`,
 * dan `sqrt(…)`/`akar(…)`/`sqrt16`. Hanya menyentuh segmen teks biasa — tag
 * HTML dan rumus "$…$" yang sudah ada tidak diubah.
 */
const bareMathSeg = (seg: string) =>
  seg
    // LaTeX telanjang duluan — bila tidak, hasil konversi sqrt(…) di bawah
    // ikut tertimpa pola \sqrt{…} dan berakhir jadi $$…$$ display-mode.
    .replace(/\\sqrt\{([^}]*)\}/g, '$$\\sqrt{$1}$$')
    .replace(/\\frac\{([^}]*)\}\{([^}]*)\}/g, '$$\\frac{$1}{$2}$$')
    // akar kuadrat: sqrt(…) / akar(…) / sqrt 16
    .replace(/\b(?:sqrt|akar)\s*\(([^()]*(?:\([^()]*\)[^()]*)*)\)/gi, '$$\\sqrt{$1}$$')
    .replace(/\bsqrt\s+(\d+)/gi, '$$\\sqrt{$1}$$')
    // pangkat: x^{…} → x^(…) → x^a
    .replace(/([a-zA-Z0-9.,)\]}])\^\{([^}]*)\}/g, '$$$1^{$2}$$')
    .replace(/([a-zA-Z0-9.,)\]}])\^\(([^()]*)\)/g, '$$$1^{$2}$$')
    .replace(/([a-zA-Z0-9.,])\^([a-zA-Z0-9.]+)/g, '$$$1^{$2}$$')
    // subskrip: a_{ij} / a_12 — hanya huruf dasar + angka/kurawal (teks seperti file_name aman)
    .replace(/\b([a-zA-Z])_\{([^}]*)\}/g, '$$$1_{$2}$$')
    .replace(/\b([a-zA-Z])_(\d+)/g, '$$$1_{$2}$$');

const autoMath = (html: string) =>
  html
    .split(/(<[^>]+>|\$\$[^$]+?\$\$|\$[^$\n]+?\$)/g)
    .map((seg) => (seg.startsWith('<') || seg.startsWith('$') ? seg : bareMathSeg(seg)))
    .join('');

/** Render "$…$"/"$$…$$" di HTML menjadi rumus KaTeX — dari persamaan Word hasil impor,
    plus pola matematika telanjang yang lazim diketik (x^2, sqrt(…), x_1). */
export const renderMathHtml = (html: string) =>
  autoMath(html).replace(/\$\$([^$<]+?)\$\$|\$([^$<\n]+?)\$/g, (whole, disp: string, inl: string) => {
    const tex = disp ?? inl;
    try {
      return katex.renderToString(tex, { throwOnError: false, displayMode: disp !== undefined });
    } catch {
      return whole;
    }
  });

/**
 * Sanitasi HTML soal/bacaan sebelum dangerouslySetInnerHTML — whitelist tag
 * aman; script/style/event-handler/atribut lain dibuang. Mirror sanitizer
 * server (question-docx) — melindungi konten lama & jalur tulis lain.
 */
export const sanitizeRichHtml = (html: string) => {
  let out = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '');
  out = out.replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '');
  out = out.replace(/\sstyle\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '');
  const keep = /^(p|b|i|u|em|strong|ul|ol|li|br|img|sup|sub|span|div|table|thead|tbody|tr|td|th|h[1-6]|hr|blockquote)$/i;
  out = out.replace(/<\/?([a-zA-Z0-9]+)((?:\s[^<>]*)?)>/g, (m, tag: string, attrs: string) => {
    const t = tag.toLowerCase();
    if (!keep.test(t)) return '';
    if (t === 'img') {
      const src = /\ssrc\s*=\s*"([^"]*)"/i.exec(attrs)?.[1] ?? '';
      return src ? `<img src="${src}">` : '';
    }
    return m.startsWith('</') ? `</${t}>` : `<${t}>`;
  });
  return out;
};

/** HTML soal siap tampil — sanitasi + media relatif-API + rumus sekaligus. */
export const richHtml = (html: string) =>
  renderMathHtml(
    sanitizeRichHtml(html).replace(/src="(\/cbt\/media\/[^"]+)"/g, (_, s: string) => `src="${API}${s}"`),
  );
