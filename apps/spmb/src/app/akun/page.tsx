'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import {
  REGISTRATION_STATUS_LABELS,
  type AuthUser,
  type CandidateDto,
  type RegistrationDto,
} from '@smpmuh3/types';
import { Badge, Button, Card, Container } from '@smpmuh3/ui';
import { SiteFooter } from '@/components/site-footer';
import { SiteHeader } from '@/components/site-header';
import {
  createCandidate,
  createRegistration,
  getTokens,
  listCandidates,
  listRegistrations,
  logout,
  me,
} from '@/lib/api';

const inputCls =
  'h-10 w-full rounded-lg border border-sand-300 px-3 text-sm font-normal focus-visible:focus-ring';

export default function AkunPage() {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [candidates, setCandidates] = useState<CandidateDto[]>([]);
  const [registrations, setRegistrations] = useState<RegistrationDto[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function refresh() {
    const [c, r] = await Promise.all([listCandidates(), listRegistrations()]);
    setCandidates(c);
    setRegistrations(r);
  }

  useEffect(() => {
    if (!getTokens()) {
      router.replace('/masuk');
      return;
    }
    me()
      .then(setUser)
      .then(refresh)
      .catch(() => {
        logout();
        router.replace('/masuk');
      });
  }, []);

  async function onNewCandidate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const fd = new FormData(e.currentTarget);
    try {
      const c = await createCandidate({
        name: String(fd.get('name')),
        previousSchool: String(fd.get('previousSchool') || '') || undefined,
        gender: (fd.get('gender') as 'MALE' | 'FEMALE') || undefined,
      });
      const reg = await createRegistration(c.id);
      router.push(`/akun/pendaftaran/${reg.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal membuat calon siswa');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <SiteHeader />
      <main
        id="konten"
        className="min-h-[60vh] bg-gradient-to-b from-primary-100/40 via-sand-50 to-sand-50"
      >
        <Container className="flex flex-col gap-8 py-12">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <h1 className="text-2xl font-extrabold text-sand-950">
              Akun {user ? `· ${user.name || user.email}` : ''}
            </h1>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                logout();
                router.push('/');
              }}
            >
              Keluar
            </Button>
          </div>

          {error ? (
            <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-800">
              {error}
            </p>
          ) : null}

          <div className="grid gap-8 lg:grid-cols-5">
            <Card className="lg:col-span-2 h-fit">
              <h2 className="mb-1 text-lg font-bold text-sand-950">
                Pendaftaran Baru
              </h2>
              <p className="mb-5 text-sm text-sand-600">
                Buat profil calon siswa — pendaftaran dibuat otomatis.
              </p>
              <form onSubmit={onNewCandidate} className="flex flex-col gap-3">
                <label className="text-sm font-semibold text-sand-900">
                  Nama lengkap calon siswa
                  <input required name="name" minLength={3} className={inputCls} />
                </label>
                <label className="text-sm font-semibold text-sand-900">
                  Asal sekolah (opsional)
                  <input name="previousSchool" className={inputCls} />
                </label>
                <label className="text-sm font-semibold text-sand-900">
                  Jenis kelamin (opsional)
                  <select name="gender" className={inputCls}>
                    <option value="">—</option>
                    <option value="MALE">Laki-laki</option>
                    <option value="FEMALE">Perempuan</option>
                  </select>
                </label>
                <Button type="submit" disabled={busy} className="mt-2 w-full">
                  {busy ? 'Memproses…' : 'Buat & Daftarkan'}
                </Button>
              </form>
            </Card>

            <div className="lg:col-span-3 flex flex-col gap-4">
              <h2 className="text-lg font-bold text-sand-950">
                Pendaftaran Anda ({registrations.length})
              </h2>
              {registrations.length === 0 ? (
                <Card className="text-sm text-sand-600">
                  Belum ada pendaftaran. Buat profil calon siswa di samping.
                </Card>
              ) : (
                registrations.map((r) => (
                  <Link
                    key={r.id}
                    href={`/akun/pendaftaran/${r.id}`}
                    className="block rounded-2xl focus-visible:focus-ring"
                  >
                    <Card className="flex flex-wrap items-center justify-between gap-3 transition-shadow hover:shadow-md">
                      <div>
                        <p className="font-bold text-sand-950">
                          {r.candidate.name}
                        </p>
                        <p className="text-sm text-sand-600">
                          {r.number} · jalur {r.pathway}
                        </p>
                      </div>
                      <Badge
                        tone={
                          r.status === 'ACCEPTED' || r.status === 'COMPLETED'
                            ? 'primary'
                            : r.status === 'REJECTED'
                              ? 'neutral'
                              : 'accent'
                        }
                      >
                        {REGISTRATION_STATUS_LABELS[r.status]}
                      </Badge>
                    </Card>
                  </Link>
                ))
              )}

              {candidates.length > 0 ? (
                <p className="mt-2 text-xs text-sand-500">
                  {candidates.length} profil calon siswa tersimpan.
                </p>
              ) : null}
            </div>
          </div>
        </Container>
      </main>
      <SiteFooter />
    </>
  );
}
