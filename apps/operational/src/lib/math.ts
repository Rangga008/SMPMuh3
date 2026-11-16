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

/** HTML soal siap tampil — media relatif-API + rumus sekaligus. */
export const richHtml = (html: string) =>
  renderMathHtml(
    html.replace(/src="(\/cbt\/media\/[^"]+)"/g, (_, s: string) => `src="${API}${s}"`),
  );
