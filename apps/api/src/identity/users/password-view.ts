import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

/**
 * Penyimpanan sandi "dapat dilihat admin" — AES-256-GCM dengan kunci yang
 * diturunkan dari JWT_ACCESS_SECRET (tanpa env tambahan). Format ciphertext:
 * base64(iv).base64(tag).base64(data). BUKAN pengganti passwordHash —
 * autentikasi tetap memakai argon2; kolom ini hanya untuk ditampilkan kembali
 * ke admin berwenang (permintaan operasional sekolah).
 */
const key = () =>
  createHash('sha256')
    .update(process.env.JWT_ACCESS_SECRET ?? 'smpmuh3-dev-secret')
    .digest();

export function encryptPassword(plain: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', key(), iv);
  const data = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return `${iv.toString('base64')}.${c.getAuthTag().toString('base64')}.${data.toString('base64')}`;
}

export function decryptPassword(enc: string | null | undefined): string | null {
  if (!enc) return null;
  try {
    const [iv, tag, data] = enc.split('.').map((p) => Buffer.from(p, 'base64'));
    const d = createDecipheriv('aes-256-gcm', key(), iv!);
    d.setAuthTag(tag!);
    return Buffer.concat([d.update(data!), d.final()]).toString('utf8');
  } catch {
    return null;
  }
}
