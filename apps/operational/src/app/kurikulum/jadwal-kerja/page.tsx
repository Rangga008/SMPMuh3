'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Badge, Button, Field, Input, Modal, Select } from '@smpmuh3/ui';
import { Shell } from '@/components/shell';
import { useConfirm } from '@/components/confirm-dialog';
import { DataTable } from '@/components/data-table';
import { RowBtn } from '@/components/row-btn';
import { FilePick } from '@/components/file-pick';
import { PageTitle, Widget } from '@/components/widgets';
import { useFileViewer } from '@/components/file-viewer';
import { PERMISSIONS } from '@smpmuh3/types';
import { usePermission } from '@/lib/use-permission';
import {
  createWorkShift,
  deleteWorkShift,
  getAttendanceSettings,
  listWorkShifts,
  updateAttendanceSettings,
  updateWorkShift,
  type AttendanceSettings,
  type WorkShift,
} from '@/lib/api';
import { listPolicies, listUniforms, uploadPolicy, upsertUniform } from '@/lib/api-ops';

const DAYS_FULL = ['', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu'];
const POLICY_KINDS = ['TATA_TERTIB_SISWA', 'TATA_TERTIB_PTK', 'SERAGAM', 'FORM_MUTASI_MASUK', 'FORM_MUTASI_KELUAR', 'LAINNYA'];

const minToHHMM = (m: number) =>
  `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

declare global {
  interface Window {
    L?: {
      map: (el: HTMLElement) => LeafletMap;
      tileLayer: (url: string, opts?: Record<string, unknown>) => { addTo: (m: LeafletMap) => void };
      marker: (latlng: [number, number]) => LeafletMarker;
      circle: (latlng: [number, number], opts: { radius: number; color?: string }) => LeafletMarker;
    };
  }
}
interface LeafletMap {
  setView: (latlng: [number, number], zoom: number) => LeafletMap;
  on: (ev: string, cb: (e: { latlng: { lat: number; lng: number } }) => void) => void;
  remove: () => void;
}
interface LeafletMarker {
  addTo: (m: LeafletMap) => LeafletMarker;
  setLatLng: (latlng: [number, number]) => LeafletMarker;
  setRadius?: (r: number) => LeafletMarker;
  remove?: () => void;
}

let leafletPromise: Promise<NonNullable<Window['L']>> | null = null;
/** Muat Leaflet dari CDN sekali — dipakai untuk map picker lokasi sekolah. */
function loadLeaflet() {
  if (window.L) return Promise.resolve(window.L);
  if (!leafletPromise) {
    leafletPromise = new Promise((resolve, reject) => {
      const css = document.createElement('link');
      css.rel = 'stylesheet';
      css.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      document.head.appendChild(css);
      const js = document.createElement('script');
      js.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
      js.onload = () => (window.L ? resolve(window.L) : reject(new Error('Leaflet gagal dimuat')));
      js.onerror = () => reject(new Error('Leaflet gagal dimuat — periksa koneksi.'));
      document.head.appendChild(js);
    });
  }
  return leafletPromise;
}

/** Peta klik-untuk-pilih lokasi — menulis koordinat ke input form. */
function MapPicker({
  lat,
  lng,
  radiusM,
  onPick,
}: {
  lat: number | null;
  lng: number | null;
  radiusM: number;
  onPick: (lat: number, lng: number) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const markerRef = useRef<LeafletMarker | null>(null);
  const circleRef = useRef<LeafletMarker | null>(null);
  const [ready, setReady] = useState(false);
  const onPickRef = useRef(onPick);
  onPickRef.current = onPick;
  const latRef = useRef(lat);
  const lngRef = useRef(lng);
  latRef.current = lat;
  lngRef.current = lng;
  const radiusRef = useRef(radiusM);
  radiusRef.current = radiusM;

  useEffect(() => {
    let map: LeafletMap | null = null;
    let cancelled = false;
    loadLeaflet()
      .then((L) => {
        if (cancelled || !ref.current || !L) return;
        const center: [number, number] =
          latRef.current != null && lngRef.current != null
            ? [latRef.current, lngRef.current]
            : [-6.9175, 107.6191]; // Bandung default
        map = L.map(ref.current).setView(center, latRef.current != null ? 17 : 13);
        L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '&copy; OpenStreetMap',
          maxZoom: 19,
        }).addTo(map);
        const place = (la: number, ln: number) => {
          if (!map || !L) return;
          if (!markerRef.current) {
            markerRef.current = L.marker([la, ln]).addTo(map);
            circleRef.current = L.circle([la, ln], { radius: radiusRef.current, color: '#0369a1' }).addTo(map);
          } else {
            markerRef.current.setLatLng([la, ln]);
            circleRef.current?.setLatLng([la, ln]);
          }
        };
        if (latRef.current != null && lngRef.current != null) place(latRef.current, lngRef.current);
        map.on('click', (e) => {
          place(e.latlng.lat, e.latlng.lng);
          onPickRef.current(e.latlng.lat, e.latlng.lng);
        });
        setReady(true);
      })
      .catch(() => setReady(false));
    return () => {
      cancelled = true;
      map?.remove();
    };
  }, []);

  // Sinkron radius lingkaran saat pengguna mengubah field radius.
  useEffect(() => {
    circleRef.current?.setRadius?.(radiusM);
  }, [radiusM]);

  return (
    // isolate: pane Leaflet punya z-index 400–1000 — tanpa stacking context
    // ia tembus menutupi modal/dialog di atasnya dan menelan klik.
    <div className="isolate overflow-hidden rounded-xl border border-sand-300">
      <div ref={ref} className="h-72 w-full bg-sand-100" />
      {!ready && <p className="px-3 py-2 text-xs text-sand-500">Memuat peta… (butuh internet untuk tile OpenStreetMap)</p>}
      <p className="bg-sand-50 px-3 py-1.5 text-xs text-sand-500">
        Klik di peta untuk menempatkan titik sekolah — lingkaran biru = radius absen yang diizinkan.
      </p>
    </div>
  );
}

/**
 * Jadwal kerja pegawai — dikelola bidang Kurikulum:
 * aturan jam masuk global, lokasi absen selfie (map picker), dan daftar shift.
 * Penugasan shift ke pegawai ada di halaman sendiri.
 */
export default function JadwalKerjaPage() {
  const { confirm, dialog } = useConfirm();
  const [shifts, setShifts] = useState<WorkShift[]>([]);
  const [settings, setSettings] = useState<AttendanceSettings | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [shiftModal, setShiftModal] = useState<WorkShift | 'new' | null>(null);
  const [polModal, setPolModal] = useState(false);
  const [policies, setPolicies] = useState<Awaited<ReturnType<typeof listPolicies>>>([]);
  const [uniforms, setUniforms] = useState<Awaited<ReturnType<typeof listUniforms>>>([]);
  const [mapLat, setMapLat] = useState<number | null>(null);
  const [mapLng, setMapLng] = useState<number | null>(null);
  const [mapRadius, setMapRadius] = useState(200);
  const canManage = usePermission(PERMISSIONS.ACADEMIC_MANAGE);
  const fv = useFileViewer();

  const load = useCallback(() => {
    listWorkShifts().then(setShifts).catch((e) => setError(e.message));
    listPolicies().then(setPolicies).catch(() => {});
    listUniforms().then(setUniforms).catch(() => {});
    getAttendanceSettings()
      .then((s) => {
        setSettings(s);
        setMapLat(s.schoolLat ?? null);
        setMapLng(s.schoolLng ?? null);
        setMapRadius(s.radiusM);
      })
      .catch(() => {});
  }, []);
  useEffect(load, [load]);

  async function run<T>(fn: () => Promise<T>, ok: (r: T) => string) {
    setBusy(true); setError(''); setNotice('');
    try {
      const r = await fn();
      setNotice(ok(r));
      return r;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function onSaveSettings(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    await run(
      () =>
        updateAttendanceSettings({
          workStart: String(f.get('workStart')),
          workEnd: String(f.get('workEnd')),
          lateAfter: Number(f.get('lateAfter')) || 0,
          checkOutFrom: String(f.get('checkOutFrom')),
          autoDerive: f.get('autoDerive') === 'on',
          schoolLat: mapLat,
          schoolLng: mapLng,
          radiusM: Number(f.get('radiusM')) || 200,
        }),
      () => 'Pengaturan jadwal & lokasi disimpan.',
    );
    load();
  }

  function fillMyLocation() {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setMapLat(pos.coords.latitude);
        setMapLng(pos.coords.longitude);
      },
      () => setError('Lokasi tidak didapat — aktifkan izin lokasi browser.'),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  async function onSaveShift(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const dto = {
      name: String(f.get('name') ?? ''),
      startTime: String(f.get('startTime')),
      endTime: String(f.get('endTime')),
      checkOutFrom: String(f.get('checkOutFrom')),
      lateAfter: Number(f.get('lateAfter')) || 10,
    };
    const isNew = shiftModal === 'new';
    const r = await run(
      () => (isNew ? createWorkShift(dto) : updateWorkShift((shiftModal as WorkShift).id, dto)),
      () => (isNew ? 'Shift ditambahkan.' : 'Shift diperbarui.'),
    );
    if (r !== undefined) { setShiftModal(null); load(); }
  }

  async function onDeleteShift(s: WorkShift) {
    if (await confirm({
      title: `Hapus shift "${s.name}"?`,
      body: `${s._count?.assignments ?? 0} penugasan ikut dilepas — pegawai kembali ke aturan global.`,
    })) {
      const r = await run(() => deleteWorkShift(s.id), () => 'Shift dihapus.');
      if (r !== undefined) load();
    }
  }

  return (
    <Shell>
      <PageTitle
        title="Jadwal Kerja Pegawai"
        subtitle="Aturan jam masuk, lokasi absen selfie, dan daftar shift — dikelola bidang Kurikulum"
        actions={
          <Link
            href="/kurikulum/jadwal-kerja/penugasan"
            className="inline-flex items-center gap-1.5 rounded-xl bg-primary-700 px-4 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-primary-800"
          >
            Penugasan Shift →
          </Link>
        }
      />
      {error && <p className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{error}</p>}
      {notice && <p className="mb-4 rounded-xl bg-primary-50 px-4 py-3 text-sm font-medium text-primary-800">{notice}</p>}

      {canManage && settings && (
        <Widget title="Aturan Global & Lokasi Absen">
          <form onSubmit={onSaveSettings}>
            {/* Baris jam kerja — empat kolom rapi di desktop, susun di HP. */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Field label="Jam masuk (default)">
                <Input type="time" name="workStart" required defaultValue={settings.workStart} />
              </Field>
              <Field label="Akhir jam kerja" hint="Absen masuk dibatasi sampai jam ini">
                <Input type="time" name="workEnd" required defaultValue={settings.workEnd ?? '15:00'} />
              </Field>
              <Field label="Toleransi telat (menit)">
                <Input type="number" name="lateAfter" min={0} max={240} required defaultValue={settings.lateAfter} />
              </Field>
              <Field label="Boleh absen pulang mulai">
                <Input type="time" name="checkOutFrom" required defaultValue={settings.checkOutFrom} />
              </Field>
            </div>
            {/* Bagian lokasi — peta lebar di kiri, kontrol rapi di kanan. */}
            <div className="mt-5 grid gap-4 lg:grid-cols-[1fr_260px]">
              <MapPicker
                lat={mapLat}
                lng={mapLng}
                radiusM={mapRadius}
                onPick={(la, ln) => { setMapLat(la); setMapLng(ln); }}
              />
              <div className="grid content-start gap-3">
                <Field label="Radius absen selfie (meter)">
                  <Input
                    type="number"
                    name="radiusM"
                    min={10}
                    max={5000}
                    required
                    value={mapRadius}
                    onChange={(e) => setMapRadius(Number(e.target.value) || 0)}
                  />
                </Field>
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Latitude">
                    <Input
                      name="schoolLat"
                      value={mapLat ?? ''}
                      onChange={(e) => setMapLat(e.target.value === '' ? null : Number(e.target.value))}
                      placeholder="-6.9xxxx"
                    />
                  </Field>
                  <Field label="Longitude">
                    <Input
                      name="schoolLng"
                      value={mapLng ?? ''}
                      onChange={(e) => setMapLng(e.target.value === '' ? null : Number(e.target.value))}
                      placeholder="107.6xxxx"
                    />
                  </Field>
                </div>
                <Button type="button" variant="secondary" size="sm" onClick={fillMyLocation}>
                  📍 Pakai Lokasi Saya
                </Button>
                <label className="flex items-center gap-2 text-sm text-sand-700" title="Isi otomatis jam kerja dari jadwal mengajar">
                  <input type="checkbox" name="autoDerive" defaultChecked={settings.autoDerive} />
                  Auto-derive dari jadwal mengajar
                </label>
                <Button type="submit" disabled={busy}>{busy ? 'Menyimpan…' : 'Simpan Pengaturan'}</Button>
              </div>
            </div>
          </form>
          <p className="mt-3 text-xs text-slate-500">
            Lokasi sekolah menentukan radius absen selfie — pegawai hanya bisa absen bila berada dalam radius ini.
            Shift di bawah meng-override jam masuk/toleransi global per pegawai per hari.
          </p>
        </Widget>
      )}

      <Widget
        title="Daftar Shift"
        action={canManage ? <Button onClick={() => setShiftModal('new')}>+ Shift</Button> : undefined}
      >
        <DataTable head={['Nama', 'Masuk', 'Pulang', 'Boleh pulang mulai', 'Toleransi', 'Pegawai', '']}>
          {shifts.map((s) => (
            <tr key={s.id}>
              <td className="px-5 py-2.5 font-semibold">{s.name}</td>
              <td className="px-5 py-2.5 font-semibold">{minToHHMM(s.startMinute)}</td>
              <td className="px-5 py-2.5 font-semibold">{minToHHMM(s.endMinute)}</td>
              <td className="px-5 py-2.5 text-sand-600">{minToHHMM(s.checkOutFrom)}</td>
              <td className="px-5 py-2.5">{s.lateAfter} mnt</td>
              <td className="px-5 py-2.5">{s._count?.assignments ?? 0}</td>
              <td className="px-5 py-2.5 text-right">
                {canManage ? (
                  <span className="flex gap-2 justify-end">
                    <RowBtn onClick={() => setShiftModal(s)}>Edit</RowBtn>
                    <RowBtn tone="danger" onClick={() => onDeleteShift(s)}>Hapus</RowBtn>
                  </span>
                ) : null}
              </td>
            </tr>
          ))}
        </DataTable>
        {shifts.length === 0 && <p className="py-4 text-center text-sm text-slate-500">Belum ada shift — semua pegawai mengikuti aturan global di atas.</p>}
        <p className="mt-3 text-xs text-slate-500">
          Pasang shift ke pegawai di halaman{' '}
          <Link href="/kurikulum/jadwal-kerja/penugasan" className="font-semibold text-primary-700 hover:underline">
            Penugasan Shift
          </Link>
          .
        </p>
      </Widget>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        {/* Jadwal seragam PTK — pindahan dari Dokumen agar sekalian dengan jadwal kerja */}
        <Widget title="Jadwal Seragam PTK" subtitle="Pakaian dinas per hari — terlihat semua pegawai.">
          <div className="divide-y divide-sand-100">
            {[1, 2, 3, 4, 5, 6].map((d) => {
              const u = uniforms.find((x) => x.day === d);
              return (
                <div key={d} className="flex items-center gap-3 px-5 py-2.5">
                  <span className="w-20 text-sm font-bold text-sand-700">{DAYS_FULL[d]}</span>
                  {canManage ? (
                    <Input
                      defaultValue={u?.name ?? ''}
                      placeholder="— belum diatur —"
                      onBlur={(e) => {
                        const v = e.target.value.trim();
                        if (v && v !== u?.name) void run(() => upsertUniform({ day: d, name: v }), () => `Seragam ${DAYS_FULL[d]} diatur.`);
                      }}
                      aria-label={`Seragam ${DAYS_FULL[d]}`}
                    />
                  ) : (
                    <span className="text-sm text-sand-700">{u?.name ?? <span className="text-sand-400">— belum diatur —</span>}</span>
                  )}
                </div>
              );
            })}
          </div>
        </Widget>

        {/* Tata tertib & template — dipindah ke sini supaya satu tempat atur jadwal/peraturan */}
        <Widget title="Tata Tertib & Template" subtitle="Tata tertib siswa/PTK, form mutasi, template dokumen."
          action={canManage ? <Button size="sm" variant="outline" onClick={() => setPolModal(true)}>+ Upload</Button> : undefined}>
          <div className="divide-y divide-sand-100">
            {policies.length === 0 ? <p className="px-5 py-4 text-sm text-sand-400">Belum ada dokumen.</p> : policies.map((p) => (
              <div key={p.id} className="flex items-center justify-between px-5 py-3">
                <div>
                  <p className="text-sm font-bold text-sand-900">{p.title}</p>
                  <Badge tone="neutral">{p.kind}</Badge>
                </div>
                <span className="flex items-center gap-2">
                  <span className="max-w-36 truncate text-xs text-sand-500" title={p.fileName ?? undefined}>{p.fileName}</span>
                  <RowBtn type="button" onClick={() => fv.open({ path: `/ops/policies/${p.id}/file`, name: p.fileName ?? 'dokumen' })}>Lihat</RowBtn>
                </span>
              </div>
            ))}
          </div>
        </Widget>
      </div>

      <Modal open={polModal} onClose={() => setPolModal(false)} title="Upload Tata Tertib / Template">
        <form className="grid gap-4" onSubmit={async (e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          const f = fd.get('file') as File;
          if (!f?.size) return;
          const r = await run(() => uploadPolicy(String(fd.get('kind')), String(fd.get('title') || f.name), f), () => 'Dokumen terupload.');
          if (r !== undefined) { setPolModal(false); load(); }
        }}>
          <Field label="Jenis">
            <Select name="kind" searchable>{POLICY_KINDS.map((k) => <option key={k} value={k}>{k.replaceAll('_', ' ')}</option>)}</Select>
          </Field>
          <Field label="Judul"><Input name="title" placeholder="Tata Tertib Siswa 2026" /></Field>
          <Field label="File"><FilePick name="file" required accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx,.xlsx,.xls" /></Field>
          <div className="flex justify-end gap-2"><Button type="submit" disabled={busy}>Upload</Button></div>
        </form>
      </Modal>

      <Modal open={shiftModal !== null} onClose={() => setShiftModal(null)} title={shiftModal === 'new' ? 'Tambah Shift' : 'Edit Shift'}>
        <form onSubmit={onSaveShift} className="grid gap-3">
          <Field label="Nama shift">
            <Input name="name" required defaultValue={shiftModal === 'new' ? '' : (shiftModal as WorkShift)?.name} placeholder="Pagi / Siang / Malam" />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Jam masuk">
              <Input type="time" name="startTime" required defaultValue={shiftModal === 'new' ? '07:00' : minToHHMM((shiftModal as WorkShift)?.startMinute ?? 420)} />
            </Field>
            <Field label="Jam pulang">
              <Input type="time" name="endTime" required defaultValue={shiftModal === 'new' ? '15:00' : minToHHMM((shiftModal as WorkShift)?.endMinute ?? 900)} />
            </Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Boleh pulang mulai">
              <Input type="time" name="checkOutFrom" required defaultValue={shiftModal === 'new' ? '14:00' : minToHHMM((shiftModal as WorkShift)?.checkOutFrom ?? 840)} />
            </Field>
            <Field label="Toleransi telat (menit)">
              <Input type="number" name="lateAfter" min={0} max={240} required defaultValue={(shiftModal as WorkShift)?.lateAfter ?? 10} />
            </Field>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setShiftModal(null)}>Batal</Button>
            <Button type="submit" disabled={busy}>Simpan</Button>
          </div>
        </form>
      </Modal>
      {dialog}
      {fv.viewer}
    </Shell>
  );
}
