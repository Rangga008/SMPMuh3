/**
 * Profil sekolah publik — untuk branding halaman CBT (nama & logo).
 * Fetch server-side; API_INTERNAL_URL di-set di compose (nama service),
 * di dev pakai NEXT_PUBLIC_API_URL (localhost).
 */
const API =
  process.env.API_INTERNAL_URL ??
  process.env.NEXT_PUBLIC_API_URL ??
  'http://localhost:4000/api/v1';

export interface SchoolPublic {
  name: string;
  tagline: string | null;
  hasLogo: boolean;
  logoVersion?: number;
}

export async function getSchoolPublic(): Promise<SchoolPublic | null> {
  try {
    const res = await fetch(`${API}/school/public`, { cache: 'no-store' });
    if (!res.ok) return null;
    const json = (await res.json()) as { data?: SchoolPublic } | SchoolPublic;
    return 'data' in json && json.data ? json.data : (json as SchoolPublic);
  } catch {
    return null;
  }
}
