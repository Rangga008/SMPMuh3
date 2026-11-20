'use client';

import katex from 'katex';
import { API } from './api';

/** Render "$…$"/"$$…$$" di HTML menjadi rumus KaTeX — dari persamaan Word hasil impor. */
export const renderMathHtml = (html: string) =>
  html.replace(/\$\$([^$<]+?)\$\$|\$([^$<\n]+?)\$/g, (whole, disp: string, inl: string) => {
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
