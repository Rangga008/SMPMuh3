'use client';

import katex from 'katex';
import { API } from './api';

/**
 * Matematika telanjang (tanpa "$…$") yang umum diketik guru — konversi ke LaTeX
 * lalu ikut dirender. Hanya menyentuh segmen teks biasa — tag HTML dan rumus
 * "$…$" yang sudah ada tidak diubah.
 */
const LATEX_FUNCS =
  // Perintah LaTeX tanpa argumen yang boleh diketik telanjang: \times \leq \sin …
  'arcsin|arccos|arctan|sinh|cosh|tanh|coth|sin|cos|tan|cot|sec|csc|liminf|limsup|lim|log|ln|lg|exp|arg|deg|det|dim|gcd|ker|hom|inf|sup|min|max|Pr' +
  '|lfloor|rfloor|lceil|rceil|langle|rangle|sum|prod|coprod|iiint|iint|oint|int|bigcap|bigcup|biguplus|bigsqcup|bigvee|bigwedge|bigodot|bigoplus|bigotimes' +
  '|alpha|beta|gamma|delta|epsilon|varepsilon|zeta|eta|theta|vartheta|iota|kappa|lambda|mu|nu|xi|pi|varpi|rho|varrho|sigma|varsigma|tau|upsilon|phi|varphi|chi|psi|omega' +
  '|Gamma|Delta|Theta|Lambda|Xi|Pi|Sigma|Upsilon|Phi|Psi|Omega' +
  '|times|div|cdot|cdots|ldots|dots|vdots|ddots|pm|mp|circ|bullet|star|ast|oplus|ominus|otimes|oslash|odot|diamond|triangle|prime|backslash' +
  '|le|leq|leqq|ge|geq|geqq|neq|approx|equiv|sim|simeq|cong|propto|parallel|nparallel|perp|mid|nmid|models|vdash|dashv' +
  '|prec|succ|preceq|succeq|ll|gg|subseteqq|supseteqq|nsubseteq|nsupseteq|subset|supset|subseteq|supseteq|sqsubseteq|sqsupseteq' +
  '|notin|ni|in|cup|cap|uplus|sqcap|sqcup|setminus|smallsetminus|emptyset|varnothing|infty|partial|nabla|aleph|ell|hbar|Re|Im|wp|forall|exists|nexists' +
  '|therefore|because|top|bot|angle|measuredangle|sphericalangle|bowtie|smile|frown|Join|wr|lhd|rhd|unlhd|unrhd' +
  '|triangleleft|triangleright|bigtriangleup|bigtriangledown|bigcirc' +
  '|rightarrow|leftarrow|leftrightarrow|Rightarrow|Leftarrow|Leftrightarrow|iff|mapsto|hookleftarrow|hookrightarrow|to|gets' +
  '|uparrow|downarrow|updownarrow|Uparrow|Downarrow|Updownarrow|nearrow|searrow|swarrow|nwarrow' +
  '|longrightarrow|longleftarrow|longleftrightarrow|Longrightarrow|Longleftarrow|Longleftrightarrow';
// Fungsi kata tanpa backslash (notasi Indonesia): log_2, sin^2, tg_3, ctg_1…
const WORD_FUNCS = 'arcsin|arccos|arctan|ctg|tg|sin|cos|tan|cot|sec|csc|lim|log|ln|lg|sum|prod|int';
const WORD_FUNC_MAP: Record<string, string> = { tg: 'tan', ctg: 'cot' };
const PAREN_INNER = String.raw`[^()]*(?:\([^()]*\)[^()]*)*`; // isi kurung 1 tingkat
const SCRIPT_ARG = String.raw`\{[^}]*\}|-?[a-zA-Z0-9.]+`; // isi pangkat/subskrip
const GUARD = String.raw`[^\u0001\u0002\\a-zA-Z]`; // penjaga: bukan \ / huruf / token penahan

// ---- Simbol Unicode yang diketik/disalin guru (x², √3, π, ≤, ½, 30°) ----
const SUP_CHARS = '⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻⁽⁾ⁿˣʸ';
const SUB_CHARS = '₀₁₂₃₄₅₆₇₈₉₊₋₍₎ₐₑₒₓₕₖₗₘₙₚₛₜ';
const SUP_MAP: Record<string, string> = {
  '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9',
  '⁺': '+', '⁻': '-', '⁽': '(', '⁾': ')', 'ⁿ': 'n', 'ˣ': 'x', 'ʸ': 'y',
};
const SUB_MAP: Record<string, string> = {
  '₀': '0', '₁': '1', '₂': '2', '₃': '3', '₄': '4', '₅': '5', '₆': '6', '₇': '7', '₈': '8', '₉': '9',
  '₊': '+', '₋': '-', '₍': '(', '₎': ')', 'ₐ': 'a', 'ₑ': 'e', 'ₒ': 'o', 'ₓ': 'x',
  'ₕ': 'h', 'ₖ': 'k', 'ₗ': 'l', 'ₘ': 'm', 'ₙ': 'n', 'ₚ': 'p', 'ₛ': 's', 'ₜ': 't',
};
const supTex = (s: string) => [...s].map((c) => SUP_MAP[c] ?? c).join('');
const subTex = (s: string) => [...s].map((c) => SUB_MAP[c] ?? c).join('');

// Simbol berdiri sendiri → perintah LaTeX. Tanda '−' (U+2212) dinormalkan ke '-'
// biasa, '×'/'÷' di dalam rumus sudah didukung KaTeX apa adanya.
const SYM_MAP: Record<string, string> = {
  'α': '\\alpha', 'β': '\\beta', 'γ': '\\gamma', 'δ': '\\delta', 'ε': '\\varepsilon', 'ζ': '\\zeta',
  'η': '\\eta', 'θ': '\\theta', 'ι': '\\iota', 'κ': '\\kappa', 'λ': '\\lambda', 'μ': '\\mu',
  'ν': '\\nu', 'ξ': '\\xi', 'ο': 'o', 'π': '\\pi', 'ρ': '\\rho', 'σ': '\\sigma', 'τ': '\\tau',
  'υ': '\\upsilon', 'φ': '\\varphi', 'χ': '\\chi', 'ψ': '\\psi', 'ω': '\\omega',
  'Γ': '\\Gamma', 'Δ': '\\Delta', 'Θ': '\\Theta', 'Λ': '\\Lambda', 'Ξ': '\\Xi', 'Π': '\\Pi',
  'Σ': '\\Sigma', 'Φ': '\\Phi', 'Ψ': '\\Psi', 'Ω': '\\Omega',
  '∞': '\\infty', '±': '\\pm', '∓': '\\mp', '×': '\\times', '÷': '\\div', '·': '\\cdot',
  '≠': '\\neq', '≤': '\\leq', '≥': '\\geq', '≈': '\\approx', '≅': '\\cong', '≡': '\\equiv', '∝': '\\propto',
  '∠': '\\angle', '⊥': '\\perp', '∥': '\\parallel', '∴': '\\therefore', '∵': '\\because',
  '∈': '\\in', '∉': '\\notin', '∋': '\\ni', '∪': '\\cup', '∩': '\\cap',
  '⊂': '\\subset', '⊃': '\\supset', '⊆': '\\subseteq', '⊇': '\\supseteq', '⊄': '\\nsubseteq', '∅': '\\varnothing',
  '∀': '\\forall', '∃': '\\exists', '∑': '\\sum', '∏': '\\prod', '∫': '\\int', '∂': '\\partial', '∇': '\\nabla',
  '→': '\\to', '←': '\\gets', '↔': '\\leftrightarrow', '⇒': '\\Rightarrow', '⇐': '\\Leftarrow', '⇔': '\\Leftrightarrow',
  '↑': '\\uparrow', '↓': '\\downarrow', '′': "'", '″': "''",
  'ℕ': '\\mathbb{N}', 'ℤ': '\\mathbb{Z}', 'ℚ': '\\mathbb{Q}', 'ℝ': '\\mathbb{R}', 'ℂ': '\\mathbb{C}',
};
const SYM_CLASS = `[${Object.keys(SYM_MAP).join('')}]`;
const FRAC_CHARS = '½⅓⅔¼¾⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞';
const FRAC_MAP: Record<string, string> = {
  '½': '{1}{2}', '⅓': '{1}{3}', '⅔': '{2}{3}', '¼': '{1}{4}', '¾': '{3}{4}',
  '⅕': '{1}{5}', '⅖': '{2}{5}', '⅗': '{3}{5}', '⅘': '{4}{5}', '⅙': '{1}{6}', '⅚': '{5}{6}',
  '⅛': '{1}{8}', '⅜': '{3}{8}', '⅝': '{5}{8}', '⅞': '{7}{8}',
};
const FRAC_BASE = String.raw`(?:\(${PAREN_INNER}\)|\d[\d.,]*|[a-zA-Z])`; // pembilang/penyebut sederhana

type Sub = (s: string) => string;
// Konversi pola telanjang ke LaTeX mentah (TANPA pembungkus $) — untuk isi
// \sqrt{…}, \frac{…}, dan basis pangkat berkurung. Rekursif utk kurung bersarang.
const texify = (s: string, sub: Sub): string =>
  sub(s)
    .replace(new RegExp(`(?:sqrt|akar)\\s*\\((${PAREN_INNER})\\)`, 'gi'), (_m, i: string) => `\\sqrt{${texify(i, sub)}}`)
    .replace(/(?:sqrt|akar)\s*\{([^}]*)\}/gi, (_m, i: string) => `\\sqrt{${texify(i, sub)}}`)
    .replace(new RegExp(`(?:√|&radic;)\\s*\\((${PAREN_INNER})\\)`, 'g'), (_m, i: string) => `\\sqrt{${texify(i, sub)}}`)
    .replace(/(?:√|&radic;)\s*([\da-zA-Z]+)/g, '\\sqrt{$1}')
    .replace(new RegExp(`\\((${PAREN_INNER})\\)\\s*\\/\\s*\\((${PAREN_INNER})\\)`, 'g'), (_m, a: string, b: string) => `\\frac{${texify(a, sub)}}{${texify(b, sub)}}`)
    .replace(new RegExp(`(\\d[\\d.,]*|[a-zA-Z])\\s*\\/\\s*\\((${PAREN_INNER})\\)`, 'g'), (_m, a: string, b: string) => `\\frac{${a}}{${texify(b, sub)}}`)
    .replace(new RegExp(`\\((${PAREN_INNER})\\)\\s*\\/\\s*(\\d[\\d.,]*|[a-zA-Z])`, 'g'), (_m, a: string, b: string) => `\\frac{${texify(a, sub)}}{${b}}`)
    .replace(/(\d[\d.,]*|[a-zA-Z.,)\]}])\^\{([^}]*)\}/g, '$1^{$2}')
    .replace(new RegExp(`(\\d[\\d.,]*|[a-zA-Z.,)\\]}])\\^\\((${PAREN_INNER})\\)`, 'g'), '$1^{($2)}')
    .replace(/(\d[\d.,]*|[a-zA-Z.,)\]}])\^(-?[a-zA-Z0-9.]+)/g, '$1^{$2}')
    .replace(/(\d[\d.,]*|[a-zA-Z)\]}])([⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻⁽⁾ⁿˣʸ]+)/g, (_m, b: string, e: string) => `${b}^{${supTex(e)}}`)
    .replace(/\b([a-zA-Z])_\{([^}]*)\}/g, '$1_{$2}')
    .replace(/\b([a-zA-Z])_(\d+)/g, '$1_{$2}')
    .replace(/\b([a-zA-Z])([₀₁₂₃₄₅₆₇₈₉₊₋₍₎ₐₑₒₓₕₖₗₘₙₚₛₜ]+)/g, (_m, b: string, e: string) => `${b}_{${subTex(e)}}`)
    .replace(new RegExp(SYM_CLASS, 'g'), (ch) => SYM_MAP[ch] ?? ch)
    .replace(/−/g, '-');

const bareMathSeg = (seg: string) => {
  // Token penahan — setiap rumus hasil konversi disimpan di `held` dan diwakili
  // penanda \u0001n\u0002 agar pola berikutnya tidak menyentuh isinya (mencegah
  // konversi ganda/rusak pada rumus bersarang seperti sqrt(x^2) atau (3^x)^x).
  const held: string[] = [];
  const hold = (tex: string) => `\u0001${held.push(tex) - 1}\u0002`;
  const sub: Sub = (s) => s.replace(/\u0001(\d+)\u0002/g, (_m, i: string) => held[+i] ?? '');
  const unbrace = (s: string) => (s.startsWith('{') && s.endsWith('}') ? s.slice(1, -1) : s);
  const wf = (f: string) => WORD_FUNC_MAP[f.toLowerCase()] ?? f.toLowerCase();
  const out = seg
    // LaTeX telanjang lebih dulu — isinya ikut di-texify (\sqrt{x^2} → \sqrt{x^{2}}).
    .replace(/\\sqrt\s*\[([^\]]+)\]\s*\{([^}]*)\}/g, (_m, n: string, i: string) => hold(`\\sqrt[${n}]{${texify(i, sub)}}`))
    .replace(/\\sqrt\s*\{([^}]*)\}/g, (_m, i: string) => hold(`\\sqrt{${texify(i, sub)}}`))
    .replace(new RegExp(`\\\\sqrt\\s*\\((${PAREN_INNER})\\)`, 'g'), (_m, i: string) => hold(`\\sqrt{${texify(i, sub)}}`))
    .replace(/\\sqrt\s+([a-zA-Z0-9.]+)/g, (_m, i: string) => hold(`\\sqrt{${i}}`))
    .replace(/\\(frac|dfrac|tfrac|cfrac|binom|dbinom|tbinom)\s*\{([^}]*)\}\s*\{([^}]*)\}/g, (_m, f: string, a: string, b: string) =>
      hold(`\\${f}{${texify(a, sub)}}{${texify(b, sub)}}`))
    // Makro berargumen lain: \overline{AB}, \vec{v}, \hat{x}, \text{…}, …
    .replace(/\\(overline|underline|widehat|widetilde|overrightarrow|overleftarrow|vec|hat|bar|dot|ddot|tilde|mathring|check|breve|acute|grave)\s*\{([^}]*)\}/g, (_m, f: string, i: string) =>
      hold(`\\${f}{${texify(i, sub)}}`))
    .replace(/\\(text|mathrm|mathbf|mathit|mathsf|mathnormal|operatorname|textbf|textit|textrm|textsf)\s*\{([^}]*)\}/g, (_m, f: string, i: string) =>
      hold(`\\${f}{${i}}`))
    // \sin^2 x, \log_2, \sum_{i=1}^{n}, \times — perintah LaTeX telanjang (maks 2 skrip)
    .replace(new RegExp(`\\\\(${LATEX_FUNCS})((?:[\\^_](?:${SCRIPT_ARG})){1,2})`, 'g'), (_m, f: string, s: string) => hold(`\\${f}${s}`))
    .replace(new RegExp(`\\\\(${LATEX_FUNCS})\\b`, 'g'), (_m, f: string) => hold(`\\${f}`))
    // Akar berindeks: ³√8 / ∛x / ∜16 — sebelum aturan √ polos
    .replace(new RegExp(`([⁰¹²³⁴⁵⁶⁷⁸⁹]+)\\s*(?:√|&radic;)\\s*\\((${PAREN_INNER})\\)`, 'g'), (_m, n: string, i: string) => hold(`\\sqrt[${supTex(n)}]{${texify(i, sub)}}`))
    .replace(/([⁰¹²³⁴⁵⁶⁷⁸⁹]+)\s*(?:√|&radic;)\s*([\da-zA-Z]+)/g, (_m, n: string, i: string) => hold(`\\sqrt[${supTex(n)}]{${i}}`))
    .replace(new RegExp(`∛\\s*\\((${PAREN_INNER})\\)`, 'g'), (_m, i: string) => hold(`\\sqrt[3]{${texify(i, sub)}}`))
    .replace(/∛\s*([\da-zA-Z]+)/g, (_m, i: string) => hold(`\\sqrt[3]{${i}}`))
    .replace(new RegExp(`∜\\s*\\((${PAREN_INNER})\\)`, 'g'), (_m, i: string) => hold(`\\sqrt[4]{${texify(i, sub)}}`))
    .replace(/∜\s*([\da-zA-Z]+)/g, (_m, i: string) => hold(`\\sqrt[4]{${i}}`))
    // Akar kuadrat: √x / √(…) / sqrt(…) / akar(…) / sqrt{…} / sqrt 16 / akar 9
    .replace(new RegExp(`(?:√|&radic;)\\s*\\((${PAREN_INNER})\\)`, 'g'), (_m, i: string) => hold(`\\sqrt{${texify(i, sub)}}`))
    .replace(/(?:√|&radic;)\s*([\da-zA-Z]+)/g, (_m, i: string) => hold(`\\sqrt{${i}}`))
    .replace(new RegExp(`(^|${GUARD})(?:sqrt|akar)\\s*\\((${PAREN_INNER})\\)`, 'gi'), (_m, p: string, i: string) => `${p}${hold(`\\sqrt{${texify(i, sub)}}`)}`)
    .replace(new RegExp(`(^|${GUARD})(?:sqrt|akar)\\s*\\{([^}]*)\\}`, 'gi'), (_m, p: string, i: string) => `${p}${hold(`\\sqrt{${texify(i, sub)}}`)}`)
    .replace(new RegExp(`(^|${GUARD})(?:sqrt|akar)\\s+(\\d+)`, 'gi'), (_m, p: string, i: string) => `${p}${hold(`\\sqrt{${i}}`)}`)
    // Pecahan garis miring: (a)/(b) → a/(b) → (a)/b → 1/2 (tanggal 12/05/2026 aman)
    .replace(new RegExp(`\\((${PAREN_INNER})\\)\\s*\\/\\s*\\((${PAREN_INNER})\\)`, 'g'), (_m, a: string, b: string) => hold(`\\frac{${texify(a, sub)}}{${texify(b, sub)}}`))
    .replace(new RegExp(`(\\d[\\d.,]*|[a-zA-Z])\\s*\\/\\s*\\((${PAREN_INNER})\\)`, 'g'), (_m, a: string, b: string) => hold(`\\frac{${a}}{${texify(b, sub)}}`))
    .replace(new RegExp(`\\((${PAREN_INNER})\\)\\s*\\/\\s*(\\d[\\d.,]*|[a-zA-Z])`, 'g'), (_m, a: string, b: string) => hold(`\\frac{${texify(a, sub)}}{${b}}`))
    .replace(/(^|[^\d/.,])(\d[\d.,]*)\s*\/\s*(\d[\d.,]*)(?![\d/.,])/g, (_m, p: string, a: string, b: string) => `${p}${hold(`\\frac{${a}}{${b}}`)}`)
    // Pangkat berbasis kurung utuh: (3^x)^x → (3^{x})^{x} — sebelum pola ^ umum
    .replace(new RegExp(`\\((${PAREN_INNER})\\)\\^(\\{[^}]*\\}|\\((${PAREN_INNER})\\)|-?[a-zA-Z0-9.]+)`, 'g'), (_m, b: string, e: string) =>
      hold(`\\left(${texify(b, sub)}\\right)^{${texify(unbrace(e), sub)}}`))
    // Fungsi kata: log_2, sin^2 x, tg_3, lim_{x→0}, sum_{i=1} …
    .replace(new RegExp(`(^|${GUARD})(${WORD_FUNCS})((?:[\\^_](?:${SCRIPT_ARG})){1,2})`, 'g'), (_m, p: string, f: string, s: string) => `${p}${hold(`\\${wf(f)}${s}`)}`)
    .replace(new RegExp(`(^|${GUARD})(${WORD_FUNCS})\\b`, 'g'), (_m, p: string, f: string) => `${p}${hold(`\\${wf(f)}`)}`)
    // Pangkat+subskrip gabungan: x_1^2 → x_{1}^{2} — sebelum pola _ dan ^ umum
    .replace(/\b([a-zA-Z])_(\{[^}]*\}|\d+)\^(\{[^}]*\}|[a-zA-Z0-9.]+)/g, (_m, l: string, s1: string, s2: string) => hold(`${l}_{${unbrace(s1)}}^{${unbrace(s2)}}`))
    // Subskrip: a_{ij} / a_12 / a_(i+1) — satu huruf dasar agar file_name aman
    .replace(/\b([a-zA-Z])_\{([^}]*)\}/g, (_m, l: string, s: string) => hold(`${l}_{${s}}`))
    .replace(new RegExp(`\\b([a-zA-Z])_\\((${PAREN_INNER})\\)`, 'g'), (_m, l: string, s: string) => hold(`${l}_{(${texify(s, sub)})}`))
    .replace(/\b([a-zA-Z])_(\d+)/g, (_m, l: string, s: string) => hold(`${l}_{${s}}`))
    // Skrip Unicode: x₁² (gabungan) → x_{1}^{2}, lalu x₁ → x_{1}, x² → x^{2}
    .replace(new RegExp(`\\b([a-zA-Z])([${SUB_CHARS}]+)([${SUP_CHARS}]+)`, 'g'), (_m, b: string, s1: string, s2: string) => hold(`${b}_{${subTex(s1)}}^{${supTex(s2)}}`))
    .replace(new RegExp(`\\b([a-zA-Z])([${SUB_CHARS}]+)`, 'g'), (_m, b: string, e: string) => hold(`${b}_{${subTex(e)}}`))
    .replace(new RegExp(`\\((${PAREN_INNER})\\)([${SUP_CHARS}]+)`, 'g'), (_m, b: string, e: string) => hold(`\\left(${texify(b, sub)}\\right)^{${supTex(e)}}`))
    .replace(new RegExp(`(\\d[\\d.,]*|[a-zA-Z)\\]}])([${SUP_CHARS}]+)`, 'g'), (_m, b: string, e: string) => hold(`${b}^{${supTex(e)}}`))
    // Pangkat: ^{…} → ^(…) → ^o (derajat) → ^a / ^-2 — basis angka boleh
    // multi-digit (10^-2), huruf satu karakter (3x^2 → 3·x²), atau ) ] }
    .replace(/(\d[\d.,]*|[a-zA-Z.,)\]}])\^\{([^}]*)\}/g, (_m, b: string, e: string) => hold(`${b}^{${texify(e, sub)}}`))
    .replace(new RegExp(`(\\d[\\d.,]*|[a-zA-Z.,)\\]}])\\^\\((${PAREN_INNER})\\)`, 'g'), (_m, b: string, e: string) => hold(`${b}^{(${texify(e, sub)})}`))
    .replace(/(\d[\d.,]*)\^o\b/g, (_m, d: string) => hold(`${d}^{\\circ}`))
    .replace(/(\d[\d.,]*|[a-zA-Z.,)\]}])\^(-?[a-zA-Z0-9.]+)/g, (_m, b: string, e: string) => hold(`${b}^{${e}}`))
    // Derajat & pecahan unicode & simbol berdiri sendiri; minus U+2212 → '-'
    .replace(/(\d[\d.,]*)°/g, (_m, d: string) => hold(`${d}^{\\circ}`))
    .replace(new RegExp(`[${FRAC_CHARS}]`, 'g'), (ch) => hold(`\\frac${FRAC_MAP[ch]}`))
    .replace(new RegExp(SYM_CLASS, 'g'), (ch) => hold(SYM_MAP[ch] ?? ch))
    .replace(/−/g, '-')
    // Singkatan ASCII umum: <= >= != <>
    .replace(/<=/g, () => hold('\\leq'))
    .replace(/>=/g, () => hold('\\geq'))
    .replace(/!=|<>/g, () => hold('\\neq'));
  return out.replace(/\u0001(\d+)\u0002/g, (_m, i: string) => `$${held[+i]}$`);
};

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
