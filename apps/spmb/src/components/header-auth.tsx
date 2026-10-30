'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { buttonClasses } from '@smpmuh3/ui';
import { spmbConfig } from '@/config/spmb.config';
import { getTokens, logout, me } from '@/lib/api';

/**
 * Auth-aware header actions — "Cek Status" selalu tampil sebagai tombol
 * khusus; tombol akun berubah sesuai sesi. Sesi divalidasi di background:
 * token basi → dibersihkan, tampilan kembali ke Masuk/Daftar.
 */
export function HeaderAuth({ mobile = false }: { mobile?: boolean }) {
  const router = useRouter();
  const [authed, setAuthed] = useState<boolean | null>(null);

  useEffect(() => {
    if (!getTokens()?.accessToken) {
      setAuthed(false);
      return;
    }
    setAuthed(true);
    // Validasi diam-diam — req() me-refresh access token yang expired dan
    // membersihkan token saat sesi benar-benar mati (401).
    me().then(
      () => setAuthed(true),
      () => setAuthed(false),
    );
  }, []);

  const wrap = mobile
    ? 'mt-3 flex flex-col gap-2'
    : 'hidden items-center gap-2 sm:flex lg:ml-0';
  const cls = (variant: 'primary' | 'outline' | 'ghost') =>
    buttonClasses({
      variant,
      size: mobile ? undefined : 'sm',
      className: mobile ? 'w-full' : undefined,
    });

  const cekStatus = (
    <Link href="/cek-status" className={cls('outline')}>
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        className="-ml-0.5 size-4"
        aria-hidden="true"
      >
        <circle cx="11" cy="11" r="7" />
        <path d="m21 21-4.35-4.35" strokeLinecap="round" />
      </svg>
      Cek Status
    </Link>
  );

  if (authed === null) {
    return <div className={wrap}>{cekStatus}</div>;
  }

  if (authed) {
    return (
      <div className={wrap}>
        {cekStatus}
        <Link href="/akun" className={cls('primary')}>
          Akun Saya
        </Link>
        <button
          type="button"
          onClick={async () => {
            await logout();
            setAuthed(false);
            router.push('/');
            router.refresh();
          }}
          className={cls('ghost')}
        >
          Keluar
        </button>
      </div>
    );
  }

  return (
    <div className={wrap}>
      {cekStatus}
      <Link href="/masuk" className={cls('ghost')}>
        Masuk
      </Link>
      <Link href={spmbConfig.cta.register.href} className={cls('primary')}>
        {spmbConfig.cta.register.label}
      </Link>
    </div>
  );
}
