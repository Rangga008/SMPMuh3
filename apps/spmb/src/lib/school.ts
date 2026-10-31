/**
 * Profil sekolah publik — diambil dari API (dikelola admin via
 * Pengaturan → Profil & Kontak). Fallback: null → pemanggil pakai
 * nilai `spmbConfig` sebagai cadangan.
 */
// Fetch server-side — di Docker, API dijangkau via nama service `api`,
// bukan localhost. API_INTERNAL_URL di-set di compose; di dev pakai
// NEXT_PUBLIC_API_URL (sama-sama localhost).
const API =
  process.env.API_INTERNAL_URL ??
  process.env.NEXT_PUBLIC_API_URL ??
  'http://localhost:4000/api/v1';

export interface SchoolPublic {
  name: string;
  tagline: string | null;
  address: string | null;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  hasLogo: boolean;
  logoVersion?: number;
}

export async function getSchoolPublic(): Promise<SchoolPublic | null> {
  try {
    const res = await fetch(`${API}/school/public`, {
      // no-store: setiap render ISR selalu ambil data terbaru — perubahan
      // nama/kontak/logo admin langsung masuk regen berikutnya.
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { data?: SchoolPublic } | SchoolPublic;
    return 'data' in json && json.data ? json.data : (json as SchoolPublic);
  } catch {
    return null;
  }
}

// <img src> jalan di browser → selalu pakai URL publik (localhost:4000).
const PUBLIC_API =
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';
export const schoolLogoUrl = `${PUBLIC_API}/school/logo`;
