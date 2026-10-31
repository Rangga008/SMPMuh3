'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Button, Field, Input, Modal } from '@smpmuh3/ui';
import { Shell } from '@/components/shell';
import { DataTable } from '@/components/data-table';
import { PageTitle } from '@/components/widgets';
import {
  createLetter,
  deleteLetter,
  downloadLetterFile,
  listLetters,
  updateLetter,
  uploadLetterFile,
  type Letter,
} from '@/lib/api';

const DIRS = [
  { key: 'IN', label: 'Surat Masuk' },
  { key: 'OUT', label: 'Surat Keluar' },
] as const;

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });

export default function SuratPage() {
  const [dir, setDir] = useState<'IN' | 'OUT'>('IN');
  const [search, setSearch] = useState('');
  const [rows, setRows] = useState<Letter[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [modal, setModal] = useState<Letter | 'new' | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileTarget, setFileTarget] = useState<Letter | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await listLetters(dir, search || undefined));
      setError(null);
    } catch {
      setError('Gagal memuat agenda surat.');
    } finally {
      setLoading(false);
    }
  }, [dir, search]);

  // Filter realtime — debounce 300ms untuk semua perubahan.
  useEffect(() => {
    const t = setTimeout(() => void load(), 300);
    return () => clearTimeout(t);
  }, [load]);

  async function run(fn: () => Promise<unknown>, ok: string) {
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      await fn();
      setModal(null);
      setNotice(ok);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Aksi gagal.');
    } finally {
      setBusy(false);
    }
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const val = (k: string) => String(f.get(k) ?? '').trim() || undefined;
    const dto = {
      number: val('number'),
      date: val('date'),
      subject: val('subject'),
      party: val('party') ?? null,
      description: val('description') ?? null,
    };
    if (modal === 'new') {
      await run(() => createLetter({ ...dto, direction: dir }), 'Surat dicatat.');
    } else if (modal) {
      await run(() => updateLetter(modal.id, dto), 'Surat diperbarui.');
    }
  }

  return (
    <Shell>
      <PageTitle
        title="Surat Menyurat"
        subtitle="Agenda surat masuk dan keluar Tata Usaha"
        actions={
          <Button size="sm" onClick={() => setModal('new')}>
            + Catat Surat
          </Button>
        }
      />
      {error ? (
        <p role="alert" className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{error}</p>
      ) : null}
      {notice ? (
        <p role="status" className="mb-4 rounded-xl bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">{notice}</p>
      ) : null}

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex rounded-xl border border-sand-200 bg-white p-1 shadow-sm">
          {DIRS.map((d) => (
            <button
              key={d.key}
              type="button"
              onClick={() => setDir(d.key)}
              className={`rounded-lg px-4 py-1.5 text-sm font-semibold transition-colors ${
                dir === d.key ? 'bg-primary-700 text-white' : 'text-sand-600 hover:bg-sand-100'
              }`}
            >
              {d.label}
            </button>
          ))}
        </div>
        <Input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Cari nomor / perihal / pihak…"
          className="w-64 max-w-full"
        />
      </div>

      <DataTable
        head={['No. Surat', 'Tanggal', 'Perihal', dir === 'IN' ? 'Pengirim' : 'Tujuan', 'Lampiran', '']}
        loading={loading}
        error={error}
        empty={rows.length === 0 ? 'Belum ada surat.' : undefined}
      >
        {rows.map((l) => (
          <tr key={l.id}>
            <td className="px-5 py-3 font-mono text-xs font-bold text-primary-800">{l.number}</td>
            <td className="whitespace-nowrap px-5 py-3 text-sand-600">{fmtDate(l.date)}</td>
            <td className="px-5 py-3 font-semibold text-sand-900">{l.subject}</td>
            <td className="px-5 py-3 text-sand-600">{l.party ?? '—'}</td>
            <td className="px-5 py-3">
              {l.fileName ? (
                <button
                  type="button"
                  className="text-xs font-semibold text-primary-700 hover:underline"
                  onClick={async () => {
                    try {
                      const blob = await downloadLetterFile(l.id);
                      const url = URL.createObjectURL(blob);
                      window.open(url, '_blank');
                    } catch {
                      setError('Gagal membuka lampiran.');
                    }
                  }}
                >
                  📎 {l.fileName}
                </button>
              ) : (
                <button
                  type="button"
                  className="text-xs font-semibold text-sand-500 hover:text-primary-700"
                  onClick={() => {
                    setFileTarget(l);
                    fileRef.current?.click();
                  }}
                >
                  + Lampirkan
                </button>
              )}
            </td>
            <td className="px-5 py-3 text-right">
              <span className="flex justify-end gap-2">
                <button
                  type="button"
                  className="text-xs font-semibold text-primary-700 hover:underline"
                  onClick={() => setModal(l)}
                >
                  Ubah
                </button>
                {l.fileName ? (
                  <button
                    type="button"
                    className="text-xs font-semibold text-sand-500 hover:text-primary-700"
                    onClick={() => {
                      setFileTarget(l);
                      fileRef.current?.click();
                    }}
                  >
                    Ganti File
                  </button>
                ) : null}
                <button
                  type="button"
                  className="text-xs font-semibold text-red-600 hover:underline"
                  onClick={() => {
                    if (confirm(`Hapus surat "${l.number}"?`)) {
                      void run(() => deleteLetter(l.id), 'Surat dihapus.');
                    }
                  }}
                >
                  Hapus
                </button>
              </span>
            </td>
          </tr>
        ))}
      </DataTable>

      <input
        ref={fileRef}
        type="file"
        accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx"
        className="hidden"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (!file || !fileTarget) return;
          await run(() => uploadLetterFile(fileTarget.id, file), 'Lampiran diunggah.');
          setFileTarget(null);
        }}
      />

      <Modal
        open={modal !== null}
        onClose={() => setModal(null)}
        title={modal === 'new' ? `Catat ${dir === 'IN' ? 'Surat Masuk' : 'Surat Keluar'}` : 'Ubah Surat'}
      >
        <form className="grid gap-4 sm:grid-cols-2" onSubmit={onSubmit}>
          <Field label="Nomor Surat">
            <Input name="number" required defaultValue={modal !== 'new' ? modal?.number : ''} placeholder="001/TU/X/2026" />
          </Field>
          <Field label="Tanggal">
            <Input
              name="date"
              type="date"
              required
              defaultValue={
                modal !== 'new' && modal?.date ? modal.date.slice(0, 10) : new Date().toISOString().slice(0, 10)
              }
            />
          </Field>
          <Field label="Perihal" className="sm:col-span-2">
            <Input name="subject" required minLength={3} defaultValue={modal !== 'new' ? modal?.subject : ''} />
          </Field>
          <Field label={dir === 'IN' ? 'Pengirim' : 'Tujuan'} className="sm:col-span-2">
            <Input name="party" defaultValue={modal !== 'new' ? modal?.party ?? '' : ''} placeholder={dir === 'IN' ? 'Dinas Pendidikan…' : 'Kepada Yth…'} />
          </Field>
          <Field label="Keterangan" className="sm:col-span-2">
            <Input name="description" defaultValue={modal !== 'new' ? modal?.description ?? '' : ''} />
          </Field>
          <div className="flex justify-end gap-2 sm:col-span-2">
            <Button type="button" variant="ghost" onClick={() => setModal(null)}>Batal</Button>
            <Button type="submit" disabled={busy}>{busy ? 'Menyimpan…' : 'Simpan'}</Button>
          </div>
        </form>
      </Modal>
    </Shell>
  );
}
