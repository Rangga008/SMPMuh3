import type { ReactNode } from 'react';

interface DataTableProps {
  head: ReactNode[];
  loading?: boolean;
  error?: string | null;
  empty?: ReactNode;
  colSpan?: number;
  children: ReactNode;
}

/**
 * Reusable table with loading/empty/error states and horizontal
 * scroll for narrow screens.
 */
export function DataTable({
  head,
  loading,
  error,
  empty,
  colSpan,
  children,
}: DataTableProps) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-sand-200 bg-white">
      <table className="w-full min-w-[36rem] text-left text-sm">
        <thead>
          <tr className="border-b border-sand-200 bg-sand-100/60 text-xs font-bold tracking-wide text-sand-600 uppercase">
            {head.map((h, i) => (
              <th key={i} scope="col" className="px-4 py-3">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-sand-100">
          {loading ? (
            <tr>
              <td
                colSpan={colSpan ?? head.length}
                className="px-4 py-10 text-center text-sand-500"
              >
                Memuat data…
              </td>
            </tr>
          ) : error ? (
            <tr>
              <td
                colSpan={colSpan ?? head.length}
                className="px-4 py-10 text-center text-red-700"
              >
                {error}
              </td>
            </tr>
          ) : (
            children
          )}
          {!loading && !error && empty ? (
            <tr>
              <td
                colSpan={colSpan ?? head.length}
                className="px-4 py-10 text-center text-sand-500"
              >
                {empty}
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}
