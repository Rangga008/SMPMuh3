'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Button, Field, Input } from '@smpmuh3/ui';
import { Shell } from '@/components/shell';
import { PageTitle, Widget } from '@/components/widgets';
import { getStudentRecord, updateStudentRecord } from '@/lib/api-ops';
import { ApiError } from '@/lib/api';

const FIELDS: { key: string; label: string; hint?: string }[] = [
  { key: 'previousSchool', label: 'Pendidikan Sebelumnya', hint: 'SD/MI asal' },
  { key: 'healthNotes', label: 'Keterangan Kesehatan' },
  { key: 'fatherName', label: 'Nama Ayah' },
  { key: 'motherName', label: 'Nama Ibu' },
  { key: 'parentOccupation', label: 'Pekerjaan Orang Tua' },
  { key: 'parentPhone', label: 'No. HP Orang Tua' },
  { key: 'intelligenceNotes', label: 'Keterangan Intelegensi' },
  { key: 'leavingNotes', label: 'Meninggalkan Sekolah', hint: 'lulus/pindah/keluar + tanggal' },
  { key: 'otherNotes', label: 'Lain-lain' },
];

export default function BukuIndukPage() {
  const { id } = useParams<{ id: string }>();
  const [s, setS] = useState<Awaited<ReturnType<typeof getStudentRecord>> | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    getStudentRecord(id).then((st) => {
      setS(st);
      setForm(Object.fromEntries(FIELDS.map((f) => [f.key, (st as unknown as Record<string, string>)[f.key] ?? ''])));
    }).catch((e) => setError(e instanceof ApiError ? e.message : 'Gagal memuat.'));
  }, [id]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      await updateStudentRecord(id, form);
      setNotice('Buku induk tersimpan.');
    } catch (er) {
      setError(er instanceof ApiError ? er.message : 'Gagal menyimpan.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Shell>
      <Link href={`/kesiswaan/${id}`} className="text-sm font-semibold text-primary-700 hover:text-primary-800">
        ← Detail Siswa
      </Link>
      <div className="mt-2">
      <PageTitle title={`Buku Induk — ${s?.name ?? 'Siswa'}`} subtitle="Data lengkap peserta didik: identitas, tempat tinggal, kesehatan, pendidikan sebelumnya, orang tua, intelegensi, kehadiran, dan catatan meninggalkan sekolah." />
      </div>
      {error ? <p className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
      {notice ? <p className="mb-4 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{notice}</p> : null}
      {s && (
        <form onSubmit={save}>
          <Widget title="Identitas">
            <dl className="grid gap-x-6 gap-y-2 px-5 py-4 sm:grid-cols-3">
              <div><dt className="text-xs text-sand-500">NIS</dt><dd className="font-semibold">{s.nis ?? '—'}</dd></div>
              <div><dt className="text-xs text-sand-500">NISN</dt><dd className="font-semibold">{s.nisn ?? '—'}</dd></div>
              <div><dt className="text-xs text-sand-500">Status</dt><dd className="font-semibold">{s.status}</dd></div>
              <div><dt className="text-xs text-sand-500">Tempat, Tgl Lahir</dt><dd className="font-semibold">{[s.birthPlace, s.birthDate?.slice(0, 10)].filter(Boolean).join(', ') || '—'}</dd></div>
              <div><dt className="text-xs text-sand-500">Alamat</dt><dd className="font-semibold">{s.address ?? '—'}</dd></div>
              <div><dt className="text-xs text-sand-500">Kelas</dt><dd className="font-semibold">{s.enrollments?.[0]?.class?.name ?? '—'}</dd></div>
            </dl>
          </Widget>
          <div className="mt-5">
            <Widget title="Data Buku Induk" subtitle="Semua kolom dapat diedit lalu disimpan.">
              <div className="grid gap-4 px-5 py-4 sm:grid-cols-2">
                {FIELDS.map((f) => (
                  <Field key={f.key} label={f.label} hint={f.hint} className={f.key.includes('Notes') ? 'sm:col-span-2' : ''}>
                    {f.key.includes('Notes') ? (
                      <textarea
                        className="w-full rounded-xl border border-sand-200 bg-white px-3 py-2 text-sm"
                        rows={2}
                        value={form[f.key] ?? ''}
                        onChange={(e) => setForm((x) => ({ ...x, [f.key]: e.target.value }))}
                      />
                    ) : (
                      <Input value={form[f.key] ?? ''} onChange={(e) => setForm((x) => ({ ...x, [f.key]: e.target.value }))} />
                    )}
                  </Field>
                ))}
              </div>
              <div className="flex justify-end px-5 pb-4">
                <Button type="submit" disabled={busy}>{busy ? 'Menyimpan…' : 'Simpan Buku Induk'}</Button>
              </div>
            </Widget>
          </div>
        </form>
      )}
    </Shell>
  );
}
