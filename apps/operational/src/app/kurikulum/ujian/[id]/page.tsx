'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Badge, Button, Field, Input, Modal, Select } from '@smpmuh3/ui';
import { Shell } from '@/components/shell';
import { PageTitle, Widget } from '@/components/widgets';
import { DataTable } from '@/components/data-table';
import { useConfirm } from '@/components/confirm-dialog';
import { usePermission } from '@/lib/use-permission';
import { PERMISSIONS } from '@smpmuh3/types';
import { ApiError, listClasses, type ClassView } from '@/lib/api';
import { getExam, regenerateExamCode, updateExam, type ExamView } from '@/lib/api-ops';

const STATUS: Record<ExamView['status'], { label: string; tone: 'neutral' | 'primary' | 'danger' }> = {
  DRAFT: { label: 'Draf — siswa belum bisa masuk', tone: 'neutral' },
  OPEN: { label: 'Dibuka — siswa bisa masuk sesuai jadwal', tone: 'primary' },
  CLOSED: { label: 'Ditutup', tone: 'danger' },
};
const dt = (s: string) =>
  new Date(s).toLocaleString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

export default function UjianDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [exam, setExam] = useState<ExamView | null>(null);
  const [classes, setClasses] = useState<ClassView[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [modalErr, setModalErr] = useState<string | null>(null);
  const [modal, setModal] = useState(false);
  const [busy, setBusy] = useState(false);
  const canManage = usePermission(PERMISSIONS.ACADEMIC_MANAGE);
  const { confirm, dialog } = useConfirm();

  const load = useCallback(() => {
    getExam(id)
      .then((x) => {
        setExam(x);
        if (!classes.length) listClasses(x.academicYearId).then(setClasses).catch(() => {});
      })
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Gagal memuat.'));
  }, [id, classes.length]);
  useEffect(load, [load]);
  // Polling ringan saat ujian dibuka — pantau siswa masuk/submit.
  useEffect(() => {
    if (exam?.status !== 'OPEN') return;
    const t = setInterval(load, 15_000);
    return () => clearInterval(t);
  }, [exam?.status, load]);

  const copy = async () => {
    if (!exam) return;
    try {
      await navigator.clipboard.writeText(exam.code);
      setNotice('Kode tersalin.');
    } catch {
      setNotice(`Kode: ${exam.code}`);
    }
  };

  const regen = async () => {
    if (!exam) return;
    const ok = await confirm('Ganti kode ujian? Kode lama langsung tidak berlaku — bagikan kode baru ke siswa.');
    if (!ok) return;
    try {
      await regenerateExamCode(exam.id);
      setNotice('Kode baru dibuat.');
      load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Gagal mengganti kode.');
    }
  };

  const setStatus = async (status: ExamView['status']) => {
    if (!exam) return;
    const msg =
      status === 'OPEN'
        ? 'Buka ujian ini? Siswa dengan NIS + kode bisa masuk sesuai jadwal.'
        : status === 'CLOSED'
          ? 'Tutup ujian? Sesi berjalan tetap dinilai saat deadline.'
          : 'Kembalikan ke draf? Siswa tidak bisa masuk.';
    if (!(await confirm(msg))) return;
    try {
      await updateExam(exam.id, { status });
      load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Gagal mengubah status.');
    }
  };

  const save = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!exam) return;
    const f = new FormData(e.currentTarget);
    const classIds = classes.filter((c) => f.get(`cls-${c.id}`)).map((c) => c.id);
    setModalErr(null);
    if (!classIds.length) { setModalErr('Pilih minimal satu rombel peserta.'); return; }
    setBusy(true);
    try {
      await updateExam(exam.id, {
        title: String(f.get('title') ?? '').trim(),
        instructions: String(f.get('instructions') ?? '').trim() || null,
        startAt: new Date(String(f.get('startAt'))).toISOString(),
        endAt: new Date(String(f.get('endAt'))).toISOString(),
        durationMin: Number(f.get('durationMin')) || exam.durationMin,
        classIds,
        shuffle: f.get('shuffle') === 'on',
        showScore: f.get('showScore') === 'on',
      });
      setModal(false);
      setNotice('Ujian diperbarui.');
      load();
    } catch (err) {
      setModalErr(err instanceof ApiError ? err.message : 'Gagal menyimpan.');
    } finally {
      setBusy(false);
    }
  };

  const toLocalInput = (iso: string) => {
    const d = new Date(iso);
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 16);
  };

  const done = exam?.attempts?.filter((a) => a.status === 'SUBMITTED').length ?? 0;
  const total = exam?.attempts?.length ?? 0;

  return (
    <Shell>
      <PageTitle
        title={exam?.title ?? 'Ujian'}
        subtitle={exam ? `${exam.assessment.subject.name} · ${exam.assessment.name}` : ''}
        actions={
          <Link href="/kurikulum/ujian" className="text-sm font-bold text-primary-700 hover:underline">← Semua Ujian</Link>
        }
      />
      {error ? <p className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
      {notice ? <p className="mb-4 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{notice}</p> : null}
      {!exam ? null : (
        <div className="grid gap-4 lg:grid-cols-3">
          {/* ---------- Kode & pengaturan ---------- */}
          <Widget title="Kode Akses" subtitle="Bagikan ke siswa — mereka masuk situs CBT dengan NIS + kode ini.">
            <div className="space-y-3 p-5">
              <button
                type="button"
                onClick={() => void copy()}
                title="Klik untuk salin"
                className="w-full rounded-2xl bg-primary-700 px-4 py-5 text-center font-mono text-3xl font-black tracking-[0.2em] text-white transition hover:bg-primary-800"
              >
                {exam.code}
              </button>
              <p className="text-center text-xs text-sand-500">Klik kode untuk menyalin</p>
              <div className="flex gap-2">
                {canManage ? (
                  <Button size="sm" variant="outline" className="flex-1" onClick={() => void regen()}>Ganti Kode</Button>
                ) : null}
                <Button size="sm" variant="outline" className="flex-1" onClick={load}>↻ Segarkan</Button>
              </div>
              <div className="rounded-xl bg-sand-50 p-3 text-xs text-sand-600">
                <p><Badge tone={STATUS[exam.status].tone}>{STATUS[exam.status].label}</Badge></p>
                <p className="mt-2">📅 {dt(exam.startAt)} → {dt(exam.endAt)}</p>
                <p>⏱ Durasi {exam.durationMin} menit · {exam.assessment.questions?.length ?? exam.assessment._count?.questions ?? '—'} butir</p>
                <p>🏫 Rombel: {exam.classNames?.join(', ') || '—'}</p>
                <p>🔀 Acak soal: {exam.shuffle ? 'Ya' : 'Tidak'} · Nilai tampil: {exam.showScore ? 'Ya' : 'Tidak'}</p>
                {exam.instructions ? <p className="mt-1 italic">“{exam.instructions}”</p> : null}
              </div>
              {canManage ? (
                <div className="flex gap-2">
                  {exam.status !== 'OPEN' ? (
                    <Button size="sm" className="flex-1" onClick={() => void setStatus('OPEN')}>Buka Ujian</Button>
                  ) : (
                    <Button size="sm" variant="outline" className="flex-1" onClick={() => void setStatus('CLOSED')}>Tutup</Button>
                  )}
                  {exam.status !== 'DRAFT' ? (
                    <Button size="sm" variant="outline" className="flex-1" onClick={() => void setStatus('DRAFT')}>Draf</Button>
                  ) : null}
                  <Button size="sm" variant="outline" className="flex-1" onClick={() => { setModalErr(null); setModal(true); }}>Edit</Button>
                </div>
              ) : null}
            </div>
          </Widget>

          {/* ---------- Monitor siswa ---------- */}
          <div className="lg:col-span-2">
            <Widget
              title={`Peserta — ${done}/${total} selesai`}
              subtitle="Diperbarui otomatis tiap 15 detik saat ujian dibuka."
            >
              <DataTable
                head={['Siswa', 'Rombel', 'Mulai', 'Sisa Waktu', 'Status', 'Nilai']}
                empty={!total ? 'Belum ada siswa masuk — bagikan kode saat jadwal tiba.' : undefined}
              >
                {(exam.attempts ?? []).map((a) => {
                  const left = a.status === 'STARTED' ? Math.max(0, Math.floor((new Date(a.deadline).getTime() - Date.now()) / 1000)) : null;
                  const mm = left === null ? '—' : `${Math.floor(left / 60)}m ${left % 60}d`;
                  return (
                    <tr key={a.id}>
                      <td className="px-5 py-2.5">
                        <p className="font-medium text-sand-900">{a.student.name}</p>
                        <p className="text-[11px] text-sand-400">{a.student.nis ?? '—'}</p>
                      </td>
                      <td className="px-5 py-2.5 text-xs text-sand-600">{a.student.className}</td>
                      <td className="px-5 py-2.5 text-xs text-sand-600">
                        {new Date(a.startedAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td className="px-5 py-2.5 text-xs font-bold text-sand-700">{mm}</td>
                      <td className="px-5 py-2.5">
                        <Badge tone={a.status === 'SUBMITTED' ? 'primary' : 'accent'}>
                          {a.status === 'SUBMITTED' ? 'Selesai' : 'Mengerjakan'}
                        </Badge>
                      </td>
                      <td className="px-5 py-2.5 font-black text-sand-900">
                        {a.status === 'SUBMITTED' ? `${a.score ?? 0}/${a.maxScore ?? 0}` : '—'}
                      </td>
                    </tr>
                  );
                })}
              </DataTable>
            </Widget>
          </div>
        </div>
      )}

      <Modal open={modal} onClose={() => setModal(false)} title="Edit Ujian" size="xl">
        {exam ? (
          <form onSubmit={save} className="space-y-4">
            {modalErr ? <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{modalErr}</p> : null}
            <Field label="Judul Ujian"><Input name="title" defaultValue={exam.title} /></Field>
            <Field label="Rombel Peserta">
              <div className="flex flex-wrap gap-2 rounded-xl border border-sand-200 p-3">
                {classes.map((c) => (
                  <label key={c.id} className="flex items-center gap-1.5 rounded-lg bg-sand-50 px-2.5 py-1.5 text-xs font-medium">
                    <input type="checkbox" name={`cls-${c.id}`} defaultChecked={exam.classIds.includes(c.id)} /> {c.name}
                  </label>
                ))}
              </div>
            </Field>
            <div className="grid grid-cols-3 gap-3">
              <Field label="Mulai"><Input name="startAt" type="datetime-local" defaultValue={toLocalInput(exam.startAt)} required /></Field>
              <Field label="Selesai"><Input name="endAt" type="datetime-local" defaultValue={toLocalInput(exam.endAt)} required /></Field>
              <Field label="Durasi (menit)"><Input name="durationMin" type="number" min={5} max={600} defaultValue={exam.durationMin} required /></Field>
            </div>
            <Field label="Instruksi"><Input name="instructions" defaultValue={exam.instructions ?? ''} /></Field>
            <div className="flex gap-6">
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="shuffle" defaultChecked={exam.shuffle} /> Acak urutan soal per siswa</label>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="showScore" defaultChecked={exam.showScore} /> Tampilkan nilai setelah selesai</label>
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setModal(false)}>Batal</Button>
              <Button type="submit" disabled={busy}>{busy ? 'Menyimpan…' : 'Simpan'}</Button>
            </div>
          </form>
        ) : null}
      </Modal>
      {dialog}
    </Shell>
  );
}
