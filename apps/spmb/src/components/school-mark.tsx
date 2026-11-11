'use client';

import { useEffect, useState } from 'react';
import { API } from '@/lib/api';

interface PublicSchool {
  hasLogo?: boolean;
  logoVersion?: number;
}

/**
 * Lambang sekolah — logo unggahan bila ada, fallback inisial M3.
 * Dipakai di tempat yang tidak sempat fetch profil server-side.
 */
export function SchoolMark({
  className = 'size-12',
  rounded = 'rounded-2xl',
  invert = false,
}: {
  className?: string;
  rounded?: string;
  invert?: boolean;
}) {
  const [school, setSchool] = useState<PublicSchool | null>(null);

  useEffect(() => {
    fetch(`${API}/school/public`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => setSchool((j?.data ?? j ?? null) as PublicSchool | null))
      .catch(() => undefined);
  }, []);

  if (school?.hasLogo) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={`/logo.png?v=${school.logoVersion ?? 1}`}
        alt="Logo sekolah"
        className={`${className} ${rounded} bg-white object-contain p-1 shadow-card`}
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      className={`flex items-center justify-center ${className} ${rounded} ${
        invert
          ? 'bg-accent-400 text-primary-950'
          : 'bg-primary-700 text-white'
      } text-base font-extrabold shadow-card`}
    >
      M3
    </span>
  );
}
