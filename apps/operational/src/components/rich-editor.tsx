'use client';

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Button, Modal } from '@smpmuh3/ui';
import { renderMathHtml, richHtml, sanitizeRichHtml } from '@/lib/math';
import { API } from '@/lib/api';

/**
 * Editor soal mini-WYSIWYG — teks + chip rumus (tampilan akhir, bisa diklik
 * untuk edit) + gambar yang benar-benar terlihat, bukan HTML mentah.
 * Nilai yang disimpan tetap string biasa (<img src>, $…$, notasi sqrt(x^2))
 * sehingga API/impor/pratinjau siswa tidak berubah sama sekali.
 */

export interface RichEditorHandle {
  /** Sisipkan chip rumus — `src` = sumber apa adanya (sqrt(3), $x^2$, x²…). */
  insertMath: (src: string) => void;
  insertImage: (url: string) => void;
  /** Ganti chip yang diklik dengan sumber baru hasil edit di modal. */
  replaceChip: (node: HTMLElement, src: string) => void;
  focus: () => void;
}

const escAttr = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
const escText = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const dispSrc = (url: string) => (url.startsWith('/') ? `${API}${url}` : url);
const stripApi = (src: string) => (src.startsWith(`${API}/`) ? src.slice(API.length) : src);

const chipHtml = (src: string) =>
  `<span class="qf-math" contenteditable="false" data-tex="${escAttr(src)}" title="Klik 2× untuk mengubah rumus">${renderMathHtml(src)}</span>`;

const imgHtml = (url: string) =>
  `<span class="qf-img" contenteditable="false"><img src="${escAttr(dispSrc(url))}" data-src="${escAttr(url)}" alt=""><button type="button" class="qf-x" title="Hapus gambar">✕</button></span>`;

/** String tersimpan → DOM editor: rumus $…$ jadi chip, <img> jadi gambar nyata. */
const valueToDom = (v: string) => {
  const clean = sanitizeRichHtml(v)
    .replace(/src="(\/cbt\/media\/[^"]+)"/g, (_m, s: string) => `src="${API}${s}" data-src="${s}"`)
    .replace(/<img([^>]*)>/g, (_m, a: string) => `<span class="qf-img" contenteditable="false"><img${a}><button type="button" class="qf-x" title="Hapus gambar">✕</button></span>`);
  // segmen non-tag: $…$/$$…$$ → chip rumus
  return clean
    .split(/(<[^>]+>)/g)
    .map((seg) =>
      seg.startsWith('<')
        ? seg
        : seg.replace(/\$\$[^$]+?\$\$|\$[^$\n]+?\$/g, (m) => chipHtml(m)),
    )
    .join('');
};

const KEEP: Record<string, string> = {
  B: 'b', STRONG: 'strong', I: 'i', EM: 'em', U: 'u', SUP: 'sup', SUB: 'sub',
  UL: 'ul', OL: 'ol', LI: 'li', BLOCKQUOTE: 'blockquote',
  H1: 'h1', H2: 'h2', H3: 'h3', H4: 'h4', H5: 'h5', H6: 'h6', HR: 'hr',
};

const serNode = (n: Node): string => {
  if (n.nodeType === Node.TEXT_NODE) return escText(n.nodeValue ?? '');
  if (!(n instanceof HTMLElement)) return '';
  const tag = n.tagName;
  if (n.classList.contains('qf-math')) return n.getAttribute('data-tex') ?? '';
  if (n.classList.contains('qf-img') || tag === 'IMG') {
    const img = tag === 'IMG' ? (n as HTMLImageElement) : n.querySelector('img');
    const src = img?.getAttribute('data-src') ?? stripApi(img?.getAttribute('src') ?? '');
    return src ? `<img src="${src}">` : '';
  }
  const inner = Array.from(n.childNodes).map(serNode).join('');
  if (tag === 'BR') return '<br>';
  if (tag === 'DIV' || tag === 'P') return `${inner}<br>`;
  const t = KEEP[tag];
  return t ? `<${t}>${inner}</${t}>` : inner;
};

const serialize = (el: HTMLElement) =>
  Array.from(el.childNodes)
    .map(serNode)
    .join('')
    .replace(/^(?:<br>\s*)+|(?:<br>\s*)+$/g, '')
    .trim();

export const RichEditor = forwardRef<
  RichEditorHandle,
  {
    value: string;
    onChange: (v: string) => void;
    singleLine?: boolean | undefined;
    placeholder?: string | undefined;
    className?: string | undefined;
    /** Dipanggil saat chip rumus diklik — untuk membuka modal edit. */
    onMathChip?: ((tex: string, node: HTMLElement) => void) | undefined;
  }
>(({ value, onChange, singleLine, placeholder, className, onMathChip }, ref) => {
  const elRef = useRef<HTMLDivElement>(null);
  const emitted = useRef(value);
  const savedRange = useRef<Range | null>(null);

  const emit = () => {
    const el = elRef.current;
    if (!el) return;
    const v = serialize(el);
    emitted.current = v;
    el.dataset.empty = String(!v);
    onChange(v);
  };

  // Nilai dari luar (muat awal, impor, pindah soal) → bangun ulang DOM.
  // Selama nilai berasal dari emit sendiri, DOM tak disentuh (caret aman).
  useEffect(() => {
    const el = elRef.current;
    if (!el) return;
    if (value !== emitted.current || !el.innerHTML) {
      el.innerHTML = valueToDom(value);
      emitted.current = value;
      el.dataset.empty = String(!serialize(el));
    }
  }, [value]);

  const saveRange = () => {
    const sel = window.getSelection();
    if (sel?.rangeCount && elRef.current?.contains(sel.getRangeAt(0).commonAncestorContainer)) {
      savedRange.current = sel.getRangeAt(0).cloneRange();
    }
  };

  const insertHtml = (html: string) => {
    const el = elRef.current;
    const sel = window.getSelection();
    if (!el || !sel) return;
    el.focus();
    let range = savedRange.current;
    if (!range || !el.contains(range.commonAncestorContainer)) {
      range = document.createRange();
      range.selectNodeContents(el);
      range.collapse(false);
    }
    range.deleteContents();
    const frag = range.createContextualFragment(html);
    const last = frag.lastChild;
    range.insertNode(frag);
    if (last) {
      range.setStartAfter(last);
      range.collapse(true);
    }
    sel.removeAllRanges();
    sel.addRange(range);
    savedRange.current = range.cloneRange();
    emit();
  };

  useImperativeHandle(ref, () => ({
    insertMath: (src) => insertHtml(`${chipHtml(src)} `),
    insertImage: (url) => insertHtml(`${imgHtml(url)} `),
    replaceChip: (node, src) => {
      const t = document.createElement('template');
      t.innerHTML = chipHtml(src);
      node.replaceWith(t.content);
      emit();
    },
    focus: () => elRef.current?.focus(),
  }));

  return (
    <div
      ref={elRef}
      role="textbox"
      aria-multiline={!singleLine}
      contentEditable
      suppressContentEditableWarning
      data-placeholder={placeholder}
      data-empty={!value.trim()}
      className={`qf-ed w-full min-w-0 flex-1 rounded-xl border border-sand-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-primary-400 ${
        singleLine ? 'qf-1line' : 'qf-multi'
      } ${className ?? ''}`}
      onInput={emit}
      onKeyUp={saveRange}
      onMouseUp={saveRange}
      onSelect={saveRange}
      onBlur={saveRange}
      onKeyDown={(e) => {
        if (singleLine && e.key === 'Enter') e.preventDefault();
      }}
      onPaste={(e) => {
        e.preventDefault();
        const text = e.clipboardData.getData('text/plain');
        if (singleLine) insertHtml(escText(text.replace(/\s+/g, ' ')));
        else insertHtml(text.split(/\r?\n/).map(escText).join('<br>'));
      }}
      onMouseDown={(e) => {
        const x = (e.target as HTMLElement).closest?.('.qf-x');
        if (x) {
          e.preventDefault();
          x.closest('.qf-img')?.remove();
          emit();
        }
      }}
      onDoubleClick={(e) => {
        // Edit chip hanya lewat klik ganda — klik tunggal tetap untuk
        // menempatkan kursor mengetik seperti biasa.
        const chip = (e.target as HTMLElement).closest?.('.qf-math');
        if (chip && onMathChip) onMathChip(chip.getAttribute('data-tex') ?? '', chip as HTMLElement);
      }}
    />
  );
});
RichEditor.displayName = 'RichEditor';

// ---------- Modal rumus: palet simbol + pratinjau KaTeX langsung ----------

const PAL: { l: string; t: string; back?: number; tip?: string }[][] = [
  [
    { l: '√', t: '√()', back: 1, tip: 'Akar kuadrat' },
    { l: '∛', t: '∛()', back: 1, tip: 'Akar pangkat 3' },
    { l: '∜', t: '∜()', back: 1, tip: 'Akar pangkat 4' },
    { l: 'x²', t: '²', tip: 'Kuadrat' },
    { l: 'x³', t: '³', tip: 'Pangkat 3' },
    { l: 'xⁿ', t: '^{}', back: 1, tip: 'Pangkat bebas (x^{y})' },
    { l: 'xᵢ', t: '_{}', back: 1, tip: 'Indeks/subskrip (x_{i})' },
    { l: 'a⁄b', t: '()/()', back: 4, tip: 'Pecahan' },
    { l: '(x)', t: '()', back: 1, tip: 'Kurung' },
    { l: '|x|', t: '||', back: 1, tip: 'Nilai mutlak' },
  ],
  ['π', 'θ', 'α', 'β', 'γ', 'δ', 'λ', 'μ', 'σ', 'φ', 'ω', 'Σ', 'Δ', 'Ω', '∠', '⊥', '∥', '°'].map((c) => ({ l: c, t: c })),
  ['×', '÷', '±', '−', '·', '≠', '≤', '≥', '≈', '∞', '→', '⇒', '∴', '∵', '′', '″', '½', '⅓', '¼', '¾', '⅔'].map((c) => ({ l: c, t: c })),
  ['∈', '∉', '∪', '∩', '⊂', '∅', 'ℕ', 'ℤ', 'ℚ', 'ℝ'].map((c) => ({ l: c, t: c })),
];

export function MathModal({
  open,
  onClose,
  initial,
  onApply,
}: {
  open: boolean;
  onClose: () => void;
  /** Sumber awal — diisi saat mengedit chip yang diklik. */
  initial: string;
  onApply: (src: string) => void;
}) {
  const [src, setSrc] = useState(initial);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (open) {
      setSrc(initial);
      setTimeout(() => inputRef.current?.focus(), 60);
    }
  }, [open, initial]);

  const ins = (t: string, back = 0) => {
    const el = inputRef.current;
    const s = el?.selectionStart ?? src.length;
    const e = el?.selectionEnd ?? s;
    setSrc(src.slice(0, s) + t + src.slice(e));
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(s + t.length - back, s + t.length - back);
    });
  };

  return (
    <Modal open={open} onClose={onClose} title="Rumus / Simbol Matematika" size="xl"
      description="Ketik biasa (sqrt(3), x^2, (a)/(b)) atau klik simbol — hasil akhir tampil di bawah.">
      <div className="space-y-3">
        <textarea
          ref={inputRef}
          value={src}
          onChange={(e) => setSrc(e.target.value)}
          rows={2}
          className="w-full rounded-xl border border-sand-200 px-3 py-2 font-mono text-sm outline-none focus:border-primary-400"
          placeholder="contoh: sqrt(x^2+1) atau (x+1)/(x-1) atau 3x²"
        />
        <div className="space-y-1.5">
          {PAL.map((row, i) => (
            <div key={i} className="flex flex-wrap gap-1">
              {row.map((b) => (
                <button
                  key={b.l}
                  type="button"
                  title={b.tip ?? `sisipkan ${b.t}`}
                  onClick={() => ins(b.t, b.back ?? 0)}
                  className="grid h-8 min-w-8 place-items-center rounded-lg border border-sand-200 bg-white px-1.5 text-sm font-bold text-sand-700 transition hover:border-primary-300 hover:bg-primary-50"
                >
                  {b.l}
                </button>
              ))}
            </div>
          ))}
        </div>
        <div>
          <p className="mb-1 text-[11px] font-black uppercase tracking-wide text-sand-400">Hasil akhir (seperti dilihat siswa)</p>
          <div
            className="rich-html min-h-12 rounded-xl border border-sand-200 bg-sand-50 px-3 py-2.5 text-[15px]"
            dangerouslySetInnerHTML={{ __html: richHtml(src || '…') }}
          />
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Batal</Button>
          <Button disabled={!src.trim()} onClick={() => onApply(src.trim())}>Sisipkan</Button>
        </div>
      </div>
    </Modal>
  );
}

/**
 * Bidang soal lengkap: editor WYSIWYG + tombol ƒx (modal rumus) + 🖼 (gambar).
 * `pickImage` membuka pemilih file milik halaman; url hasilnya disisipkan
 * sebagai gambar nyata di posisi kursor.
 */
export function MathField({
  value,
  onChange,
  singleLine,
  placeholder,
  pickImage,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  singleLine?: boolean | undefined;
  placeholder?: string | undefined;
  pickImage?: ((apply: (url: string) => void) => void) | undefined;
  className?: string | undefined;
}) {
  const ed = useRef<RichEditorHandle>(null);
  const editNode = useRef<HTMLElement | null>(null);
  const [math, setMath] = useState<string | null>(null);
  return (
    <div className={`flex min-w-0 flex-1 gap-1.5 ${singleLine ? 'items-center' : 'items-start'} ${className ?? ''}`}>
      <RichEditor
        ref={ed}
        value={value}
        onChange={onChange}
        singleLine={singleLine}
        placeholder={placeholder}
        onMathChip={(tex, node) => {
          editNode.current = node;
          setMath(tex);
        }}
      />
      <button
        type="button"
        title="Sisipkan rumus — akar, pangkat, pecahan, simbol"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => {
          editNode.current = null;
          setMath('');
        }}
        className="grid size-8 shrink-0 place-items-center rounded-lg bg-indigo-100 text-sm font-black italic text-indigo-700 transition hover:bg-indigo-200"
      >
        ƒx
      </button>
      {pickImage ? (
        <button
          type="button"
          title="Sisipkan gambar"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => pickImage((url) => ed.current?.insertImage(url))}
          className="grid size-8 shrink-0 place-items-center rounded-lg bg-sky-100 text-sm text-sky-700 transition hover:bg-sky-200"
        >
          🖼
        </button>
      ) : null}
      <MathModal
        open={math !== null}
        initial={math ?? ''}
        onClose={() => setMath(null)}
        onApply={(src) => {
          const n = editNode.current;
          if (n) ed.current?.replaceChip(n, src);
          else ed.current?.insertMath(src);
          setMath(null);
          editNode.current = null;
        }}
      />
    </div>
  );
}
