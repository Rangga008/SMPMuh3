'use client';

import {
  Children,
  Fragment,
  cloneElement,
  isValidElement,
  useEffect,
  useMemo,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react';

interface DataTableProps {
  head: ReactNode[];
  loading?: boolean;
  error?: string | null;
  empty?: ReactNode;
  colSpan?: number;
  /** Paginasi bawaan — default aktif (ukuran 10). Matikan dengan false. */
  paginate?: boolean;
  pageSizes?: number[];
  /** Kolom pencarian otomatis di atas tabel — default aktif. Matikan dengan false. */
  search?: boolean;
  /** Klik header kolom untuk urutkan — default aktif. Matikan dengan false. */
  sortable?: boolean;
  /** Kontrol filter tambahan di samping kolom cari (Select dsb — halaman yang menyaring datanya). */
  filters?: ReactNode;
  /** Mode kartu di layar kecil — default aktif. Matikan untuk tabel matriks/teknis. */
  cards?: boolean;
  children: ReactNode;
}

const SIZES = [5, 10, 20, 30, 50];

/** Ratakan fragment — halaman boleh mengembalikan <>{rows.map()}</>. */
function flatten(children: ReactNode): ReactNode[] {
  return Children.toArray(children).flatMap((c) =>
    isValidElement(c) && c.type === Fragment
      ? Children.toArray((c.props as { children?: ReactNode }).children)
      : [c],
  );
}

/** Ambil teks mentah dari ReactNode (untuk filter & sort). */
function nodeText(node: ReactNode): string {
  if (node === null || node === undefined || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(nodeText).join(' ');
  if (isValidElement(node)) {
    const props = node.props as { children?: ReactNode };
    return nodeText(props.children);
  }
  return '';
}

/** Teks per sel <td> di dalam satu <tr>. */
function cellTexts(row: ReactNode): string[] {
  if (!isValidElement(row)) return [];
  const tds = Children.toArray((row.props as { children?: ReactNode }).children);
  return tds
    .filter((td) => isValidElement(td))
    .map((td) => nodeText((td.props as { children?: ReactNode }).children).trim());
}

/**
 * Reusable table with loading/empty/error states, horizontal scroll,
 * and built-in pagination (5/10/20/30/50/Semua + prev/next).
 */
export function DataTable({
  head,
  loading,
  error,
  empty,
  colSpan,
  paginate = true,
  pageSizes = SIZES,
  search = true,
  sortable = true,
  filters,
  cards = true,
  children,
}: DataTableProps) {
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(pageSizes[1] ?? pageSizes[0] ?? 10);
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<{ col: number; dir: 1 | -1 } | null>(null);

  const allRows = useMemo(() => flatten(children), [children]);
  const rows = useMemo(() => {
    let list = allRows;
    if (search && q.trim()) {
      const needle = q.trim().toLowerCase();
      list = list.filter((r) => cellTexts(r).join(' ').toLowerCase().includes(needle));
    }
    if (sortable && sort) {
      const { col, dir } = sort;
      list = [...list].sort((a, b) => {
        const ta = cellTexts(a)[col] ?? '';
        const tb = cellTexts(b)[col] ?? '';
        const na = Number(ta.replace(/[^\d.-]/g, ''));
        const nb = Number(tb.replace(/[^\d.-]/g, ''));
        const num = ta !== '' && tb !== '' && !Number.isNaN(na) && !Number.isNaN(nb) && /^[\d.,\sRp-]+$/.test(ta) && /^[\d.,\sRp-]+$/.test(tb);
        return num ? dir * (na - nb) : dir * ta.localeCompare(tb, 'id');
      });
    }
    return list;
  }, [allRows, q, sort, search, sortable]);
  const total = rows.length;
  // size 0 = "Semua" — satu halaman penuh.
  const pages = size === 0 ? 1 : Math.max(1, Math.ceil(total / size));
  const current = Math.min(page, pages);

  // Balik ke halaman 1 bila data berganti (filter/cari/muat ulang).
  useEffect(() => {
    setPage(1);
  }, [total]);

  const paged = paginate
    ? size === 0
      ? rows
      : rows.slice((current - 1) * size, current * size)
    : rows;
  const from = total === 0 ? 0 : size === 0 ? 1 : (current - 1) * size + 1;
  const to = size === 0 ? total : Math.min(current * size, total);

  // Mode kartu mobile: suntikkan data-label (teks header) ke tiap <td> —
  // CSS .dt-cards menampilkannya sebagai label di layar kecil.
  const headTexts = useMemo(() => head.map(nodeText), [head]);
  const labeled = useMemo(() => {
    if (!cards) return paged;
    return paged.map((row) => {
      if (!isValidElement(row)) return row;
      const cells = Children.toArray(
        (row.props as { children?: ReactNode }).children,
      );
      let col = 0;
      const next = cells.map((cell) => {
        if (!isValidElement(cell)) return cell;
        const span = Number(
          (cell.props as { colSpan?: number }).colSpan ?? 1,
        );
        const label = headTexts[col] ?? '';
        col += span;
        if (!label) return cell;
        return cloneElement(
          cell as ReactElement<Record<string, unknown>>,
          { 'data-label': label },
        );
      });
      return cloneElement(
        row as ReactElement<Record<string, unknown>>,
        undefined,
        next,
      );
    });
  }, [paged, cards, headTexts]);

  return (
    <div
      className={`overflow-x-auto rounded-3xl border border-sand-200 bg-white shadow-card ${cards ? 'dt-cards' : ''}`}
    >
      {filters || (search && !loading && !error && allRows.length > 0) ? (
        <div className="flex flex-wrap items-center gap-2 border-b border-sand-100 px-4 py-2.5">
          {search && allRows.length > 0 ? (
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Cari di tabel ini…"
              className="w-full max-w-xs rounded-xl border border-sand-200 bg-sand-50 px-3 py-1.5 text-xs font-medium text-sand-700 placeholder:text-sand-400 focus:outline-none focus:ring-2 focus:ring-primary-300"
            />
          ) : null}
          {filters}
        </div>
      ) : null}
      <table className="w-full min-w-[36rem] text-left text-sm">
        <thead>
          <tr className="border-b border-sand-200 bg-sand-50 text-xs font-bold uppercase tracking-wider text-sand-500">
            {head.map((h, i) => (
              <th
                key={i}
                scope="col"
                className={`px-5 py-3.5 ${sortable ? 'cursor-pointer select-none hover:text-sand-800' : ''}`}
                onClick={() => {
                  if (!sortable) return;
                  setSort(sort?.col === i && sort.dir === 1 ? { col: i, dir: -1 } : { col: i, dir: 1 });
                }}
              >
                <span className="inline-flex items-center gap-1">
                  {h}
                  {sortable ? (
                    <span aria-hidden className={sort?.col === i ? 'text-primary-600' : 'text-sand-300'}>
                      {sort?.col === i ? (sort.dir === 1 ? '▲' : '▼') : '↕'}
                    </span>
                  ) : null}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-sand-100 [&>tr]:transition-colors [&>tr:hover]:bg-primary-50/50">
          {loading ? (
            <tr>
              <td
                data-state
                colSpan={colSpan ?? head.length}
                className="px-5 py-12 text-center text-sm text-sand-500"
              >
                Memuat data…
              </td>
            </tr>
          ) : error ? (
            <tr>
              <td
                data-state
                colSpan={colSpan ?? head.length}
                className="px-5 py-12 text-center text-sm font-medium text-red-700"
              >
                {error}
              </td>
            </tr>
          ) : (
            labeled
          )}
          {!loading && !error && empty ? (
            <tr>
              <td
                data-state
                colSpan={colSpan ?? head.length}
                className="px-5 py-12 text-center text-sm text-sand-500"
              >
                {empty}
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>

      {paginate && !loading && !error && total > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-sand-200 px-5 py-3">
          <div className="flex items-center gap-2 text-xs font-semibold text-sand-500">
            <span>Tampilkan</span>
            <select
              value={size}
              onChange={(e) => {
                setSize(Number(e.target.value));
                setPage(1);
              }}
              className="rounded-lg border border-sand-200 bg-white px-2 py-1 text-xs font-bold text-sand-700 focus:outline-none focus:ring-2 focus:ring-primary-300"
            >
              {pageSizes.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
              <option value={0}>Semua</option>
            </select>
            <span>
              · {from}–{to} dari {total} data
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              disabled={current <= 1}
              onClick={() => setPage(current - 1)}
              className="rounded-lg border border-sand-200 px-3 py-2 text-xs font-bold text-sand-600 transition-colors hover:bg-sand-50 disabled:opacity-40"
            >
              ‹ Prev
            </button>
            <span className="px-1.5 text-xs font-bold text-sand-700">
              {current} / {pages}
            </span>
            <button
              type="button"
              disabled={current >= pages}
              onClick={() => setPage(current + 1)}
              className="rounded-lg border border-sand-200 px-3 py-2 text-xs font-bold text-sand-600 transition-colors hover:bg-sand-50 disabled:opacity-40"
            >
              Next ›
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
