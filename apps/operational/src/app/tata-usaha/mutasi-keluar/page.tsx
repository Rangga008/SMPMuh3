'use client';

import { Shell } from '@/components/shell';
import { MutasiView } from '../_components/mutasi-view';

export default function MutasiKeluarPage() {
  return (
    <Shell>
      <MutasiView direction="OUT" />
    </Shell>
  );
}
