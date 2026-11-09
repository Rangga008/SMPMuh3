'use client';

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Shell } from '@/components/shell';
import { MutasiView } from '../_components/mutasi-view';

function MutasiInner() {
  const params = useSearchParams();
  const initial = params.get('dir') === 'OUT' ? 'OUT' : 'IN';
  const [dir, setDir] = useState<'IN' | 'OUT'>(initial);

  return (
    <>
      <div className="mb-4 inline-flex rounded-xl border border-sand-200 bg-white p-1 shadow-sm">
        {([['IN', 'Mutasi Masuk'], ['OUT', 'Mutasi Keluar']] as const).map(([k, label]) => (
          <button
            key={k}
            type="button"
            onClick={() => setDir(k)}
            className={`rounded-lg px-4 py-1.5 text-sm font-semibold transition-colors ${
              dir === k ? 'bg-primary-700 text-white' : 'text-sand-600 hover:bg-sand-100'
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      <MutasiView key={dir} direction={dir} />
    </>
  );
}

export default function MutasiPage() {
  return (
    <Shell>
      <Suspense>
        <MutasiInner />
      </Suspense>
    </Shell>
  );
}
