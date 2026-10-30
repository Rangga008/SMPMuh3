'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { DiscountRuleDto, FeeDto, FormQuestionDto, WaveDto } from '@smpmuh3/types';
import { Badge, Button, Field, Input, Modal, Select, Textarea } from '@smpmuh3/ui';
import { Shell } from '@/components/shell';
import { PageTitle, Widget } from '@/components/widgets';
import {
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

const SUBTYPES = [
  'tahfidz_2',
  'tahfidz_3plus',
  'non_akademik',
  'akademik',
  'alumni_sdm',
] as const;
const SUBTYPE_LABELS: Record<string, string> = {
  tahfidz_2: 'Tahfidz 2 juz',
  tahfidz_3plus: 'Tahfidz 3+ juz',
  non_akademik: 'Prestasi non-akademik',
  akademik: 'Prestasi akademik',
  alumni_sdm: 'Alumni SD Muhammadiyah Kota Bandung',
};

export default function SpmbSettingsPage() {
  const [fees, setFees] = useState<FeeDto[]>([]);
  const [waves, setWaves] = useState<WaveDto[]>([]);
  const [questions, setQuestions] = useState<FormQuestionDto[]>([]);
  const [discounts, setDiscounts] = useState<DiscountRuleDto[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showWaveForm, setShowWaveForm] = useState(false);
  const [showQuestionForm, setShowQuestionForm] = useState(false);
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
      <PageTitle
        title="Pengaturan SPMB"
        subtitle="Kelola biaya, gelombang, diskon prestasi, dan pertanyaan formulir"
      />
      {error ? (
        <p role="alert" className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{error}</p>
      ) : null}
      {notice ? (
        <p role="status" className="mb-4 rounded-xl bg-primary-50 px-4 py-3 text-sm font-medium text-primary-800">{notice}</p>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-2">
        {/* ---------- TEMPLATE SURAT PERNYATAAN ---------- */}
        <Widget title="Template Surat Pernyataan">
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
          <Button variant="outline" disabled={busy} onClick={() => templateRef.current?.click()}>
            Unggah Template Baru
          </Button>
        </Widget>

        {/* ---------- BIAYA ---------- */}
        <Widget title="Biaya Pendidikan">
          <ul className="space-y-3">
            {fees.map((f) => (
              <li key={f.key} className="rounded-xl border border-sand-200 bg-sand-50 px-4 py-3">
                <form
                  className="flex flex-wrap items-end gap-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const amount = Number(new FormData(e.currentTarget).get('amount'));
                    void run(() => updateFee(f.key, amount), `${FEE_LABELS[f.key] ?? f.key} diperbarui.`);
                  }}
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-sand-900">{FEE_LABELS[f.key] ?? f.label}</p>
                    <p className="text-xs text-sand-500">Saat ini {rupiah(f.amount)}</p>
                  </div>
                  <Field label="Nominal baru" className="w-40">
                    <Input name="amount" type="number" min={0} required defaultValue={f.amount} />
                  </Field>
                  <Button size="sm" type="submit" variant="outline" disabled={busy}>Simpan</Button>
                </form>
              </li>
            ))}
          </ul>
        </Widget>

        {/* ---------- DISKON ---------- */}
        <Widget title="Diskon DSP Jalur Prestasi">
          <ul className="space-y-3">
            {SUBTYPES.map((st) => {
              const rule = discounts.find((d) => d.subType === st);
              return (
                <li key={st} className="rounded-xl border border-sand-200 bg-sand-50 px-4 py-3">
                  <form
                    className="flex flex-wrap items-end gap-3"
                    onSubmit={(e) => {
                      e.preventDefault();
                      const f = new FormData(e.currentTarget);
                      void run(
                        () =>
                          saveDiscount(st, {
                            percent: Number(f.get('percent')),
                            ...(st === 'akademik' && f.get('minScore')
                              ? { minScore: Number(f.get('minScore')) }
                              : {}),
                            isActive: f.get('isActive') === 'on',
                          }),
                        `Diskon ${SUBTYPE_LABELS[st]} disimpan.`,
                      );
                    }}
                  >
                    <div className="w-full min-w-0 flex-1">
                      <p className="text-sm font-bold text-sand-900">{SUBTYPE_LABELS[st]}</p>
                      <p className="text-xs text-sand-500">
                        {rule?.isActive ? `Aktif — ${rule.percent}%` : 'Nonaktif'}
                        {rule?.minScore ? ` · nilai rapor ≥ ${rule.minScore}` : ''}
                      </p>
                    </div>
                    <Field label="Diskon %" className="w-24">
                      <Input name="percent" type="number" min={0} max={100} required defaultValue={rule?.percent ?? 0} />
                    </Field>
                    {st === 'akademik' ? (
                      <Field label="Min. nilai rapor" className="w-28">
                        <Input name="minScore" type="number" min={0} max={100} defaultValue={rule?.minScore ?? ''} placeholder="80" />
                      </Field>
                    ) : null}
                    <Field label="Aktif" className="w-16">
                      <input name="isActive" type="checkbox" defaultChecked={rule?.isActive ?? true} className="size-5 accent-primary-700" />
                    </Field>
                    <Button size="sm" type="submit" variant="outline" disabled={busy}>Simpan</Button>
                  </form>
                </li>
              );
            })}
          </ul>
        </Widget>

        {/* ---------- GELOMBANG ---------- */}
        <Widget
          title="Gelombang Pendaftaran"
          action={
            <Button size="sm" onClick={() => setShowWaveForm(true)}>
              + Tambah
            </Button>
          }
        >
          <ul className="space-y-2.5">
            {waves.map((w) => (
              <li key={w.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-sand-200 bg-sand-50 px-4 py-3">
                <div>
                  <p className="text-sm font-bold text-sand-900">
                    {w.name}
                    {w.isActive ? <Badge tone="primary" className="ml-2">Aktif</Badge> : null}
                  </p>
                  <p className="text-xs text-sand-500">
                    {new Date(w.startDate).toLocaleDateString('id-ID')} — {new Date(w.endDate).toLocaleDateString('id-ID')}
                  </p>
                </div>
                <span className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setFeeWave(w);
                      setWaveFees([]);
                      void listWaveFees(w.id)
                        .then(setWaveFees)
                        .catch(() => setError('Gagal memuat biaya gelombang.'));
                    }}
                  >
                    Detail
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busy}
                    onClick={() =>
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
                    onClick={() => {
                      if (window.confirm(`Hapus ${w.name}?`)) {
                        void run(() => deleteWave(w.id), 'Gelombang dihapus.');
                      }
                    }}
                  >
                    Hapus
                  </Button>
                </span>
              </li>
            ))}
            {waves.length === 0 ? (
              <p className="text-sm text-sand-500">Belum ada gelombang.</p>
            ) : null}
          </ul>
        </Widget>

        {/* ---------- PERTANYAAN ---------- */}
        <Widget
          title="Pertanyaan Formulir"
          action={
            <Button size="sm" onClick={() => setShowQuestionForm(true)}>
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
                    {q.fieldType}{q.options?.length ? ` · ${q.options.join(', ')}` : ''}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="danger"
                  disabled={busy}
                  onClick={() => {
                    if (window.confirm(`Hapus pertanyaan "${q.label}"?`)) {
                      void run(() => deleteQuestion(q.id), 'Pertanyaan dihapus.');
                    }
                  }}
                >
                  Hapus
                </Button>
              </li>
            ))}
            {questions.length === 0 ? (
              <p className="text-sm text-sand-500">Belum ada pertanyaan tambahan.</p>
            ) : null}
          </ul>
        </Widget>
      </div>

      <Modal
        open={showWaveForm}
        onClose={() => setShowWaveForm(false)}
        title="Tambah Gelombang"
      >
        <form
          className="grid gap-3 sm:grid-cols-2 sm:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            void run(
              () =>
                saveWave({
                  name: String(f.get('name')),
                  startDate: String(f.get('startAt')),
                  endDate: String(f.get('endAt')),
                }),
              'Gelombang ditambahkan.',
            ).then((ok) => {
              if (ok) setShowWaveForm(false);
            });
            e.currentTarget.reset();
          }}
        >
          <Field label="Nama Gelombang"><Input name="name" required placeholder="Gelombang 2" /></Field>
          <Field label="Mulai"><Input name="startAt" type="date" required /></Field>
          <Field label="Selesai"><Input name="endAt" type="date" required /></Field>
          <Button type="submit" disabled={busy} className="sm:col-span-2">Tambah Gelombang</Button>
        </form>
      </Modal>

      <Modal
        open={showQuestionForm}
        onClose={() => setShowQuestionForm(false)}
        title="Tambah Pertanyaan Formulir"
        size="xl"
      >
        <form
          className="grid gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            const opts = String(f.get('options') ?? '').trim();
            void run(
              () =>
                saveQuestion({
                  label: String(f.get('label')),
                  fieldType: String(f.get('fieldType')),
                  required: f.get('required') === 'on',
                  order: questions.length + 1,
                  ...(opts ? { options: opts.split(',').map((s) => s.trim()).filter(Boolean) } : {}),
                }),
              'Pertanyaan ditambahkan.',
            ).then((ok) => {
              if (ok) setShowQuestionForm(false);
            });
            e.currentTarget.reset();
          }}
        >
          <Field label="Pertanyaan"><Textarea name="label" required rows={2} placeholder="Mis. Nilai rapor semester 5" /></Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Tipe">
              <Select name="fieldType" defaultValue="text">
                <option value="text">Teks singkat</option>
                <option value="textarea">Teks panjang</option>
                <option value="number">Angka</option>
                <option value="date">Tanggal</option>
                <option value="select">Pilihan</option>
              </Select>
            </Field>
            <Field label="Pilihan (tipe Pilihan, pisahkan koma)">
              <Input name="options" placeholder="A,B,C" />
            </Field>
          </div>
          <label className="flex items-center gap-2 text-xs font-semibold text-sand-600">
            <input type="checkbox" name="required" className="accent-primary-700" /> Wajib diisi
          </label>
          <Button type="submit" disabled={busy}>Tambah Pertanyaan</Button>
        </form>
      </Modal>

      <Modal open={!!feeWave} title={`Detail ${feeWave?.name ?? ''}`} onClose={() => setFeeWave(null)}>
        <form
          className="mb-5 space-y-3 rounded-2xl border border-sand-200 p-3"
          onSubmit={async (e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            const at = String(fd.get('psikotesAt') ?? '').trim();
            const note = String(fd.get('psikotesNote') ?? '').trim();
            await run(
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
            const w = await listAdminWaves().catch(() => null);
            if (w) {
              setWaves(w);
              const upd = w.find((x) => x.id === feeWave!.id);
              if (upd) setFeeWave(upd);
            }
          }}
        >
          <p className="text-xs font-bold uppercase tracking-wider text-sand-500">
            Jadwal Psikotes Gelombang Ini
          </p>
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
          <Field label="Keterangan">
            <Input
              name="psikotesNote"
              placeholder="Mis. hadir 08.00 di aula, bawa alat tulis"
              defaultValue={feeWave?.psikotesNote ?? ''}
            />
          </Field>
          <Button type="submit" size="sm" variant="outline" disabled={busy}>
            Simpan Jadwal
          </Button>
        </form>
        <p className="mb-4 text-xs text-sand-500">
          Kosongkan nominal untuk memakai tarif dasar (Biaya Pendidikan). Tarif di sini berlaku hanya untuk gelombang ini.
        </p>
        {waveFees.length === 0 ? (
          <p className="text-sm text-sand-400">Memuat…</p>
        ) : (
          <div className="space-y-3">
            {waveFees.map((f) => (
              <form
                key={f.key}
                className="flex items-end gap-2 rounded-2xl border border-sand-200 p-3"
                onSubmit={async (e) => {
                  e.preventDefault();
                  const fd = new FormData(e.currentTarget);
                  const raw = String(fd.get('amount') ?? '').trim();
                  if (!raw) {
                    await run(() => deleteWaveFee(feeWave!.id, f.key), `${f.label}: kembali ke tarif dasar.`);
                  } else {
                    await run(() => saveWaveFee(feeWave!.id, f.key, parseInt(raw, 10)), `${f.label}: ${rupiah(parseInt(raw, 10))} tersimpan.`);
                  }
                  const rows = await listWaveFees(feeWave!.id).catch(() => waveFees);
                  setWaveFees(rows);
                }}
              >
                <Field label={`${f.label}${f.overridden ? ' · khusus gelombang' : ''}`} className="flex-1">
                  <Input
                    name="amount"
                    type="number"
                    min={0}
                    defaultValue={f.overridden ? f.amount : ''}
                    placeholder={`${rupiah(f.global)} (dasar)`}
                  />
                </Field>
                <Button type="submit" size="sm" variant="outline" disabled={busy}>
                  Simpan
                </Button>
              </form>
            ))}
          </div>
        )}
      </Modal>
    </Shell>
  );
}
