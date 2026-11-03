'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Badge, Button, Field, Input, Select } from '@smpmuh3/ui';
import {
  INFO_SOURCES,
  INFO_SOURCE_LABELS,
  type InfoSource,
  type TitipanEntryDto,
  type TitipanYearSummaryDto,
} from '@smpmuh3/types';
import { ApiError, createGuestTitipan, listTitipanYears } from '@/lib/api';
import { AuthShell } from '@/components/auth-shell';
import { buttonClasses } from '@smpmuh3/ui';

export default function DaftarTitipanPage() {
  const [years, setYears] = useState<TitipanYearSummaryDto[]>([]);
  const [yearId, setYearId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<TitipanEntryDto | null>(null);

  useEffect(() => {
    listTitipanYears()
      .then((ys) => {
        setYears(ys);
        if (ys.length === 1) setYearId(ys[0]!.academicYearId);
      })
      .catch(() => setYears([]));
  }, []);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const f = new FormData(e.currentTarget);
    const val = (k: string) => String(f.get(k) ?? '').trim() || undefined;
    try {
      if (val('website')) {
        // honeypot — pura-pura sukses
        setDone({} as TitipanEntryDto);
        return;
      }
      const entry = await createGuestTitipan({
        academicYearId: yearId,
        candidateName: val('candidateName')!.toUpperCase(),
        birthPlace: val('birthPlace'),
        birthDate: val('birthDate'),
        address: val('address'),
        previousSchool: val('previousSchool'),
        guardianPhone: val('guardianPhone')!,
        infoSource: val('infoSource'),
      });
      setDone(entry);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : 'Gagal mengirim titipan — periksa kembali isian Anda.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell
      title="Daftar Titipan SPMB"
      subtitle="Amankan posisi antrean lebih awal — bisa untuk tahun ajaran mendatang. Setelah data terverifikasi, kode formulir akan dikirim ke WhatsApp Anda."
      footer={
        <>
          Sudah punya akun?{' '}
          <Link href="/masuk" className="font-semibold text-primary-700 hover:text-primary-800">
            Masuk
          </Link>{' '}
          ·{' '}
          <Link href="/titipan" className="font-semibold text-primary-700 hover:text-primary-800">
            Lihat Data Titipan →
          </Link>
        </>
      }
    >
      {done ? (
        <div className="space-y-4 text-center">
          <span aria-hidden="true" className="mx-auto flex size-14 items-center justify-center rounded-full bg-primary-100 text-2xl">
            ✓
          </span>
          <div>
            <p className="font-extrabold text-sand-950">Titipan diterima!</p>
            {done.queueNo ? (
              <>
                <p className="mt-1 text-sm text-sand-600">
                  {done.candidateName} — TA {done.academicYearName}
                </p>
                <Badge tone="accent" className="mt-3">
                  Antrean #{done.queueNo}
                </Badge>
              </>
            ) : null}
          </div>
          <p className="rounded-xl bg-sand-50 px-4 py-3 text-left text-xs leading-relaxed text-sand-600">
            Data Anda masuk status <b>verifikasi</b>. Setelah diverifikasi
            panitia, Anda akan menerima <b>kode formulir unik</b> lewat
            WhatsApp — gunakan untuk mengisi pendaftaran resmi saat giliran
            tiba. Pantau posisi Anda di halaman Data Titipan.
          </p>
          <Link href="/titipan" className={buttonClasses({ className: 'w-full' })}>
            Lihat Data Titipan
          </Link>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="space-y-4">
          {years.length === 0 ? (
            <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">
              Daftar titipan belum dibuka untuk tahun ajaran mana pun.
            </p>
          ) : null}

          <Field label="Tahun Ajaran Masuk">
            {years.length <= 3 ? (
              <div className="grid gap-2">
                {years.map((y) => (
                  <label
                    key={y.academicYearId}
                    className={`flex cursor-pointer items-center justify-between rounded-xl border px-4 py-3 text-sm font-semibold transition-colors ${
                      yearId === y.academicYearId
                        ? 'border-primary-400 bg-primary-50 text-primary-800'
                        : 'border-sand-200 bg-white text-sand-700 hover:border-sand-300'
                    }`}
                  >
                    <span>{y.name}</span>
                    {y.quota != null ? (
                      <span className="text-xs font-medium text-sand-500">
                        kuota {y.quota}
                      </span>
                    ) : null}
                    <input
                      type="radio"
                      name="academicYearId"
                      value={y.academicYearId}
                      checked={yearId === y.academicYearId}
                      onChange={() => setYearId(y.academicYearId)}
                      className="sr-only"
                      required
                    />
                  </label>
                ))}
              </div>
            ) : (
              <Select
                name="academicYearId"
                required
                value={yearId}
                onChange={(e) => setYearId(e.target.value)}
              >
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
            )}
          </Field>

          <Field label="Nama Calon Siswa">
            <Input
              name="candidateName"
              required
              minLength={3}
              placeholder="Nama lengkap"
              style={{ textTransform: 'uppercase' }}
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Tempat Lahir">
              <Input name="birthPlace" placeholder="Kota kelahiran" />
            </Field>
            <Field label="Tanggal Lahir">
              <Input name="birthDate" type="date" />
            </Field>
          </div>
          <Field label="Alamat">
            <Input name="address" placeholder="Alamat domisili" />
          </Field>
          <Field label="Sekolah Asal" hint="SD/MI/TK-RA asal">
            <Input name="previousSchool" placeholder="Contoh: SD Muhammadiyah 3" />
          </Field>
          <Field
            label="No. HP Orang Tua/Wali *"
            hint="WhatsApp aktif — kode formulir dikirim ke nomor ini"
          >
            <Input
              name="guardianPhone"
              type="tel"
              required
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
          {/* honeypot anti-spam */}
          <input
            type="text"
            name="website"
            tabIndex={-1}
            autoComplete="off"
            className="hidden"
            aria-hidden="true"
          />
          {error ? (
            <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
              {error}
            </p>
          ) : null}
          <Button type="submit" disabled={busy || years.length === 0 || !yearId} className="w-full">
            {busy ? 'Mengirim…' : 'Kirim Titipan'}
          </Button>
        </form>
      )}
    </AuthShell>
  );
}
