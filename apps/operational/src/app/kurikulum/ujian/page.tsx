'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Badge, Button, Field, Input, Modal, Select } from '@smpmuh3/ui';
import { Shell } from '@/components/shell';
import { PageTitle, Widget } from '@/components/widgets';
import { DataTable } from '@/components/data-table';
import { RowBtn, rowActionClasses } from '@/components/row-btn';
import { useConfirm } from '@/components/confirm-dialog';
import { usePermission } from '@/lib/use-permission';
import { PERMISSIONS } from '@smpmuh3/types';
import {
  ApiError,
  listAcademicYears,
  listAssessments,
  listClasses,
  type AcademicYear,
  type AssessmentView,
  type ClassView,
} from '@/lib/api';
import { createExam, deleteExam, listExams, updateExam, type ExamView } from '@/lib/api-ops';

const STATUS: Record<ExamView['status'], { label: string; tone: 'neutral' | 'primary' | 'danger' }> = {
  DRAFT: { label: 'Draf', tone: 'neutral' },
  OPEN: { label: 'Dibuka', tone: 'primary' },
  CLOSED: { label: 'Ditutup', tone: 'danger' },
};
const dt = (s: string) =>
  new Date(s).toLocaleString('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

export default function UjianPage() {
  const [years, setYears] = useState<AcademicYear[]>([]);
  const [yearId, setYearId] = useState('');
  const [classes, setClasses] = useState<ClassView[]>([]);
  const [assessments, setAssessments] = useState<AssessmentView[]>([]);
  const [exams, setExams] = useState<ExamView[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [modalErr, setModalErr] = useState<string | null>(null);
  const [modal, setModal] = useState(false);
  const [busy, setBusy] = useState(false);
  const canManage = usePermission(PERMISSIONS.ACADEMIC_MANAGE);
  const { confirm, dialog } = useConfirm();

  const clsName = useCallback(
    (id: string) => classes.find((c) => c.id === id)?.name ?? '—',
    [classes],
  );

  const load = useCallback((y?: string) => {
    listExams(y).then(setExams).catch((e) => setError(e instanceof ApiError ? e.message : 'Gagal memuat.'));
  }, []);

  useEffect(() => {
    listAcademicYears()
      .then((ys) => {
        setYears(ys);
        const active = ys.find((y) => y.isActive) ?? ys[0] ?? null;
        if (active) {
          setYearId(active.id);
          load(active.id);
          listClasses(active.id).then(setClasses).catch(() => {});
          listAssessments(active.id).then(setAssessments).catch(() => {});
        }
      })
      .catch(() => setError('Gagal memuat tahun ajaran.'));
  }, [load]);

  const switchYear = (y: string) => {
    setYearId(y);
    load(y);
    listClasses(y).then(setClasses).catch(() => setClasses([]));
    listAssessments(y).then(setAssessments).catch(() => setAssessments([]));
  };

  const create = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const classIds = classes.filter((c) => f.get(`cls-${c.id}`)).map((c) => c.id);
    setModalErr(null);
    if (!classIds.length) { setModalErr('Pilih minimal satu rombel peserta.'); return; }
    setBusy(true);
    try {
      await createExam({
        assessmentId: String(f.get('assessmentId')),
        classIds,
        startAt: new Date(String(f.get('startAt'))).toISOString(),
        endAt: new Date(String(f.get('endAt'))).toISOString(),
        durationMin: Number(f.get('durationMin')) || 90,
        title: String(f.get('title') ?? '').trim() || undefined,
        instructions: String(f.get('instructions') ?? '').trim() || undefined,
        shuffle: f.get('shuffle') === 'on',
        showScore: f.get('showScore') !== null,
      });
      setModal(false);
      setNotice('Ujian dibuat — buka detail untuk kode & memulai sesi.');
      load(yearId);
    } catch (err) {
      setModalErr(err instanceof ApiError ? err.message : 'Gagal membuat ujian.');
    } finally {
      setBusy(false);
    }
  };

  const toggle = async (x: ExamView) => {
    const next = x.status === 'OPEN' ? 'CLOSED' : 'OPEN';
    const ok = await confirm(
      next === 'OPEN'
        ? `Buka ujian "${x.title}"? Siswa bisa masuk dengan NIS + kode sesuai jadwal.`
        : `Tutup ujian "${x.title}"? Sesi berjalan tetap dinilai saat waktu habis.`,
    );
    if (!ok) return;
    setError(null);
    try {
      await updateExam(x.id, { status: next });
      load(yearId);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Gagal mengubah status.');
    }
  };

  const remove = async (x: ExamView) => {
    const ok = await confirm(`Hapus ujian "${x.title}"? Hanya bisa bila belum ada siswa mengerjakan.`);
    if (!ok) return;
    setError(null);
    try {
      await deleteExam(x.id);
      setNotice('Ujian dihapus.');
      load(yearId);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Gagal menghapus.');
    }
  };

  return (
    <Shell>
      <PageTitle
        title="Ujian CBT"
        subtitle="Sesi ujian online — siswa masuk dengan NIS + kode lewat halaman CBT"
        actions={
          canManage ? <Button size="sm" onClick={() => { setModalErr(null); setModal(true); }}>+ Ujian Baru</Button> : undefined
        }
      />
      {error ? <p className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
      {notice ? <p className="mb-4 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{notice}</p> : null}

      <Widget
        title="Daftar Ujian"
        subtitle="Buka sesi saat jadwal tiba; siswa mengerjakan di situs CBT (NIS + kode dari pengawas)."
        action={
          <Select value={yearId} onChange={(e) => switchYear(e.target.value)} className="w-44">
            {years.map((y) => <option key={y.id} value={y.id}>{y.name}</option>)}
          </Select>
        }
      >
        <DataTable
          head={['Kode', 'Ujian', 'Jadwal & Durasi', 'Peserta', 'Soal', 'Status', '']}
          empty={!exams.length ? 'Belum ada ujian di tahun ajaran ini — buat lewat tombol kanan atas.' : undefined}
        >
          {exams.map((x) => (
            <tr key={x.id}>
              <td className="px-5 py-3">
                <code className="rounded-lg bg-sand-100 px-2 py-1 text-xs font-black tracking-wider text-sand-800">{x.code}</code>
              </td>
              <td className="px-5 py-3">
                <p className="font-bold text-sand-900">{x.title}</p>
                <p className="text-xs text-sand-500">{x.assessment.subject.name} · {x.assessment.name}</p>
              </td>
              <td className="px-5 py-3 text-xs text-sand-600">
                {dt(x.startAt)} – {dt(x.endAt)}
                <span className="block text-sand-400">{x.durationMin} menit</span>
              </td>
              <td className="px-5 py-3 text-xs text-sand-600">
                {x.classIds.map(clsName).join(', ') || '—'}
                <span className="block text-sand-400">{x._count?.attempts ?? 0} siswa masuk</span>
              </td>
              <td className="px-5 py-3 text-xs text-sand-600">{x.assessment._count?.questions ?? '—'} butir</td>
              <td className="px-5 py-3"><Badge tone={STATUS[x.status].tone}>{STATUS[x.status].label}</Badge></td>
              <td className="px-5 py-3">
                <div className="flex flex-wrap gap-1.5">
                  <Link href={`/kurikulum/ujian/${x.id}`} className={rowActionClasses('neutral')}>Monitor</Link>
                  {canManage ? (
                    <>
                      <RowBtn onClick={() => void toggle(x)}>{x.status === 'OPEN' ? 'Tutup' : 'Buka'}</RowBtn>
                      <RowBtn tone="danger" onClick={() => void remove(x)}>Hapus</RowBtn>
                    </>
                  ) : null}
                </div>
              </td>
            </tr>
          ))}
        </DataTable>
      </Widget>

      <Modal open={modal} onClose={() => setModal(false)} title="Ujian Baru" size="xl">
        <form onSubmit={create} className="space-y-4">
          {modalErr ? <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{modalErr}</p> : null}
          <Field label="Asesmen / Bank Soal">
            <Select name="assessmentId">
              <option value="">— pilih asesmen —</option>
              {assessments.map((a) => (
                <option key={a.id} value={a.id}>{a.name} · {a.subject.name}{a.class ? ` · ${a.class.name}` : ''}</option>
              ))}
            </Select>
          </Field>
          <p className="-mt-2 text-xs text-sand-500">Asesmen harus sudah punya butir soal — susun di Penilaian → detail asesmen.</p>
          <Field label="Judul Ujian">
            <Input name="title" placeholder="Kosong = pakai nama asesmen" />
          </Field>
          <Field label="Rombel Peserta">
            <div className="flex flex-wrap gap-2 rounded-xl border border-sand-200 p-3">
              {classes.map((c) => (
                <label key={c.id} className="flex items-center gap-1.5 rounded-lg bg-sand-50 px-2.5 py-1.5 text-xs font-medium">
                  <input type="checkbox" name={`cls-${c.id}`} /> {c.name}
                </label>
              ))}
              {!classes.length ? <span className="text-xs text-sand-400">Tidak ada rombel di tahun ini.</span> : null}
            </div>
          </Field>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Mulai"><Input name="startAt" type="datetime-local" required /></Field>
            <Field label="Selesai"><Input name="endAt" type="datetime-local" required /></Field>
            <Field label="Durasi (menit)"><Input name="durationMin" type="number" min={5} max={600} defaultValue={90} required /></Field>
          </div>
          <Field label="Instruksi untuk siswa">
            <Input name="instructions" placeholder="Contoh: kerjakan sendiri, dilarang membuka tab lain" />
          </Field>
          <div className="flex gap-6">
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="shuffle" /> Acak urutan soal per siswa</label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="showScore" defaultChecked /> Tampilkan nilai setelah selesai</label>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setModal(false)}>Batal</Button>
            <Button type="submit" disabled={busy}>{busy ? 'Membuat…' : 'Buat Ujian'}</Button>
          </div>
        </form>
      </Modal>
      {dialog}
    </Shell>
  );
}
