'use client';

import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import type { DiscountRuleDto, FeeDto, FormQuestionDto, WaveDto } from '@smpmuh3/types';
import { Badge, Button, Field, Input, Modal, Select, Textarea } from '@smpmuh3/ui';
import { Shell } from '@/components/shell';
import { PageTitle, Widget } from '@/components/widgets';
import { useConfirm } from '@/components/confirm-dialog';
import {
  createFee,
  deleteDiscount,
  deleteFee,
  deleteQuestion,
  listAdminDiscounts,
  listAdminFees,
  listAdminQuestions,
  listAdminWaves,
  listWaveFees,
  saveDiscount,
  saveQuestion,
  saveWave,
  saveWaveFee,
  deleteWaveFee,
  updateFee,
  deleteWave,
  uploadSuratTemplate,
  type WaveFeeRow,
} from '@/lib/api';

const rupiah = (n: number) =>
  new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(n);

const FEE_LABELS: Record<string, string> = {
  pendaftaran: 'Uang Pendaftaran',
  registration: 'Uang Pendaftaran',
  dsp: 'DSP',
  dsp_dp: 'Uang Muka DSP (DP)',
  spp: 'SPP',
  seragam: 'Seragam',
};

/** Biaya baku — dipakai penagihan otomatis, tak bisa dihapus (nominalnya saja). */
const CORE_FEES = new Set(['registration', 'pendaftaran', 'dsp', 'dsp_dp', 'spp', 'seragam']);

const DISCOUNT_CATEGORIES = [
  { key: 'akademik', label: 'Prestasi Akademik' },
  { key: 'non_akademik', label: 'Prestasi Non-Akademik' },
  { key: 'alumni_sdm', label: 'Alumni SDM' },
] as const;
const CATEGORY_LABELS = Object.fromEntries(DISCOUNT_CATEGORIES.map((c) => [c.key, c.label]));

const FIELD_TYPES = [
  { key: 'text', label: 'Teks singkat', desc: 'Jawaban 1 baris — mis. nama, nilai rapor, nomor sertifikat.' },
  { key: 'textarea', label: 'Teks panjang', desc: 'Jawaban beberapa baris — mis. riwayat prestasi, alasan mendaftar.' },
  { key: 'number', label: 'Angka', desc: 'Jawaban berupa angka — mis. jumlah juz hafalan, rata-rata rapor.' },
  { key: 'date', label: 'Tanggal', desc: 'Pilih tanggal lewat kalender — mis. tanggal lulus SD.' },
  { key: 'select', label: 'Pilihan', desc: 'Ortu memilih dari daftar pilihan yang Anda isi di bawah.' },
] as const;

type Section = 'template' | 'biaya' | 'diskon' | 'gelombang' | 'pertanyaan';
const SECTIONS: { key: Section; title: string; desc: string }[] = [
  { key: 'template', title: 'Template Surat Pernyataan', desc: 'File PDF/JPG yang diunduh ortu, diisi, lalu diunggah kembali.' },
  { key: 'biaya', title: 'Biaya Pendidikan', desc: 'Tarif dasar: pendaftaran, DSP, SPP, seragam.' },
  { key: 'diskon', title: 'Diskon DSP Prestasi', desc: 'Potongan DSP per jalur prestasi & alumni SDM.' },
  { key: 'gelombang', title: 'Gelombang Pendaftaran', desc: 'Periode gelombang, status aktif, jadwal psikotes, tarif khusus.' },
  { key: 'pertanyaan', title: 'Pertanyaan Formulir', desc: 'Pertanyaan tambahan yang tampil setelah pembayaran.' },
];
const SECTION_TITLES = Object.fromEntries(SECTIONS.map((s) => [s.key, s.title])) as Record<Section, string>;

export default function SpmbSettingsPage() {
  return (
    <Suspense
      fallback={
        <Shell>
          <p className="text-sm text-sand-500">Memuat pengaturan…</p>
        </Shell>
      }
    >
      <SpmbSettingsInner />
    </Suspense>
  );
}

function SpmbSettingsInner() {
  const { confirm, dialog } = useConfirm();
  const router = useRouter();
  const searchParams = useSearchParams();
  const section = (searchParams.get('bagian') ?? '') as Section | '';
  const setSection = (s: Section | '') =>
    router.replace(s ? `/spmb/pengaturan?bagian=${s}` : '/spmb/pengaturan', { scroll: false });
  const [fees, setFees] = useState<FeeDto[]>([]);
  const [waves, setWaves] = useState<WaveDto[]>([]);
  const [questions, setQuestions] = useState<FormQuestionDto[]>([]);
  const [discounts, setDiscounts] = useState<DiscountRuleDto[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [waveModal, setWaveModal] = useState<WaveDto | 'new' | null>(null);
  const [questionModal, setQuestionModal] = useState<FormQuestionDto | 'new' | null>(null);
  const [qType, setQType] = useState<string>('text');
  const [optList, setOptList] = useState<string[]>([]);
  const [feeModal, setFeeModal] = useState(false);
  const [discModal, setDiscModal] = useState<DiscountRuleDto | 'new' | null>(null);
  const [feeWave, setFeeWave] = useState<WaveDto | null>(null);
  const [waveFees, setWaveFees] = useState<WaveFeeRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const templateRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    const [f, w, q, d] = await Promise.all([
      listAdminFees(),
      listAdminWaves(),
      listAdminQuestions(),
      listAdminDiscounts(),
    ]);
    setFees(f);
    setWaves(w);
    setQuestions(q);
    setDiscounts(d);
  }, []);

  useEffect(() => {
    refresh()
      .catch(() => setError('Gagal memuat pengaturan.'))
      .finally(() => setLoaded(true));
  }, [refresh]);

  async function run<T>(fn: () => Promise<T>, msg: string): Promise<boolean> {
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      await fn();
      await refresh();
      setNotice(msg);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menyimpan.');
      return false;
    } finally {
      setBusy(false);
    }
  }

  if (!loaded) {
    return (
      <Shell>
        <p className="text-sm text-sand-500">Memuat pengaturan…</p>
      </Shell>
    );
  }

  return (
    <Shell>
      {section ? (
        <Link href="/spmb/pengaturan" className="text-sm font-semibold text-primary-700 hover:text-primary-800">
          ← Pengaturan SPMB
        </Link>
      ) : null}
      <div className={section ? 'mt-2' : ''}>
      <PageTitle
        title={section ? SECTION_TITLES[section] : 'Pengaturan SPMB'}
        subtitle={section ? '' : 'Kelola biaya, gelombang, diskon prestasi, dan pertanyaan formulir'}
      />
      </div>
      {error ? (
        <p role="alert" className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{error}</p>
      ) : null}
      {notice ? (
        <p role="status" className="mb-4 rounded-xl bg-primary-50 px-4 py-3 text-sm font-medium text-primary-800">{notice}</p>
      ) : null}

      {!section ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {SECTIONS.map((s) => (
            <button
              key={s.key}
              type="button"
              onClick={() => setSection(s.key)}
              className="group flex items-center justify-between gap-3 rounded-2xl border border-sand-200 bg-white px-5 py-4 text-left shadow-card transition hover:border-primary-300 hover:shadow-lift"
            >
              <span>
                <span className="block text-sm font-bold text-sand-900 group-hover:text-primary-800">{s.title}</span>
                <span className="mt-0.5 block text-xs text-sand-500">{s.desc}</span>
              </span>
              <span className="text-lg text-sand-300 transition group-hover:translate-x-0.5 group-hover:text-primary-600">→</span>
            </button>
          ))}
        </div>
      ) : null}

      {section ? (
      <div className="grid gap-5 lg:grid-cols-2">
        {/* ---------- TEMPLATE SURAT PERNYATAAN ---------- */}
        {section === 'template' ? (
        <Widget title="Template Surat Pernyataan" className="lg:col-span-2">
          <p className="mb-4 text-sm leading-relaxed text-sand-600">
            Unggah template surat pernyataan (PDF/JPG/PNG, maks 5 MB). Orang tua
            dapat mengunduhnya dari halaman pendaftaran, mengisi &
            menandatanganinya, lalu mengunggah kembali sebagai dokumen
            persyaratan.
          </p>
          <input
            ref={templateRef}
            type="file"
            accept=".pdf,.jpg,.jpeg,.png"
            className="hidden"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (!file) return;
              await run(
                () => uploadSuratTemplate(file),
                'Template surat pernyataan diperbarui — file lama diganti.',
              );
            }}
          />
          <Button variant="outline" disabled={busy} onClick={async () => templateRef.current?.click()}>
            Unggah Template Baru
          </Button>
        </Widget>
        ) : null}

        {/* ---------- BIAYA ---------- */}
        {section === 'biaya' ? (
        <Widget
          title="Biaya Pendidikan"
          className="lg:col-span-2"
          action={<Button size="sm" onClick={() => { setError(null); setFeeModal(true); }}>+ Tambah</Button>}
        >
          <p className="mb-4 text-xs leading-relaxed text-sand-500">
            Tarif dasar tiap jenis biaya. Jenis <b>baku</b> (pendaftaran, DSP, SPP, seragam)
            dipakai penagihan otomatis — tidak bisa dihapus, cukup ubah nominalnya.
            Jenis tambahan bisa dihapus.
          </p>
          <div className="overflow-x-auto rounded-xl border border-sand-200">
            <table className="w-full text-sm">
              <thead className="bg-sand-50 text-left text-xs uppercase tracking-wider text-sand-500">
                <tr>
                  <th className="px-4 py-2.5">Jenis Biaya</th>
                  <th className="px-4 py-2.5">Nominal</th>
                  <th className="px-4 py-2.5 w-64">Ubah Nominal</th>
                  <th className="px-4 py-2.5 w-20"></th>
                </tr>
              </thead>
              <tbody>
                {fees.map((f) => (
                  <tr key={f.key} className="border-t border-sand-100">
                    <td className="px-4 py-3 font-bold text-sand-900">
                      {FEE_LABELS[f.key] ?? f.label}
                      {CORE_FEES.has(f.key) ? <span className="ml-2 text-[10px] font-semibold uppercase tracking-wider text-sand-400">baku</span> : null}
                    </td>
                    <td className="px-4 py-3 text-sand-700">{rupiah(f.amount)}</td>
                    <td className="px-4 py-3">
                      <form
                        className="flex items-center gap-2"
                        onSubmit={(e) => {
                          e.preventDefault();
                          const amount = Number(new FormData(e.currentTarget).get('amount'));
                          void run(() => updateFee(f.key, amount), `${FEE_LABELS[f.key] ?? f.label} diperbarui.`);
                        }}
                      >
                        <Input name="amount" type="number" min={0} required defaultValue={f.amount} />
                        <Button size="sm" type="submit" variant="outline" disabled={busy}>Simpan</Button>
                      </form>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {!CORE_FEES.has(f.key) ? (
                        <Button
                          size="sm"
                          variant="danger"
                          disabled={busy}
                          onClick={async () => {
                            if (await confirm(`Hapus biaya "${f.label}"?`)) {
                              void run(() => deleteFee(f.key), 'Biaya dihapus.');
                            }
                          }}
                        >
                          Hapus
                        </Button>
                      ) : null}
                    </td>
                  </tr>
                ))}
                {fees.length === 0 ? (
                  <tr><td colSpan={4} className="px-4 py-6 text-center text-sand-400">Belum ada jenis biaya — klik "+ Tambah" untuk mengisi tarif dasar.</td></tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </Widget>
        ) : null}

        {/* ---------- DISKON ---------- */}
        {section === 'diskon' ? (
        <Widget
          title="Diskon DSP Jalur Prestasi"
          className="lg:col-span-2"
          action={<Button size="sm" onClick={() => { setError(null); setDiscModal('new'); }}>+ Tambah</Button>}
        >
          <p className="mb-4 text-xs leading-relaxed text-sand-500">
            Tiap baris adalah <b>satu jenis prestasi</b> yang bisa dipilih orang tua saat mendaftar
            lewat jalur prestasi — diskon DSP-nya diterapkan otomatis. Tambah jenis sesuai
            kebutuhan (mis. Tahfidz 5 Juz, Juara 1 Olimpiade, Hafizh Qur&apos;an).
          </p>
          <div className="overflow-x-auto rounded-xl border border-sand-200">
            <table className="w-full text-sm">
              <thead className="bg-sand-50 text-left text-xs uppercase tracking-wider text-sand-500">
                <tr>
                  <th className="px-4 py-2.5">Jenis Prestasi</th>
                  <th className="px-4 py-2.5">Kelompok</th>
                  <th className="px-4 py-2.5">Diskon DSP</th>
                  <th className="px-4 py-2.5">Syarat</th>
                  <th className="px-4 py-2.5">Status</th>
                  <th className="px-4 py-2.5 w-36"></th>
                </tr>
              </thead>
              <tbody>
                {discounts.map((d) => (
                  <tr key={d.id} className="border-t border-sand-100">
                    <td className="px-4 py-3 font-bold text-sand-900">{d.label}</td>
                    <td className="px-4 py-3 text-sand-600">{CATEGORY_LABELS[d.category ?? 'non_akademik']}</td>
                    <td className="px-4 py-3 font-semibold text-primary-700">{d.percent}%</td>
                    <td className="px-4 py-3 text-sand-600">{d.minScore ? `nilai rapor ≥ ${d.minScore}` : '—'}</td>
                    <td className="px-4 py-3">
                      {d.isActive ? <Badge tone="primary">Aktif</Badge> : <Badge tone="neutral">Nonaktif</Badge>}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="flex justify-end gap-2">
                        <Button size="sm" variant="outline" onClick={() => { setError(null); setDiscModal(d); }}>Edit</Button>
                        <Button
                          size="sm"
                          variant="danger"
                          disabled={busy}
                          onClick={async () => {
                            if (await confirm(`Hapus jenis diskon "${d.label}"? Pendaftar lama tidak terpengaruh.`)) {
                              void run(() => deleteDiscount(d.subType), 'Jenis diskon dihapus.');
                            }
                          }}
                        >
                          Hapus
                        </Button>
                      </span>
                    </td>
                  </tr>
                ))}
                {discounts.length === 0 ? (
                  <tr><td colSpan={6} className="px-4 py-6 text-center text-sand-400">Belum ada jenis diskon — klik "+ Tambah".</td></tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </Widget>
        ) : null}

        {/* ---------- GELOMBANG ---------- */}
        {section === 'gelombang' ? (
        <Widget
          title="Gelombang Pendaftaran"
          className="lg:col-span-2"
          action={
            <Button size="sm" onClick={() => { setError(null); setWaveModal('new'); }}>
              + Tambah
            </Button>
          }
        >
          <div className="overflow-x-auto rounded-xl border border-sand-200">
            <table className="w-full text-sm">
              <thead className="bg-sand-50 text-left text-xs uppercase tracking-wider text-sand-500">
                <tr>
                  <th className="px-4 py-2.5">Gelombang</th>
                  <th className="px-4 py-2.5">Periode</th>
                  <th className="px-4 py-2.5">Psikotes</th>
                  <th className="px-4 py-2.5">Status</th>
                  <th className="px-4 py-2.5 w-72"></th>
                </tr>
              </thead>
              <tbody>
                {waves.map((w) => (
                  <tr key={w.id} className="border-t border-sand-100">
                    <td className="px-4 py-3 font-bold text-sand-900">{w.name}</td>
                    <td className="px-4 py-3 text-sand-600">
                      {new Date(w.startDate).toLocaleDateString('id-ID')} — {new Date(w.endDate).toLocaleDateString('id-ID')}
                    </td>
                    <td className="px-4 py-3 text-sand-600">
                      {w.psikotesAt
                        ? new Date(w.psikotesAt).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })
                        : <span className="text-sand-400">belum diatur — buka Detail</span>}
                    </td>
                    <td className="px-4 py-3">
                      {w.isActive ? <Badge tone="primary">Aktif</Badge> : <Badge tone="neutral">Nonaktif</Badge>}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="flex justify-end gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={async () => {
                            setError(null);
                            setFeeWave(w);
                            setWaveFees([]);
                            void listWaveFees(w.id)
                              .then(setWaveFees)
                              .catch((e) => setError(e instanceof Error ? e.message : 'Gagal memuat biaya gelombang.'));
                          }}
                        >
                          Detail
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => { setError(null); setWaveModal(w); }}>
                          Edit
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={busy}
                          onClick={async () =>
                            run(
                              () =>
                                saveWave(
                                  {
                                    name: w.name,
                                    startDate: w.startDate.slice(0, 10),
                                    endDate: w.endDate.slice(0, 10),
                                    isActive: !w.isActive,
                                  },
                                  w.id,
                                ),
                              w.isActive ? 'Gelombang dinonaktifkan.' : 'Gelombang diaktifkan.',
                            )
                          }
                        >
                          {w.isActive ? 'Nonaktifkan' : 'Aktifkan'}
                        </Button>
                        <Button
                          size="sm"
                          variant="danger"
                          disabled={busy}
                          onClick={async () => {
                            if (await confirm(`Hapus ${w.name}? Pendaftar di dalamnya tidak ikut terhapus.`)) {
                              void run(() => deleteWave(w.id), 'Gelombang dihapus.');
                            }
                          }}
                        >
                          Hapus
                        </Button>
                      </span>
                    </td>
                  </tr>
                ))}
                {waves.length === 0 ? (
                  <tr><td colSpan={5} className="px-4 py-6 text-center text-sand-400">Belum ada gelombang — klik "+ Tambah".</td></tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </Widget>
        ) : null}

        {/* ---------- PERTANYAAN ---------- */}
        {section === 'pertanyaan' ? (
        <Widget
          title="Pertanyaan Formulir"
          className="lg:col-span-2"
          action={
            <Button size="sm" onClick={() => { setError(null); setQType('text'); setOptList([]); setQuestionModal('new'); }}>
              + Tambah
            </Button>
          }
        >
          <p className="mb-4 text-xs leading-relaxed text-sand-500">
            Pertanyaan ini tampil pada formulir pendaftaran setelah pembayaran diverifikasi.
          </p>
          <ul className="mb-4 space-y-2.5">
            {questions.map((q) => (
              <li key={q.id} className="flex items-center justify-between gap-2 rounded-xl border border-sand-200 bg-sand-50 px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-sand-900">
                    {q.order}. {q.label}
                    {q.required ? <span className="text-red-500"> *</span> : null}
                  </p>
                  <p className="text-xs text-sand-500">
                    {FIELD_TYPES.find((t) => t.key === q.fieldType)?.label ?? q.fieldType}
                    {q.options?.length ? ` · ${q.options.join(', ')}` : ''}
                  </p>
                </div>
                <span className="flex shrink-0 gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setError(null);
                      setQType(q.fieldType);
                      setOptList(q.options ?? []);
                      setQuestionModal(q);
                    }}
                  >
                    Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="danger"
                    disabled={busy}
                    onClick={async () => {
                      if (await confirm(`Hapus pertanyaan "${q.label}"?`)) {
                        void run(() => deleteQuestion(q.id), 'Pertanyaan dihapus.');
                      }
                    }}
                  >
                    Hapus
                  </Button>
                </span>
              </li>
            ))}
            {questions.length === 0 ? (
              <p className="text-sm text-sand-500">Belum ada pertanyaan tambahan.</p>
            ) : null}
          </ul>
        </Widget>
        ) : null}
      </div>
      ) : null}

      <Modal
        open={!!waveModal}
        onClose={() => setWaveModal(null)}
        title={waveModal === 'new' ? 'Tambah Gelombang' : `Edit ${(waveModal as WaveDto)?.name ?? 'Gelombang'}`}
      >
        <form
          key={waveModal === 'new' ? 'new' : (waveModal as WaveDto)?.id}
          className="grid gap-3 sm:grid-cols-2 sm:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            const editing = waveModal === 'new' ? undefined : (waveModal as WaveDto);
            void run(
              () =>
                saveWave(
                  {
                    name: String(f.get('name')),
                    startDate: String(f.get('startAt')),
                    endDate: String(f.get('endAt')),
                    ...(editing ? { isActive: editing.isActive } : {}),
                  },
                  editing?.id,
                ),
              editing ? 'Gelombang diperbarui.' : 'Gelombang ditambahkan.',
            ).then((ok) => {
              if (ok) setWaveModal(null);
            });
          }}
        >
          {error ? (
            <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700 sm:col-span-2">{error}</p>
          ) : null}
          <Field label="Nama Gelombang"><Input name="name" required placeholder="Gelombang 2" defaultValue={waveModal === 'new' ? '' : (waveModal as WaveDto)?.name} /></Field>
          <Field label="Mulai"><Input name="startAt" type="date" required defaultValue={waveModal === 'new' ? '' : (waveModal as WaveDto)?.startDate.slice(0, 10)} /></Field>
          <Field label="Selesai"><Input name="endAt" type="date" required defaultValue={waveModal === 'new' ? '' : (waveModal as WaveDto)?.endDate.slice(0, 10)} /></Field>
          <Button type="submit" disabled={busy} className="sm:col-span-2">
            {busy ? 'Menyimpan…' : waveModal === 'new' ? 'Tambah Gelombang' : 'Simpan Perubahan'}
          </Button>
        </form>
      </Modal>

      <Modal
        open={!!questionModal}
        onClose={() => setQuestionModal(null)}
        title={questionModal === 'new' ? 'Tambah Pertanyaan Formulir' : 'Edit Pertanyaan Formulir'}
        size="xl"
      >
        <form
          key={questionModal === 'new' ? 'new' : questionModal?.id}
          className="grid gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            const editing = questionModal === 'new' ? undefined : questionModal;
            const options = optList.map((s) => s.trim()).filter(Boolean);
            void run(
              () =>
                saveQuestion(
                  {
                    label: String(f.get('label')),
                    fieldType: qType,
                    required: f.get('required') === 'on',
                    order: editing?.order ?? questions.length + 1,
                    options: qType === 'select' ? options : [],
                  },
                  editing?.id,
                ),
              editing ? 'Pertanyaan diperbarui.' : 'Pertanyaan ditambahkan.',
            ).then((ok) => {
              if (ok) setQuestionModal(null);
            });
          }}
        >
          {error ? (
            <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{error}</p>
          ) : null}
          <Field label="Pertanyaan" hint="Teks yang dilihat orang tua pada formulir pendaftaran.">
            <Textarea name="label" required rows={2} placeholder="Mis. Nilai rapor semester 5" defaultValue={questionModal === 'new' ? '' : questionModal?.label} />
          </Field>
          <Field
            label="Tipe Jawaban"
            hint={FIELD_TYPES.find((t) => t.key === qType)?.desc}
          >
            <Select name="fieldType" value={qType} onChange={(e) => setQType(e.target.value)}>
              {FIELD_TYPES.map((t) => (
                <option key={t.key} value={t.key}>{t.label}</option>
              ))}
            </Select>
          </Field>
          {qType === 'select' ? (
            <div className="rounded-xl border border-sand-200 bg-sand-50 p-3">
              <p className="mb-2 text-xs font-bold uppercase tracking-wider text-sand-500">
                Daftar Pilihan — satu baris satu pilihan jawaban
              </p>
              <div className="space-y-2">
                {optList.map((opt, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <Input
                      value={opt}
                      placeholder={`Pilihan ${i + 1}`}
                      onChange={(e) =>
                        setOptList((l) => l.map((x, j) => (j === i ? e.target.value : x)))
                      }
                    />
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => setOptList((l) => l.filter((_, j) => j !== i))}
                    >
                      ✕
                    </Button>
                  </div>
                ))}
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="mt-2"
                onClick={() => setOptList((l) => [...l, ''])}
              >
                + Tambah Pilihan
              </Button>
              {optList.filter((s) => s.trim()).length === 0 ? (
                <p className="mt-2 text-xs text-amber-700">Isi minimal 1 pilihan — ortu akan memilih salah satunya.</p>
              ) : null}
            </div>
          ) : null}
          <label className="flex items-center gap-2 text-xs font-semibold text-sand-600">
            <input
              type="checkbox"
              name="required"
              className="accent-primary-700"
              defaultChecked={questionModal !== 'new' && questionModal?.required}
            />
            Wajib diisi
          </label>
          <Button type="submit" disabled={busy}>
            {busy ? 'Menyimpan…' : questionModal === 'new' ? 'Tambah Pertanyaan' : 'Simpan Perubahan'}
          </Button>
        </form>
      </Modal>

      <Modal open={!!feeWave} title={`Detail ${feeWave?.name ?? ''}`} onClose={() => setFeeWave(null)} size="xl">
        {error ? (
          <p role="alert" className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{error}</p>
        ) : null}

        {/* ---- Info gelombang ---- */}
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-sand-200 bg-sand-50 px-4 py-3">
          <div>
            <p className="text-sm font-bold text-sand-900">
              {feeWave?.name}
              {feeWave?.isActive ? <Badge tone="primary" className="ml-2">Aktif</Badge> : <Badge tone="neutral" className="ml-2">Nonaktif</Badge>}
            </p>
            <p className="text-xs text-sand-500">
              {feeWave ? `${new Date(feeWave.startDate).toLocaleDateString('id-ID')} — ${new Date(feeWave.endDate).toLocaleDateString('id-ID')}` : ''}
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => { const w = feeWave; setFeeWave(null); setWaveModal(w); }}
          >
            Edit Nama/Periode
          </Button>
        </div>

        {/* ---- Jadwal psikotes ---- */}
        <form
          className="mb-5 space-y-3 rounded-xl border border-sand-200 p-4"
          onSubmit={async (e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            const at = String(fd.get('psikotesAt') ?? '').trim();
            const note = String(fd.get('psikotesNote') ?? '').trim();
            const ok = await run(
              () =>
                saveWave(
                  {
                    name: feeWave!.name,
                    startDate: feeWave!.startDate.slice(0, 10),
                    endDate: feeWave!.endDate.slice(0, 10),
                    isActive: feeWave!.isActive,
                    psikotesAt: at ? new Date(at).toISOString() : '',
                    psikotesNote: note,
                  },
                  feeWave!.id,
                ),
              'Jadwal psikotes tersimpan.',
            );
            if (ok) {
              const w = await listAdminWaves().catch(() => null);
              if (w) {
                setWaves(w);
                const upd = w.find((x) => x.id === feeWave!.id);
                if (upd) setFeeWave(upd);
              }
            }
          }}
        >
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-sand-500">
              Jadwal Psikotes Gelombang Ini
            </p>
            <p className="mt-0.5 text-xs leading-relaxed text-sand-500">
              Atur tanggal &amp; tempat tes psikologi pendaftar gelombang ini — orang tua
              menerima instruksi kehadiran lewat WhatsApp. Kosongkan bila belum ditentukan.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 sm:items-end">
            <Field label="Tanggal & waktu">
              <Input
                name="psikotesAt"
                type="datetime-local"
                defaultValue={
                  feeWave?.psikotesAt
                    ? new Date(feeWave.psikotesAt).toISOString().slice(0, 16)
                    : ''
                }
              />
            </Field>
            <Field label="Keterangan untuk orang tua">
              <Input
                name="psikotesNote"
                placeholder="Mis. hadir 08.00 di aula, bawa alat tulis"
                defaultValue={feeWave?.psikotesNote ?? ''}
              />
            </Field>
          </div>
          <Button type="submit" size="sm" variant="outline" disabled={busy}>
            {busy ? 'Menyimpan…' : 'Simpan Jadwal Psikotes'}
          </Button>
        </form>

        {/* ---- Tarif khusus gelombang ---- */}
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-sand-500">
            Tarif Khusus Gelombang Ini
          </p>
          <p className="mt-0.5 mb-3 text-xs leading-relaxed text-sand-500">
            Opsional — isi nominal untuk memberi harga berbeda pada gelombang ini saja
            (mis. promo gelombang 1). Kosongkan = pakai tarif dasar dari Biaya Pendidikan.
          </p>
          {waveFees.length === 0 ? (
            <p className="text-sm text-sand-400">Memuat…</p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-sand-200">
              <table className="w-full text-sm">
                <thead className="bg-sand-50 text-left text-xs uppercase tracking-wider text-sand-500">
                  <tr>
                    <th className="px-4 py-2.5">Jenis Biaya</th>
                    <th className="px-4 py-2.5">Tarif Dasar</th>
                    <th className="px-4 py-2.5 w-56">Tarif Gelombang Ini</th>
                  </tr>
                </thead>
                <tbody>
                  {waveFees.map((f) => (
                    <tr key={f.key} className="border-t border-sand-100">
                      <td className="px-4 py-3 font-semibold text-sand-900">
                        {f.label}
                        {f.overridden ? <span className="ml-2 text-[10px] font-bold uppercase tracking-wider text-primary-600">khusus</span> : null}
                      </td>
                      <td className="px-4 py-3 text-sand-500">{rupiah(f.global)}</td>
                      <td className="px-4 py-3">
                        <form
                          className="flex items-center gap-2"
                          onSubmit={async (e) => {
                            e.preventDefault();
                            const fd = new FormData(e.currentTarget);
                            const raw = String(fd.get('amount') ?? '').trim();
                            const ok = raw
                              ? await run(() => saveWaveFee(feeWave!.id, f.key, parseInt(raw, 10)), `${f.label}: ${rupiah(parseInt(raw, 10))} tersimpan.`)
                              : await run(() => deleteWaveFee(feeWave!.id, f.key), `${f.label}: kembali ke tarif dasar.`);
                            if (ok) {
                              const rows = await listWaveFees(feeWave!.id).catch(() => waveFees);
                              setWaveFees(rows);
                            }
                          }}
                        >
                          <Input
                            name="amount"
                            type="number"
                            min={0}
                            defaultValue={f.overridden ? f.amount : ''}
                            placeholder="kosong = tarif dasar"
                          />
                          <Button type="submit" size="sm" variant="outline" disabled={busy}>
                            Simpan
                          </Button>
                        </form>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Modal>
      {/* ---- Modal tambah jenis biaya ---- */}
      <Modal open={feeModal} onClose={() => setFeeModal(false)} title="Tambah Jenis Biaya">
        <form
          className="grid gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            void run(
              () =>
                createFee({
                  label: String(f.get('label')),
                  amount: Number(f.get('amount')),
                }),
              'Jenis biaya ditambahkan.',
            ).then((ok) => {
              if (ok) setFeeModal(false);
            });
          }}
        >
          {error ? (
            <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{error}</p>
          ) : null}
          <Field label="Nama biaya" hint='Mis. "Buku Paket", "Kegiatan Tahunan", "Uang Pangkal".'>
            <Input name="label" required />
          </Field>
          <Field label="Nominal (Rp)">
            <Input name="amount" type="number" min={0} required placeholder="0" />
          </Field>
          <Button type="submit" disabled={busy}>{busy ? 'Menyimpan…' : 'Tambah Biaya'}</Button>
        </form>
      </Modal>

      {/* ---- Modal tambah/edit jenis diskon ---- */}
      <Modal
        open={!!discModal}
        onClose={() => setDiscModal(null)}
        title={discModal === 'new' ? 'Tambah Jenis Diskon' : `Edit ${(discModal as DiscountRuleDto)?.label ?? ''}`}
      >
        <form
          key={discModal === 'new' ? 'new' : (discModal as DiscountRuleDto)?.id}
          className="grid gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            const editing = discModal === 'new' ? undefined : (discModal as DiscountRuleDto);
            const key = editing?.subType ?? String(f.get('label'));
            void run(
              () =>
                saveDiscount(key, {
                  label: String(f.get('label')),
                  category: String(f.get('category')),
                  percent: Number(f.get('percent')),
                  ...(f.get('minScore') ? { minScore: Number(f.get('minScore')) } : {}),
                  isActive: f.get('isActive') === 'on',
                }),
              editing ? 'Jenis diskon diperbarui.' : 'Jenis diskon ditambahkan.',
            ).then((ok) => {
              if (ok) setDiscModal(null);
            });
          }}
        >
          {error ? (
            <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{error}</p>
          ) : null}
          <Field label="Nama jenis prestasi" hint='Mis. "Tahfidz 5 Juz", "Juara 1-3 Olimpiade", "Nilai Rapor ≥ 85".'>
            <Input name="label" required defaultValue={discModal === 'new' ? '' : (discModal as DiscountRuleDto)?.label} />
          </Field>
          <Field label="Kelompok jalur" hint="Di formulir ortu, jenis ini tampil di bawah kelompok yang dipilih.">
            <Select name="category" defaultValue={(discModal as DiscountRuleDto)?.category ?? 'non_akademik'}>
              {DISCOUNT_CATEGORIES.map((c) => (
                <option key={c.key} value={c.key}>{c.label}</option>
              ))}
            </Select>
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Diskon DSP (%)">
              <Input name="percent" type="number" min={0} max={100} required defaultValue={(discModal as DiscountRuleDto)?.percent ?? 0} />
            </Field>
            <Field label="Min. nilai rapor" hint="Opsional — syarat khusus, mis. akademik.">
              <Input name="minScore" type="number" min={0} max={100} defaultValue={(discModal as DiscountRuleDto)?.minScore ?? ''} placeholder="80" />
            </Field>
          </div>
          <label className="flex items-center gap-2 text-xs font-semibold text-sand-600">
            <input
              type="checkbox"
              name="isActive"
              className="accent-primary-700"
              defaultChecked={(discModal as DiscountRuleDto)?.isActive ?? true}
            />
            Aktif — tampil sebagai pilihan di formulir pendaftaran
          </label>
          <Button type="submit" disabled={busy}>
            {busy ? 'Menyimpan…' : discModal === 'new' ? 'Tambah Jenis Diskon' : 'Simpan Perubahan'}
          </Button>
        </form>
      </Modal>
          {dialog}
      </Shell>
  );
}
