'use client';

import { usePathname } from 'next/navigation';
import { useEffect } from 'react';

const PREFIX = 'scroll:';

function read(key: string): number | null {
  try {
    const raw = sessionStorage.getItem(PREFIX + key);
    const n = raw === null ? NaN : Number(raw);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

function write(key: string, y: number) {
  try {
    sessionStorage.setItem(PREFIX + key, String(y));
  } catch {
    /* storage penuh/ditolak — abaikan */
  }
}

/**
 * Menjaga posisi scroll per-halaman: posisi disimpan terus-menerus ke
 * sessionStorage dan dipulihkan saat pengguna kembali ke halaman yang sama,
 * sehingga salah-klik menu tidak memaksa scroll ulang dari atas.
 */
export function ScrollKeeper() {
  const pathname = usePathname();

  // Simpan posisi scroll (rAF-throttled) + sekali terakhir saat pindah halaman.
  useEffect(() => {
    let ticking = false;
    const save = () => {
      ticking = false;
      write(pathname, window.scrollY);
    };
    const onScroll = () => {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(save);
      }
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      save();
    };
  }, [pathname]);

  // Pulihkan posisi saat tiba di halaman yang pernah dikunjungi.
  useEffect(() => {
    const saved = read(pathname);
    if (saved === null || saved <= 0) return;
    let cancelled = false;
    let achieved = false;
    let tries = 0;
    const attempt = () => {
      if (cancelled || achieved) return;
      window.scrollTo(0, saved);
      if (Math.abs(window.scrollY - saved) <= 4) {
        achieved = true;
        return;
      }
      // Konten bisa bertambah tinggi saat data termuat — coba lagi sebentar.
      if (tries++ < 12) setTimeout(attempt, 90);
    };
    const t = setTimeout(() => requestAnimationFrame(attempt), 40);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [pathname]);

  return null;
}
