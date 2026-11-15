'use client';

/**
 * Cetak isi sebuah elemen di jendela baru — menyalin markup + CSS teks yang
 * diberikan (BUKAN Tailwind: jendela print tak memuat stylesheet app).
 * Menunggu semua <img> termuat sebelum window.print() agar logo/foto tak kosong.
 */
export function printNode(el: HTMLElement, opts: { title?: string; css?: string; landscape?: boolean }) {
  const win = window.open('', '_blank', 'width=960,height=720');
  if (!win) return;
  const css = `${opts.landscape ? '@page{size:A4 landscape;margin:8mm}' : '@page{size:A4;margin:10mm}'}
    *{box-sizing:border-box}body{font-family:'Times New Roman',Times,serif;color:#111;margin:0}
    table{border-collapse:collapse}@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
    ${opts.css ?? ''}`;
  win.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${opts.title ?? 'Cetak'}</title><style>${css}</style></head><body>${el.outerHTML}</body></html>`);
  win.document.close();
  const imgs = Array.from(win.document.images);
  const ready = imgs.length
    ? Promise.all(imgs.map((img) => (img.complete ? Promise.resolve() : new Promise<void>((res) => { img.onload = img.onerror = () => res(); }))))
    : Promise.resolve();
  void ready.then(() => setTimeout(() => { win.focus(); win.print(); }, 60));
}

/** Varian untuk markup HTML string (mis. kartu yang dibangun manual). */
export function printHtml(title: string, html: string, opts: { landscape?: boolean } = {}) {
  const win = window.open('', '_blank', 'width=960,height=720');
  if (!win) return;
  win.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${title}</title>
    <style>${opts.landscape ? '@page{size:A4 landscape;margin:8mm}' : '@page{size:A4;margin:10mm}'}
    *{box-sizing:border-box}body{font-family:Arial,sans-serif;color:#111;margin:16px}
    table{border-collapse:collapse}@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}</style>
    </head><body>${html}</body></html>`);
  win.document.close();
  const imgs = Array.from(win.document.images);
  const ready = imgs.length
    ? Promise.all(imgs.map((img) => (img.complete ? Promise.resolve() : new Promise<void>((res) => { img.onload = img.onerror = () => res(); }))))
    : Promise.resolve();
  void ready.then(() => setTimeout(() => { win.focus(); win.print(); }, 60));
}
