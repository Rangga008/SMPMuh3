'use client';

import { useCallback, useEffect, useState } from 'react';
import { Badge, Button, Input, Modal } from '@smpmuh3/ui';
import { Shell } from '@/components/shell';
import { PageTitle, Widget } from '@/components/widgets';
import {
  ApiError,
  downloadBackup,
  getBackupStats,
  restoreBackup,
  type BackupStats,
} from '@/lib/api';

const fmtBytes = (n: number) => {
  if (n <= 0) return '0 B';
  const u = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(Math.floor(Math.log2(n) / 10), u.length - 1);
  return `${(n / 2 ** (10 * i)).toFixed(i === 0 ? 0 : 1)} ${u[i]}`;
};

const PREFIX_LABEL: Record<string, string> = {
  'qmedia/': 'Soal & media ujian',
  'attendance/': 'Absensi (selfie)',
  'archive/': 'Arsip surat',
  'policy/': 'Dokumen kebijakan',
  'registrations/': 'Berkas pendaftar SPMB',
  'students/': 'Berkas siswa',
  'staff-docs/': 'Dokumen pegawai',
  'employees/': 'Foto pegawai',
  'school/': 'Kop & tanda tangan',
  'collections/': 'Bendahara/koleksi',
  'submissions/': 'Titipan/laporan',
  'mutations/': 'Mutasi',
  'templates/': 'Template surat',
  '(root)': 'Lainnya',
};

/** Cadangan & pemulihan database — dump Postgres utuh (.sql.gz). */
export default function BackupPage() {
  const [stats, setStats] = useState<BackupStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [confirmText, setConfirmText] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [fileKey, setFileKey] = useState(0); // reset <input type=file>

  const load = useCallback(() => {
    getBackupStats()
      .then(setStats)
      .catch(() => setStats(null));
  }, []);
  useEffect(load, [load]);

  async function onDownload() {
    setError(null);
    setNotice(null);
    setDownloading(true);
    try {
      await downloadBackup();
      setNotice('Backup terunduh — simpan file .sql.gz di tempat aman.');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Gagal mengunduh backup.');
    } finally {
      setDownloading(false);
    }
  }

  async function onRestore() {
    if (!file || confirmText !== 'PULIHKAN') return;
    setError(null);
    setNotice(null);
    setRestoring(true);
    try {
      await restoreBackup(file);
      setNotice(
        'Database berhasil dipulihkan. Sesi login mungkin berakhir — masuk ulang bila diminta.',
      );
      setFile(null);
      setConfirmOpen(false);
      setConfirmText('');
      setFileKey((k) => k + 1);
      load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Pemulihan gagal.');
      setConfirmOpen(false);
    } finally {
      setRestoring(false);
    }
  }

  const big = stats ? stats.dbBytes + stats.storageBytes : 0;

  return (
    <Shell>
      <PageTitle
        title="Cadangan & Pemulihan Database"
        subtitle="Unduh seluruh data aplikasi sebagai .sql.gz — untuk arsip rutin, pindah hosting, atau pemulihan insiden."
      />
      {error ? (
        <p role="alert" className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{error}</p>
      ) : null}
      {notice ? (
        <p role="status" className="mb-4 rounded-xl bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">{notice}</p>
      ) : null}

      <Widget title="Penggunaan Penyimpanan">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-sand-200 bg-sand-50 p-4">
            <p className="text-xs font-bold uppercase tracking-wider text-sand-500">Database</p>
            <p className="mt-1 text-2xl font-extrabold text-sand-950">
              {stats ? fmtBytes(stats.dbBytes) : '…'}
            </p>
          </div>
          <div className="rounded-2xl border border-sand-200 bg-sand-50 p-4">
            <p className="text-xs font-bold uppercase tracking-wider text-sand-500">
              Media & Berkas ({stats?.storageFiles ?? 0} file)
            </p>
            <p className="mt-1 text-2xl font-extrabold text-sand-950">
              {stats ? fmtBytes(stats.storageBytes) : '…'}
            </p>
          </div>
          <div className="rounded-2xl border border-primary-200 bg-primary-50 p-4">
            <p className="text-xs font-bold uppercase tracking-wider text-primary-700">Total</p>
            <p className="mt-1 text-2xl font-extrabold text-primary-800">
              {stats ? fmtBytes(big) : '…'}
            </p>
          </div>
        </div>
        {stats && stats.storage.length > 0 ? (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {stats.storage.slice(0, 10).map((s) => (
              <Badge key={s.prefix} tone="neutral">
                {PREFIX_LABEL[s.prefix] ?? s.prefix}: {s.files} ({fmtBytes(s.bytes)})
              </Badge>
            ))}
          </div>
        ) : null}
        <p className="mt-3 text-xs text-sand-500">
          Backup .sql.gz berisi seluruh tabel database (akun, siswa, tagihan,
          soal, nilai, pengaturan). File media/berkas di object storage tidak
          ikut — kelola cadangannya terpisah.
        </p>
      </Widget>

      <div className="mt-5 grid items-start gap-5 lg:grid-cols-2">
        <Widget title="Unduh Backup">
          <p className="mb-4 text-sm leading-relaxed text-sand-600">
            Membuat dump Postgres standar (<code>pg_dump --clean --if-exists</code>)
            terkompresi gzip — bisa dipulihkan ke server ini maupun instalasi lain.
          </p>
          <Button onClick={onDownload} disabled={downloading} className="w-full sm:w-auto">
            {downloading ? 'Membuat backup…' : '⬇ Unduh Backup (.sql.gz)'}
          </Button>
          {downloading ? (
            <p className="mt-2 text-xs text-sand-500">
              Database besar bisa memakan waktu — jangan tutup halaman.
            </p>
          ) : null}
        </Widget>

        <Widget title="Pulihkan Database">
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            <p className="font-bold">Menimpa seluruh data saat ini.</p>
            <p className="mt-0.5 text-xs leading-relaxed">
              Pemulihan berjalan dalam satu transaksi — bila gagal di tengah,
              database kembali utuh. Selalu unduh backup baru sebelum memulihkan.
            </p>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Input
              key={fileKey}
              type="file"
              accept=".sql,.gz,.sql.gz,application/gzip,application/x-gzip"
              className="w-full sm:w-72"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
            <Button
              variant="danger"
              disabled={!file || restoring}
              onClick={() => {
                setConfirmText('');
                setConfirmOpen(true);
              }}
            >
              {restoring ? 'Memulihkan…' : '⬆ Pulihkan Database'}
            </Button>
          </div>
          <p className="mt-2 text-xs text-sand-500">
            Terima file <code>.sql</code> atau <code>.sql.gz</code> hasil Unduh
            Backup. Jangan tutup halaman sampai selesai.
          </p>
        </Widget>
      </div>

      <Modal
        open={confirmOpen}
        onClose={() => !restoring && setConfirmOpen(false)}
        title="Konfirmasi Pemulihan Database"
      >
        <div className="space-y-4">
          <p className="text-sm leading-relaxed text-sand-700">
            Anda akan <strong className="text-red-700">menimpa SELURUH database</strong>{' '}
            dengan isi file <code className="break-all">{file?.name}</code> (
            {file ? fmtBytes(file.size) : '—'}). Semua perubahan setelah tanggal
            backup akan hilang permanen.
          </p>
          <label className="block text-sm font-semibold text-sand-800">
            Ketik <span className="font-mono font-extrabold text-red-700">PULIHKAN</span> untuk melanjutkan
            <Input
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value.toUpperCase())}
              placeholder="PULIHKAN"
              className="mt-2 font-mono"
              autoComplete="off"
            />
          </label>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              className="flex-1"
              disabled={restoring}
              onClick={() => setConfirmOpen(false)}
            >
              Batal
            </Button>
            <Button
              variant="danger"
              className="flex-1"
              disabled={confirmText !== 'PULIHKAN' || restoring}
              onClick={onRestore}
            >
              {restoring ? 'Memulihkan…' : 'Ya, Pulihkan'}
            </Button>
          </div>
        </div>
      </Modal>
    </Shell>
  );
}
