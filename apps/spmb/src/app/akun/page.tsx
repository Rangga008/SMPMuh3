'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Badge, Button, Field, Input, Modal, Select } from '@smpmuh3/ui';
import {
  INFO_SOURCES,
  INFO_SOURCE_LABELS,
  REGISTRATION_STATUS_LABELS,
  TITIPAN_STATUS_LABELS,
  type CandidateDto,
  type InfoSource,
  type RegistrationDto,
  type TitipanEntryDto,
  type TitipanYearSummaryDto,
  type WaveDto,
} from '@smpmuh3/types';
import {
  ApiError,
  createCandidate,
  createRegistration,
  createTitipan,
  getTokens,
  listCandidates,
  listMyTitipan,
  listRegistrations,
  listTitipanYears,
  listWavesFor,
  logout,
  me,
  titipanCodeInfo,
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

const TITIPAN_TONE: Record<string, 'primary' | 'accent' | 'neutral' | 'danger'> = {
  PENDING: 'neutral',
  WAITING: 'accent',
  CODE_SENT: 'accent',
  REGISTERED: 'primary',
  CANCELLED: 'danger',
};

export default function AccountPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [candidates, setCandidates] = useState<CandidateDto[]>([]);
  const [regs, setRegs] = useState<RegistrationDto[]>([]);
  const [entries, setEntries] = useState<TitipanEntryDto[]>([]);
  const [years, setYears] = useState<TitipanYearSummaryDto[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [titipanFor, setTitipanFor] = useState<CandidateDto | null>(null);

  // ---- redeem kode ----
  const [redeemOpen, setRedeemOpen] = useState(false);
  const [redeemCode, setRedeemCode] = useState('');
  const [redeemInfo, setRedeemInfo] = useState<{
    academicYearName: string;
    candidateName: string;
    waves: WaveDto[];
  } | null>(null);
  const [redeemCandidate, setRedeemCandidate] = useState('');
  const [redeemWave, setRedeemWave] = useState('');
  const [redeemError, setRedeemError] = useState<string | null>(null);
  const [checkingCode, setCheckingCode] = useState(false);

  const refresh = useCallback(async () => {
    const [c, r, t, y] = await Promise.all([
      listCandidates(),
      listRegistrations(),
      listMyTitipan().catch(() => [] as TitipanEntryDto[]),
      listTitipanYears().catch(() => [] as TitipanYearSummaryDto[]),
    ]);
    setCandidates(c);
    setRegs(r);
    setEntries(t);
    setYears(y);
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

  async function onTitipan(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!titipanFor) return;
    setError(null);
    setBusy(true);
    const f = new FormData(e.currentTarget);
    const val = (k: string) => String(f.get(k) ?? '').trim() || undefined;
    try {
      await createTitipan({
        candidateId: titipanFor.id,
        academicYearId: String(f.get('academicYearId')),
        guardianPhone: val('guardianPhone'),
        infoSource: val('infoSource'),
      });
      setTitipanFor(null);
      await refresh();
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'Gagal membuat daftar titipan.',
      );
    } finally {
      setBusy(false);
    }
  }

  // ---- redeem kode ----
  function openRedeem(prefillCode?: string, lockedCandidateId?: string) {
    setRedeemCode(prefillCode ?? '');
    setRedeemCandidate(lockedCandidateId ?? '');
    setRedeemWave('');
    setRedeemInfo(null);
    setRedeemError(null);
    setRedeemOpen(true);
    if (prefillCode) void checkCode(prefillCode);
  }

  async function checkCode(code: string) {
    const cleaned = code.trim().toUpperCase();
    if (cleaned.length < 4) {
      setRedeemInfo(null);
      return;
    }
    setCheckingCode(true);
    setRedeemError(null);
    try {
      const info = await titipanCodeInfo(cleaned);
      if (info.status !== 'CODE_SENT') {
        setRedeemError(
          info.status === 'REGISTERED'
            ? 'Kode ini sudah dipakai.'
            : 'Kode ini belum aktif atau sudah tidak berlaku.',
        );
        setRedeemInfo(null);
        return;
      }
      setRedeemInfo({
        academicYearName: info.academicYearName,
        candidateName: info.candidateName,
        waves: info.waves,
      });
      if (info.waves.length === 1) setRedeemWave(info.waves[0]!.id);
    } catch {
      setRedeemError('Kode formulir tidak ditemukan.');
      setRedeemInfo(null);
    } finally {
      setCheckingCode(false);
    }
  }

  async function onRedeem(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!redeemCandidate) {
      setRedeemError('Pilih calon murid untuk kode ini.');
      return;
    }
    if (redeemInfo && redeemInfo.waves.length > 1 && !redeemWave) {
      setRedeemError('Pilih gelombang pendaftaran.');
      return;
    }
    setRedeemError(null);
    setBusy(true);
    try {
      const reg = await createRegistration(
        redeemCandidate,
        redeemCode.trim().toUpperCase(),
        redeemWave || undefined,
      );
      router.push(`/akun/pendaftaran/${reg.id}`);
    } catch (err) {
      setRedeemError(
        err instanceof ApiError ? err.message : 'Gagal menggunakan kode.',
      );
    } finally {
      setBusy(false);
    }
  }

  const regByCandidate = useMemo(
    () => new Map(regs.map((r) => [r.candidate.id, r])),
    [regs],
  );
  const entriesByCandidate = useMemo(() => {
    const m = new Map<string, TitipanEntryDto[]>();
    for (const e of entries) {
      if (!e.candidateId) continue;
      m.set(e.candidateId, [...(m.get(e.candidateId) ?? []), e]);
    }
    return m;
  }, [entries]);

  if (loading) {
    return (
      <main className="flex min-h-[calc(100dvh-4rem)] items-center justify-center bg-sand-50">
        <p className="text-sm font-medium text-sand-500">Memuat akun…</p>
      </main>
    );
  }

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
              <p className="text-sm text-sand-600">Kelola titipan &amp; pendaftaran murid baru Anda</p>
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
              Belum ada pendaftaran. Daftarkan titipan dulu — setelah menerima
              kode formulir dari panitia, Anda bisa melanjutkan ke pendaftaran resmi.
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
          title="Daftar Titipan Saya"
          action={
            <Button size="sm" variant="outline" onClick={() => openRedeem()}>
              Punya Kode Formulir?
            </Button>
          }
        >
          {entries.length === 0 ? (
            <div className="rounded-2xl bg-sand-50 px-4 py-6 text-sm text-sand-600">
              <p className="text-center">
                Belum ada titipan. Titipan mengamankan posisi antrean anak —
                bisa untuk tahun ajaran mendatang. Pilih kandidat di bawah lalu
                tekan <b>Daftar Titipan</b>, atau titip tanpa akun lewat{' '}
                <Link href="/daftar-titipan" className="font-semibold text-primary-700">
                  formulir titipan
                </Link>
                .
              </p>
            </div>
          ) : (
            <ul className="space-y-3">
              {entries.map((e) => (
                <li
                  key={e.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-sand-200 bg-sand-50 px-5 py-4"
                >
                  <div>
                    <p className="font-bold text-sand-950">{e.candidateName}</p>
                    <p className="mt-0.5 text-xs font-semibold tracking-wide text-sand-500">
                      TA {e.academicYearName} · Antrean #{e.queueNo}
                      {e.position != null ? ` · posisi ke-${e.position}` : ''}
                    </p>
                    {e.status === 'CODE_SENT' && e.formCode ? (
                      <p className="mt-1 font-mono text-sm font-extrabold tracking-widest text-primary-700">
                        {e.formCode}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge tone={TITIPAN_TONE[e.status] ?? 'neutral'}>
                      {TITIPAN_STATUS_LABELS[e.status]}
                    </Badge>
                    {e.status === 'CODE_SENT' && e.formCode ? (
                      <Button
                        size="sm"
                        onClick={() =>
                          openRedeem(e.formCode ?? undefined, e.candidateId ?? undefined)
                        }
                      >
                        Gunakan Kode
                      </Button>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-4 text-xs leading-relaxed text-sand-500">
            Cara kerja: daftarkan titipan → panitia memverifikasi → Anda
            menerima <b>kode formulir unik</b> lewat WhatsApp sesuai antrean
            &amp; kuota → masukkan kode untuk melanjutkan pendaftaran resmi
            (pembayaran, formulir, berkas).
          </p>
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
                const myEntries = entriesByCandidate.get(cd.id) ?? [];
                const active = myEntries.filter((e) =>
                  ['PENDING', 'WAITING', 'CODE_SENT'].includes(e.status),
                );
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
                    {active.length > 0 ? (
                      <ul className="mt-3 space-y-1.5">
                        {active.map((e) => (
                          <li
                            key={e.id}
                            className="flex items-center justify-between rounded-xl bg-sand-50 px-3 py-2 text-xs"
                          >
                            <span className="font-semibold text-sand-700">
                              TA {e.academicYearName} · #{e.queueNo}
                            </span>
                            <Badge tone={TITIPAN_TONE[e.status] ?? 'neutral'}>
                              {TITIPAN_STATUS_LABELS[e.status]}
                            </Badge>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                    {reg ? (
                      <Link
                        href={`/akun/pendaftaran/${reg.id}`}
                        className="mt-4 text-sm font-semibold text-primary-700 hover:text-primary-800"
                      >
                        Lihat pendaftaran ({REGISTRATION_STATUS_LABELS[reg.status]}) →
                      </Link>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        className="mt-4"
                        onClick={() => setTitipanFor(cd)}
                      >
                        Daftar Titipan
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

      <Modal
        open={titipanFor !== null}
        onClose={() => setTitipanFor(null)}
        title={`Daftar Titipan — ${titipanFor?.name ?? ''}`}
        description="Titipan mengamankan posisi antrean. Anda bisa menitip untuk tahun ajaran mendatang sekalipun."
      >
        <form onSubmit={onTitipan} className="space-y-4">
          <Field label="Tahun Ajaran Masuk">
            <Select name="academicYearId" required defaultValue="">
              <option value="" disabled>
                Pilih tahun ajaran…
              </option>
              {years.map((y) => (
                <option key={y.academicYearId} value={y.academicYearId}>
                  {y.name}
                  {y.quota != null ? ` (kuota ${y.quota})` : ''}
                </option>
              ))}
            </Select>
          </Field>
          {years.length === 0 ? (
            <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">
              Daftar titipan belum dibuka — hubungi panitia SPMB.
            </p>
          ) : null}
          <Field
            label="No. HP Orang Tua/Wali"
            hint="WhatsApp aktif — kosongkan untuk pakai nomor akun"
          >
            <Input
              name="guardianPhone"
              type="tel"
              placeholder="08xxxxxxxxxx"
            />
          </Field>
          <Field label="Sumber Informasi" hint="Dari mana Anda tahu SPMB ini?">
            <Select name="infoSource" defaultValue="">
              <option value="" disabled>
                Pilih…
              </option>
              {INFO_SOURCES.map((s) => (
                <option key={s} value={s}>
                  {INFO_SOURCE_LABELS[s as InfoSource]}
                </option>
              ))}
            </Select>
          </Field>
          <Button type="submit" disabled={busy || years.length === 0} className="w-full">
            {busy ? 'Mengirim…' : 'Kirim Titipan'}
          </Button>
        </form>
      </Modal>

      <Modal
        open={redeemOpen}
        onClose={() => setRedeemOpen(false)}
        title="Gunakan Kode Formulir"
        description="Masukkan kode unik yang dikirim panitia ke WhatsApp Anda untuk membuka pendaftaran resmi."
      >
        <form onSubmit={onRedeem} className="space-y-4">
          <Field label="Kode Formulir" hint="Contoh: SPMB-X7K2PQ">
            <Input
              name="formCode"
              required
              value={redeemCode}
              onChange={(e) => {
                setRedeemCode(e.target.value);
                void checkCode(e.target.value);
              }}
              placeholder="SPMB-XXXXXX"
              className="font-mono uppercase tracking-widest"
              autoComplete="off"
            />
          </Field>
          {checkingCode ? (
            <p className="text-xs text-sand-500">Memeriksa kode…</p>
          ) : null}
          {redeemInfo ? (
            <div className="rounded-xl border border-primary-200 bg-primary-50 px-4 py-3 text-sm">
              <p className="font-semibold text-primary-800">
                Kode valid — TA {redeemInfo.academicYearName}
              </p>
              <p className="mt-0.5 text-xs text-primary-700">
                untuk {redeemInfo.candidateName}
              </p>
            </div>
          ) : null}
          <Field label="Calon Murid" hint="Pilih anak yang akan didaftarkan dengan kode ini">
            <Select
              required
              value={redeemCandidate}
              onChange={(e) => setRedeemCandidate(e.target.value)}
            >
              <option value="" disabled>
                Pilih calon murid…
              </option>
              {candidates.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
          {candidates.length === 0 ? (
            <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">
              Tambahkan data calon murid dulu di halaman ini, lalu ulangi.
            </p>
          ) : null}
          {redeemInfo && redeemInfo.waves.length > 1 ? (
            <Field label="Gelombang">
              <Select
                required
                value={redeemWave}
                onChange={(e) => setRedeemWave(e.target.value)}
              >
                <option value="" disabled>
                  Pilih gelombang…
                </option>
                {redeemInfo.waves.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </Select>
            </Field>
          ) : null}
          {redeemError ? (
            <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
              {redeemError}
            </p>
          ) : null}
          <Button type="submit" disabled={busy || !redeemInfo} className="w-full">
            {busy ? 'Memproses…' : 'Buka Pendaftaran'}
          </Button>
        </form>
      </Modal>
    </main>
  );
}
