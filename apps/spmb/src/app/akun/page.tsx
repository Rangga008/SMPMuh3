'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Badge, Button, Field, Input, Modal, Select } from '@smpmuh3/ui';
import {
  REGISTRATION_STATUS_LABELS,
  type CandidateDto,
  type RegistrationDto,
  type WaveDto,
} from '@smpmuh3/types';
import {
  ApiError,
  createCandidate,
  createRegistration,
  getTokens,
  listCandidates,
  listRegistrations,
  listWaves,
  logout,
  me,
} from '@/lib/api';

function Card({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className="rounded-3xl border border-sand-200 bg-white p-5 shadow-card sm:p-7">
      <div className="mb-5 flex items-center justify-between gap-3">
        <h2 className="text-lg font-extrabold text-sand-950">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

const STATUS_TONE: Record<string, 'primary' | 'accent' | 'neutral' | 'danger'> = {
  ACCEPTED: 'primary',
  COMPLETED: 'primary',
  REJECTED: 'danger',
  NEEDS_REVISION: 'accent',
  AWAITING_PAYMENT: 'accent',
  AWAITING_FINAL_PAYMENT: 'accent',
  PAYMENT_REVIEW: 'accent',
  FINAL_PAYMENT_REVIEW: 'accent',
};

export default function AccountPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [candidates, setCandidates] = useState<CandidateDto[]>([]);
  const [regs, setRegs] = useState<RegistrationDto[]>([]);
  const [waves, setWaves] = useState<WaveDto[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [registering, setRegistering] = useState<string | null>(null);
  const [waveFor, setWaveFor] = useState<string | null>(null); // candidateId memilih gelombang

  const refresh = useCallback(async () => {
    const [c, r, w] = await Promise.all([
      listCandidates(),
      listRegistrations(),
      listWaves().catch(() => [] as WaveDto[]),
    ]);
    setCandidates(c);
    setRegs(r);
    setWaves(w);
  }, []);

  useEffect(() => {
    if (!getTokens()) {
      router.replace('/masuk');
      return;
    }
    me()
      .then((u) => setName(u.name))
      .then(refresh)
      .catch(() => router.replace('/masuk'))
      .finally(() => setLoading(false));
  }, [router, refresh]);

  async function onAddCandidate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const f = new FormData(e.currentTarget);
    const val = (k: string) => String(f.get(k) ?? '').trim() || undefined;
    try {
      await createCandidate({
        name: val('name')!.toUpperCase(),
        gender: val('gender') as CandidateDto['gender'],
        birthDate: val('birthDate'),
        previousSchool: val('previousSchool'),
        birthPlace: val('birthPlace'),
        nisn: val('nisn'),
        address: val('address'),
      });
      e.currentTarget.reset();
      setShowForm(false);
      await refresh();
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : 'Gagal menyimpan data calon murid — lengkapi kolom wajib.',
      );
    } finally {
      setBusy(false);
    }
  }

  async function onRegister(candidateId: string, waveId: string) {
    setError(null);
    setRegistering(candidateId);
    try {
      const reg = await createRegistration(candidateId, waveId);
      router.push(`/akun/pendaftaran/${reg.id}`);
    } catch {
      setError('Gagal membuat pendaftaran — calon murid ini mungkin sudah terdaftar pada tahun ajaran aktif.');
    } finally {
      setRegistering(null);
      setWaveFor(null);
    }
  }

  if (loading) {
    return (
      <main className="flex min-h-[calc(100dvh-4rem)] items-center justify-center bg-sand-50">
        <p className="text-sm font-medium text-sand-500">Memuat akun…</p>
      </main>
    );
  }

  const regByCandidate = new Map(regs.map((r) => [r.candidate.id, r]));

  return (
    <main className="relative min-h-[calc(100dvh-4rem)] overflow-hidden bg-gradient-to-b from-primary-50 via-sand-50 to-sand-100 py-10">
      <div aria-hidden="true" className="pattern-islami pointer-events-none absolute inset-0" />
      <div className="relative mx-auto max-w-5xl space-y-6 px-4 sm:px-6 lg:px-8">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span
              aria-hidden="true"
              className="flex size-11 items-center justify-center rounded-full bg-primary-700 text-sm font-extrabold text-white"
            >
              {name.slice(0, 1).toUpperCase() || 'A'}
            </span>
            <div>
              <h1 className="text-xl font-extrabold tracking-tight text-sand-950 sm:text-2xl">
                Assalamu&apos;alaikum, {name}
              </h1>
              <p className="text-sm text-sand-600">Kelola pendaftaran murid baru Anda</p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={async () => {
              await logout();
              router.push('/');
            }}
          >
            Keluar
          </Button>
        </header>

        {error ? (
          <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
            {error}
          </p>
        ) : null}

        <Card
          title="Pendaftaran Saya"
          action={
            <Link href="/cek-status" className="text-sm font-semibold text-primary-700 hover:text-primary-800">
              Cek status publik →
            </Link>
          }
        >
          {regs.length === 0 ? (
            <p className="rounded-2xl bg-sand-50 px-4 py-6 text-center text-sm text-sand-600">
              Belum ada pendaftaran. Tambahkan calon murid di bawah, lalu mulai pendaftaran.
            </p>
          ) : (
            <ul className="space-y-3">
              {regs.map((r) => (
                <li key={r.id}>
                  <Link
                    href={`/akun/pendaftaran/${r.id}`}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-sand-200 bg-sand-50 px-5 py-4 transition-all hover:border-primary-300 hover:bg-primary-50 focus-visible:focus-ring"
                  >
                    <div>
                      <p className="font-bold text-sand-950">{r.candidate.name}</p>
                      <p className="mt-0.5 text-xs font-semibold tracking-wide text-sand-500">
                        {r.number}
                        {r.wave?.name ? ` · ${r.wave.name}` : ''}
                      </p>
                    </div>
                    <Badge tone={STATUS_TONE[r.status] ?? 'neutral'}>
                      {REGISTRATION_STATUS_LABELS[r.status]}
                    </Badge>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card
          title="Calon Murid"
          action={
            <Button size="sm" onClick={() => setShowForm(true)}>
              + Tambah
            </Button>
          }
        >
          {candidates.length === 0 ? (
            <p className="rounded-2xl bg-sand-50 px-4 py-6 text-center text-sm text-sand-600">
              Belum ada calon murid — tekan tombol Tambah untuk mengisi data.
            </p>
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2">
              {candidates.map((cd) => {
                const reg = regByCandidate.get(cd.id);
                return (
                  <li
                    key={cd.id}
                    className="flex flex-col rounded-2xl border border-sand-200 bg-white p-5"
                  >
                    <p className="font-bold text-sand-950">{cd.name}</p>
                    <p className="mt-0.5 text-xs text-sand-500">
                      {[
                        cd.gender === 'MALE' ? 'Laki-laki' : cd.gender === 'FEMALE' ? 'Perempuan' : '',
                        cd.birthDate,
                        cd.previousSchool,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                    {reg ? (
                      <Link
                        href={`/akun/pendaftaran/${reg.id}`}
                        className="mt-4 text-sm font-semibold text-primary-700 hover:text-primary-800"
                      >
                        Lihat pendaftaran ({REGISTRATION_STATUS_LABELS[reg.status]}) →
                      </Link>
                    ) : waveFor === cd.id ? (
                      <div className="mt-4 space-y-2">
                        <p className="text-xs font-bold uppercase tracking-wider text-sand-500">
                          Pilih Gelombang
                        </p>
                        {waves.length === 0 ? (
                          <p className="text-xs text-sand-500">Belum ada gelombang dibuka.</p>
                        ) : (
                          waves.map((w) => (
                            <Button
                              key={w.id}
                              size="sm"
                              className="w-full"
                              disabled={registering === cd.id}
                              onClick={() => onRegister(cd.id, w.id)}
                            >
                              {registering === cd.id ? 'Memproses…' : `${w.name}`}
                            </Button>
                          ))
                        )}
                        <Button size="sm" variant="ghost" className="w-full" onClick={() => setWaveFor(null)}>
                          Batal
                        </Button>
                      </div>
                    ) : (
                      <Button size="sm" className="mt-4" onClick={() => setWaveFor(cd.id)}>
                        Mulai Pendaftaran
                      </Button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>

      <Modal
        open={showForm}
        onClose={() => setShowForm(false)}
        title="Tambah Calon Murid"
        description="Isi data dasar calon murid — bisa dilengkapi lagi saat mengisi formulir."
        size="xl"
      >
        <form onSubmit={onAddCandidate} className="grid gap-4 sm:grid-cols-2">
          <Field label="Nama Lengkap" hint="Otomatis huruf besar" className="sm:col-span-2">
            <Input name="name" required placeholder="Nama calon murid" style={{ textTransform: 'uppercase' }} />
          </Field>
          <Field label="Jenis Kelamin">
            <Select name="gender" required defaultValue="">
              <option value="" disabled>Pilih…</option>
              <option value="MALE">Laki-laki</option>
              <option value="FEMALE">Perempuan</option>
            </Select>
          </Field>
          <Field label="Tanggal Lahir">
            <Input name="birthDate" type="date" required />
          </Field>
          <Field label="Asal Sekolah" hint="SD/MI asal">
            <Input name="previousSchool" required placeholder="Contoh: SD Muhammadiyah 3" />
          </Field>
          <Field label="Tempat Lahir (opsional)">
            <Input name="birthPlace" placeholder="Kota kelahiran" />
          </Field>
          <Field label="NISN (opsional)">
            <Input name="nisn" placeholder="10 digit" />
          </Field>
          <Field label="Alamat (opsional)">
            <Input name="address" placeholder="Alamat domisili" />
          </Field>
          <div className="sm:col-span-2">
            <Button type="submit" disabled={busy}>
              {busy ? 'Menyimpan…' : 'Simpan Calon Murid'}
            </Button>
          </div>
        </form>
      </Modal>
    </main>
  );
}
