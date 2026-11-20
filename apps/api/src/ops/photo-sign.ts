import { createHmac, createHash, timingSafeEqual } from 'node:crypto';

/**
 * URL bertanda tangan untuk pas foto siswa — endpoint gambar tetap bebas
 * header Authorization (dipakai <img> di jendela cetak), jadi otorisasinya
 * pindah ke query ?exp&sig: HMAC-SHA256(studentId+exp) berkunci
 * JWT_ACCESS_SECRET, berlaku 24 jam. Tanpa tanda tangan → 403.
 */
const key = () =>
  createHash('sha256')
    .update(process.env.JWT_ACCESS_SECRET ?? 'smpmuh3-dev-secret')
    .digest();

const PHOTO_URL_TTL_MS = 24 * 60 * 60 * 1000;

const sigFor = (studentId: string, exp: number) =>
  createHmac('sha256', key())
    .update(`student-photo|${studentId}|${exp}`)
    .digest('base64url');

/** Terbitkan URL bertanda tangan (path + query — frontend menambah origin API). */
export function signPhotoUrl(studentId: string): { url: string; expiresAt: Date } {
  const exp = Date.now() + PHOTO_URL_TTL_MS;
  const sig = sigFor(studentId, exp);
  return {
    url: `/ops/students/${studentId}/photo?exp=${exp}&sig=${sig}`,
    expiresAt: new Date(exp),
  };
}

export function verifyPhotoSig(
  studentId: string,
  exp: string | undefined,
  sig: string | undefined,
): boolean {
  const expN = Number(exp);
  if (!exp || !sig || !Number.isFinite(expN) || expN < Date.now()) return false;
  const expected = sigFor(studentId, expN);
  return (
    expected.length === sig.length &&
    timingSafeEqual(Buffer.from(expected), Buffer.from(sig))
  );
}
