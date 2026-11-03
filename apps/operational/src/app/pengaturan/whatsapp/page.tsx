'use client';

import { useCallback, useEffect, useState } from 'react';
import { Badge, Button, Field, Input, Select } from '@smpmuh3/ui';
import {
  WA_MESSAGE_STATUS_LABELS,
  WA_MESSAGE_TYPE_LABELS,
  WA_MESSAGE_STATUSES,
  type WaMessageStatus,
  type WaMessagesResponse,
  type WhatsappSettingsDto,
} from '@smpmuh3/types';
import { Shell } from '@/components/shell';
import { DataTable } from '@/components/data-table';
import { PageTitle, Widget } from '@/components/widgets';
import {
  ApiError,
  cancelWaMessage,
  getWaSettings,
  listWaMessages,
  retryWaMessage,
  updateWaSettings,
} from '@/lib/api';

const TONE: Record<WaMessageStatus, 'primary' | 'accent' | 'neutral' | 'danger'> = {
  QUEUED: 'neutral',
  SENDING: 'accent',
  SENT: 'primary',
  FAILED: 'danger',
  CANCELLED: 'danger',
};

type WaMessage = WaMessagesResponse['messages'][number];

/** Pengaturan gateway WhatsApp + monitor antrean pengiriman anti-spam. */
export default function WhatsappSettingsPage() {
  const [cfg, setCfg] = useState<WhatsappSettingsDto | null>(null);
  const [data, setData] = useState<WaMessagesResponse | null>(null);
  const [type, setType] = useState('');
  const [status, setStatus] = useState<WaMessageStatus | ''>('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const [s, m] = await Promise.all([
        getWaSettings(),
        listWaMessages({
          type: type || undefined,
          status: status || undefined,
          take: 100,
        }),
      ]);
      setCfg(s);
      setData(m);
      setError(null);
    } catch {
      setError('Gagal memuat pengaturan WhatsApp.');
    } finally {
      setLoading(false);
    }
  }, [type, status]);

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 15_000); // antrean bergerak — refresh berkala
    return () => clearInterval(t);
  }, [load]);

  async function saveSettings(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setBusy(true);
    const f = new FormData(e.currentTarget);
    try {
      const token = String(f.get('gatewayToken') ?? '').trim();
      const saved = await updateWaSettings({
        enabled: f.get('enabled') === 'on',
        gatewayUrl: String(f.get('gatewayUrl') ?? '').trim() || undefined,
        ...(token ? { gatewayToken: token } : {}),
        intervalSeconds: Number(f.get('intervalSeconds')) || undefined,
        dailyLimit: Number(f.get('dailyLimit')) || undefined,
      });
      setCfg(saved);
      setNotice(
        saved.enabled && saved.hasToken
          ? 'Pengaturan disimpan — gateway AKTIF, pesan dikirim otomatis sesuai jeda.'
          : 'Pengaturan disimpan — gateway nonaktif, pesan tetap mengantre / via wa.me.',
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Gagal menyimpan.');
    } finally {
      setBusy(false);
    }
  }

  async function act(fn: () => Promise<unknown>, ok: string) {
    setError(null);
    setNotice(null);
    try {
      await fn();
      setNotice(ok);
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Aksi gagal.');
    }
  }

  const c = data?.counts ?? {};
  const fmtTime = (iso?: string | null) =>
    iso
      ? new Date(iso).toLocaleString('id-ID', {
          day: '2-digit',
          month: 'short',
          hour: '2-digit',
          minute: '2-digit',
        })
      : '—';

  return (
    <Shell>
      <PageTitle
        title="WhatsApp Gateway"
        subtitle="Konfigurasi pengirim pesan otomatis + pantauan antrean (anti-spam: pesan dikirim satu-satu dengan jeda)."
      />
      {error ? (
        <p role="alert" className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{error}</p>
      ) : null}
      {notice ? (
        <p role="status" className="mb-4 rounded-xl bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">{notice}</p>
      ) : null}

      {/* Konfigurasi + ringkasan di atas, antrean full-width di bawah */}
      <div className="mb-5 grid items-start gap-5 lg:grid-cols-2">
        <Widget title="Konfigurasi Gateway">
            {cfg ? (
              <form className="space-y-4" onSubmit={saveSettings}>
                <label className="flex cursor-pointer items-center justify-between rounded-xl border border-sand-200 px-4 py-3">
                  <span>
                    <span className="block text-sm font-bold text-sand-900">
                      Kirim otomatis via gateway
                    </span>
                    <span className="text-xs text-sand-500">
                      Nonaktif → pesan tetap mengantre, dikirim manual via wa.me
                    </span>
                  </span>
                  <input
                    type="checkbox"
                    name="enabled"
                    defaultChecked={cfg.enabled}
                    className="h-5 w-5 accent-primary-600"
                  />
                </label>
                <Field label="URL Gateway" hint="API gaya Fonnte — POST {target, message}">
                  <Input
                    name="gatewayUrl"
                    defaultValue={cfg.gatewayUrl}
                    placeholder="https://api.fonnte.com/send"
                  />
                </Field>
                <Field
                  label="Token"
                  hint={
                    cfg.hasToken
                      ? `Tersimpan: ${cfg.tokenPreview} — isi untuk mengganti`
                      : 'Token API provider (mis. Fonnte)'
                  }
                >
                  <Input
                    name="gatewayToken"
                    type="password"
                    autoComplete="off"
                    placeholder={cfg.hasToken ? '••••••••' : 'Tempel token di sini'}
                  />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Jeda Antar Pesan" hint="detik, min 3">
                    <Input
                      name="intervalSeconds"
                      type="number"
                      min={3}
                      max={300}
                      defaultValue={cfg.intervalSeconds}
                    />
                  </Field>
                  <Field label="Batas per Hari">
                    <Input
                      name="dailyLimit"
                      type="number"
                      min={1}
                      max={5000}
                      defaultValue={cfg.dailyLimit}
                    />
                  </Field>
                </div>
                <Button type="submit" disabled={busy} className="w-full">
                  {busy ? 'Menyimpan…' : 'Simpan Pengaturan'}
                </Button>
              </form>
            ) : (
              <p className="text-sm text-sand-500">Memuat…</p>
            )}
          </Widget>

        <Widget title="Ringkasan Antrean">
          <div className="grid grid-cols-2 gap-2 text-center sm:grid-cols-3">
            {WA_MESSAGE_STATUSES.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setStatus(status === s ? '' : s)}
                className={`rounded-xl px-2 py-2.5 text-left transition ${
                  status === s ? 'ring-2 ring-primary-400' : ''
                } bg-sand-50 hover:bg-sand-100`}
              >
                <p className="text-xs text-sand-500">
                  {WA_MESSAGE_STATUS_LABELS[s]}
                </p>
                <p className="font-extrabold text-sand-900">{c[s] ?? 0}</p>
              </button>
            ))}
          </div>
          <p className="mt-3 text-xs text-sand-500">
            Klik status untuk memfilter tabel. Halaman menyegarkan otomatis
            tiap 15 detik.
          </p>
        </Widget>
      </div>

      <Widget title="Antrean & Riwayat Pesan">
          <div className="mb-4 flex flex-wrap items-end gap-3">
            <Field label="Tipe Pesan" className="w-52">
              <Select value={type} onChange={(e) => setType(e.target.value)}>
                <option value="">Semua tipe</option>
                {(data?.types ?? []).map((t) => (
                  <option key={t} value={t}>
                    {WA_MESSAGE_TYPE_LABELS[t] ?? t}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Status" className="w-44">
              <Select
                value={status}
                onChange={(e) => setStatus(e.target.value as WaMessageStatus | '')}
              >
                <option value="">Semua status</option>
                {WA_MESSAGE_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {WA_MESSAGE_STATUS_LABELS[s]}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <DataTable
            head={['Waktu', 'Tipe', 'Tujuan', 'Pesan', 'Status', 'Aksi']}
            loading={loading}
            error={error}
            empty={
              data?.messages.length === 0
                ? 'Belum ada pesan pada filter ini.'
                : undefined
            }
          >
            {(data?.messages ?? []).map((m: WaMessage) => (
              <tr key={m.id}>
                <td className="whitespace-nowrap px-4 py-3 text-xs text-sand-600">
                  {fmtTime(m.createdAt)}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-xs font-semibold text-sand-700">
                  {WA_MESSAGE_TYPE_LABELS[m.type] ?? m.type}
                </td>
                <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-sand-700">
                  {m.phone}
                </td>
                <td className="max-w-56 px-4 py-3 text-xs text-sand-600">
                  <p className="line-clamp-2" title={m.message}>
                    {m.message}
                  </p>
                  {m.lastError ? (
                    <p className="mt-0.5 text-red-600">{m.lastError}</p>
                  ) : null}
                </td>
                <td className="px-4 py-3">
                  <Badge tone={TONE[m.status] ?? 'neutral'}>
                    {WA_MESSAGE_STATUS_LABELS[m.status]}
                  </Badge>
                  {m.attempts > 0 && m.status !== 'SENT' ? (
                    <p className="mt-0.5 text-[10px] text-sand-400">
                      {m.attempts}x coba
                    </p>
                  ) : null}
                  {m.sentAt ? (
                    <p className="mt-0.5 text-[10px] text-sand-400">
                      {fmtTime(m.sentAt)}
                    </p>
                  ) : null}
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1.5">
                    <a
                      href={m.waUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs font-semibold text-primary-700 hover:underline"
                    >
                      wa.me
                    </a>
                    {m.status === 'FAILED' || m.status === 'CANCELLED' ? (
                      <button
                        type="button"
                        className="text-xs font-semibold text-accent-700 hover:underline"
                        onClick={() =>
                          void act(() => retryWaMessage(m.id), 'Pesan diantrekan ulang.')
                        }
                      >
                        Kirim Ulang
                      </button>
                    ) : null}
                    {m.status === 'QUEUED' ? (
                      <button
                        type="button"
                        className="text-xs font-semibold text-red-600 hover:underline"
                        onClick={() =>
                          void act(() => cancelWaMessage(m.id), 'Pesan dibatalkan.')
                        }
                      >
                        Batalkan
                      </button>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
          </DataTable>
        </Widget>
    </Shell>
  );
}
