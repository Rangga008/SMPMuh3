/** Utilitas proteksi klien ujian: layar penuh & penahan layar (Wake Lock).
 *  Semua pemanggilan aman-gagal — peramban iOS/Safari lama tanpa API ini tetap
 *  bisa mengikuti ujian (proteksi deteksi keluar-tab tetap berjalan). */

type FsElement = HTMLElement & { webkitRequestFullscreen?: () => Promise<void> };
type FsDocument = Document & {
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => Promise<void>;
};
type Navi = Navigator & {
  wakeLock?: { request: (type: 'screen') => Promise<{ release: () => Promise<void>; released: boolean }> };
};

export const isFullscreen = () =>
  !!(document.fullscreenElement ?? (document as FsDocument).webkitFullscreenElement);

/** Minta layar penuh — harus dipanggil dari gesture pengguna (klik). */
export async function requestFullscreen(): Promise<boolean> {
  try {
    const el = document.documentElement as FsElement;
    const req = el.requestFullscreen ?? el.webkitRequestFullscreen;
    if (!req) return false;
    await req.call(el, { navigationUI: 'hide' } as FullscreenOptions);
    return isFullscreen();
  } catch {
    return false;
  }
}

export async function exitFullscreen(): Promise<void> {
  try {
    const doc = document as FsDocument;
    if (!isFullscreen()) return;
    const exit = doc.exitFullscreen ?? doc.webkitExitFullscreen;
    await exit?.call(doc);
  } catch {
    /* abaikan */
  }
}

/** Penahan layar agar tidak meredup/terkunci selama ujian. */
export type ScreenLock = { release: () => Promise<void>; released: boolean } | null;

export async function acquireWakeLock(): Promise<ScreenLock> {
  try {
    const wl = (navigator as Navi).wakeLock;
    if (!wl) return null;
    return await wl.request('screen');
  } catch {
    return null; // baterai hemat/daya rendah bisa menolak — tidak fatal
  }
}

export async function releaseWakeLock(lock: ScreenLock): Promise<void> {
  try {
    if (lock && !lock.released) await lock.release();
  } catch {
    /* abaikan */
  }
}

/** Perangkat sentuh (HP/tablet) — dipakai untuk memilih strategi deteksi blur. */
export const isTouchDevice = () =>
  typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;
