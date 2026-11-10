'use client';

import {
  Children,
  Fragment,
  isValidElement,
  useEffect,
  useMemo,
  useState,
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
  children: ReactNode;
}

const SIZES = [5, 10, 20, 50, 100];

/** Ratakan fragment — halaman boleh mengembalikan <>{rows.map()}</>. */
function flatten(children: ReactNode): ReactNode[] {
  return Children.toArray(children).flatMap((c) =>
    isValidElement(c) && c.type === Fragment
      ? Children.toArray((c.props as { children?: ReactNode }).children)
      : [c],
  );
}

/**
 * Reusable table with loading/empty/error states, horizontal scroll,
 * and built-in pagination (5/10/20/50/100 + prev/next).
 */
export function DataTable({
  head,
  loading,
  error,
  empty,
  colSpan,
  paginate = true,
  pageSizes = SIZES,
  children,
}: DataTableProps) {
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(pageSizes[1] ?? pageSizes[0] ?? 10);

  const rows = useMemo(() => (paginate ? flatten(children) : []), [children, paginate]);
  const total = rows.length;
  const pages = Math.max(1, Math.ceil(total / size));
  const current = Math.min(page, pages);

  // Balik ke halaman 1 bila data berganti (filter/cari/muat ulang).
  useEffect(() => {
    setPage(1);
  }, [total]);

  const paged = paginate ? rows.slice((current - 1) * size, current * size) : children;
  const from = total === 0 ? 0 : (current - 1) * size + 1;
  const to = Math.min(current * size, total);

  return (
    <div className="overflow-x-auto rounded-3xl border border-sand-200 bg-white shadow-card">
      <table className="w-full min-w-[36rem] text-left text-sm">
        <thead>
          <tr className="border-b border-sand-200 bg-sand-50 text-xs font-bold uppercase tracking-wider text-sand-500">
            {head.map((h, i) => (
              <th key={i} scope="col" className="px-5 py-3.5">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-sand-100 [&>tr]:transition-colors [&>tr:hover]:bg-primary-50/50">
          {loading ? (
            <tr>
              <td
                colSpan={colSpan ?? head.length}
                className="px-5 py-12 text-center text-sm text-sand-500"
              >
                Memuat data…
              </td>
            </tr>
          ) : error ? (
            <tr>
              <td
                colSpan={colSpan ?? head.length}
                className="px-5 py-12 text-center text-sm font-medium text-red-700"
              >
                {error}
              </td>
            </tr>
          ) : (
            paged
          )}
          {!loading && !error && empty ? (
            <tr>
              <td
                colSpan={colSpan ?? head.length}
                className="px-5 py-12 text-center text-sm text-sand-500"
              >
                {empty}
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>

      {paginate && !loading && !error && total > Math.min(...pageSizes) ? (
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
              className="rounded-lg border border-sand-200 px-2.5 py-1 text-xs font-bold text-sand-600 transition-colors hover:bg-sand-50 disabled:opacity-40"
            >
              ‹ Sebelumnya
            </button>
            <span className="px-1.5 text-xs font-bold text-sand-700">
              {current} / {pages}
            </span>
            <button
              type="button"
              disabled={current >= pages}
              onClick={() => setPage(current + 1)}
              className="rounded-lg border border-sand-200 px-2.5 py-1 text-xs font-bold text-sand-600 transition-colors hover:bg-sand-50 disabled:opacity-40"
            >
              Berikutnya ›
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
