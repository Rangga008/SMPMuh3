'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Badge, Button, Field } from '@smpmuh3/ui';
import { Shell } from '@/components/shell';
import { PageTitle, Widget } from '@/components/widgets';
import { getMyAttendance, selfiePunch, type AttendanceDayRow, type MyAttendance } from '@/lib/api';

const fmtTime = (iso?: string | null) =>
  iso
    ? new Date(iso).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' })
    : '—';
const STATUS_BADGE: Record<string, 'primary' | 'accent' | 'neutral' | 'danger'> = {
  HADIR: 'primary', TELAT: 'accent', IZIN: 'neutral', SAKIT: 'neutral', ALPHA: 'danger',
};
const DOW = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
const DOW_FULL = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
const minToHHMM = (m: number) =>
  `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const thisMonth = () =>
  `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;

/** Absen pegawai — selfie + geolokasi, kalender bulanan + jadwal shift. */
export default function AbsenPage() {
  const [data, setData] = useState<MyAttendance | null>(null);
  const [err, setErr] = useState('');
  const [month, setMonth] = useState(thisMonth());
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [camOn, setCamOn] = useState(false);
  const [pending, setPending] = useState<0 | 1 | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  const load = useCallback(() => {
    getMyAttendance(month).then(setData).catch((e) => setErr(e instanceof Error ? e.message : String(e)));
  }, [month]);
  useEffect(load, [load]);

  useEffect(() => () => streamRef.current?.getTracks().forEach((t) => t.stop()), []);

  const startCam = async (inOut: 0 | 1) => {
    setErr(''); setMsg(''); setPending(inOut);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
      streamRef.current = stream;
      setCamOn(true);
      setTimeout(() => {
        if (videoRef.current) videoRef.current.srcObject = stream;
      }, 50);
    } catch {
      setErr('Kamera tidak tersedia / izin ditolak — aktifkan izin kamera di browser.');
      setPending(null);
    }
  };
  const stopCam = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCamOn(false);
    setPending(null);
  };

  const capture = async () => {
    if (pending == null || !videoRef.current) return;
    setBusy(true); setErr('');
    try {
      const pos = await new Promise<GeolocationPosition>((ok, no) =>
        navigator.geolocation.getCurrentPosition(ok, no, { enableHighAccuracy: true, timeout: 10000 }),
      );
      const video = videoRef.current;
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth || 640;
      canvas.height = video.videoHeight || 480;
      canvas.getContext('2d')?.drawImage(video, 0, 0);
      const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, 'image/jpeg', 0.85));
      if (!blob) throw new Error('Gagal mengambil foto — coba lagi.');
      const r = await selfiePunch(pending, pos.coords.latitude, pos.coords.longitude, blob);
      setMsg(
        `Absen ${r.inOut === 0 ? 'MASUK' : 'PULANG'} tercatat ${fmtTime(r.punchedAt)} WIB — jarak ${r.distanceM} m dari sekolah${
          r.attendance?.status ? ` · status ${r.attendance.status}` : ''
        }.`,
      );
      stopCam();
      load();
    } catch (e) {
      setErr(
        e instanceof GeolocationPositionError
          ? 'Lokasi tidak didapat — aktifkan GPS/izin lokasi lalu coba lagi.'
          : e instanceof Error ? e.message : String(e),
      );
    } finally {
      setBusy(false);
    }
  };

  const alreadyIn = !!data?.today?.checkInAt;
  const alreadyOut = !!data?.today?.checkOutAt;

  // Kalender bulan — gabungan riwayat absen + shift kerja per hari.
  const byDate = new Map<string, AttendanceDayRow>(
    (data?.rows ?? []).map((r) => [String(r.date).slice(0, 10), r]),
  );
  const [y, mo] = month.split('-').map(Number);
  const daysInMonth = new Date(y!, mo!, 0).getDate();
  const firstDow = new Date(Date.UTC(y!, mo! - 1, 1)).getUTCDay();
  const offset = (firstDow + 6) % 7;
  const cells: (number | null)[] = [
    ...Array<null>(offset).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const shiftFor = (dow: number) => {
    const s = data?.shifts ?? [];
    return s.find((x) => x.dayOfWeek === dow)?.shift ?? s.find((x) => x.dayOfWeek === -1)?.shift ?? null;
  };
  const todayIso = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-${String(new Date().getDate()).padStart(2, '0')}`;
  const todayShift = shiftFor(new Date().getDay());
  const lateTotal = (data?.rows ?? []).reduce((s, r) => s + (r.lateMinutes || 0), 0);
  const hadirCount = (data?.rows ?? []).filter((r) => r.status === 'HADIR' || r.status === 'TELAT').length;

  return (
    <Shell>
      <PageTitle
        title="Absen Saya"
        subtitle="Selfie + lokasi — absen hanya sah bila Anda berada di radius sekolah"
      />
      {err && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{err}</div>
      )}
      {msg && (
        <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{msg}</div>
      )}
      {!data && !err && <p className="text-sm text-slate-500">Memuat…</p>}

      {data && (
        <>
          <Widget title="Status Hari Ini">
            <div className="flex flex-wrap items-center gap-6">
              <div>
                <p className="text-xs uppercase text-slate-400">Pegawai</p>
                <p className="font-semibold">{data.employee.name}{data.employee.nip ? ` · ${data.employee.nip}` : ''}</p>
              </div>
              <div>
                <p className="text-xs uppercase text-slate-400">Jadwal hari ini</p>
                <p className="font-semibold">
                  {todayShift ? `${todayShift.name} · ${minToHHMM(todayShift.startMinute)}–${minToHHMM(todayShift.endMinute)}` : 'Jam kerja global'}
                </p>
              </div>
              <div>
                <p className="text-xs uppercase text-slate-400">Masuk</p>
                <p className="text-lg font-semibold">{fmtTime(data.today?.checkInAt)}</p>
              </div>
              <div>
                <p className="text-xs uppercase text-slate-400">Pulang</p>
                <p className="text-lg font-semibold">{fmtTime(data.today?.checkOutAt)}</p>
              </div>
              <div>
                <p className="text-xs uppercase text-slate-400">Status</p>
                {data.today ? (
                  <Badge tone={STATUS_BADGE[data.today.status] ?? 'neutral'}>
                    {data.today.status}{data.today.lateMinutes > 0 ? ` (+${data.today.lateMinutes} mnt)` : ''}
                  </Badge>
                ) : (
                  <Badge tone="neutral">BELUM ABSEN</Badge>
                )}
              </div>
            </div>
            {!data.geo.configured && (
              <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
                Lokasi sekolah belum diatur — hubungi bidang Kurikulum untuk mengisi pengaturan lokasi absen.
              </p>
            )}
            <div className="mt-4 flex flex-wrap gap-3">
              <Button onClick={() => startCam(0)} disabled={busy || !data.geo.configured || alreadyIn}>
                {alreadyIn ? 'Sudah Absen Masuk' : 'Absen Masuk (Selfie)'}
              </Button>
              <Button
                variant="secondary"
                onClick={() => startCam(1)}
                disabled={busy || !data.geo.configured || !alreadyIn || alreadyOut}
              >
                {alreadyOut ? 'Sudah Absen Pulang' : 'Absen Pulang (Selfie)'}
              </Button>
            </div>
            {!alreadyIn && data.geo.configured && (
              <p className="mt-2 text-xs text-slate-400">Absen pulang aktif setelah Anda absen masuk.</p>
            )}
          </Widget>

          <Widget
            title="Kalender Absensi"
            action={
              <div className="w-36">
                <Field label="Bulan">
                  <input
                    type="month"
                    value={month}
                    onChange={(e) => setMonth(e.target.value)}
                    className="h-9 w-full rounded-xl border border-sand-300 bg-white px-3 text-sm font-medium text-sand-800"
                    aria-label="Bulan absensi"
                  />
                </Field>
              </div>
            }
          >
            <div className="mb-3 flex flex-wrap items-center gap-4 text-xs text-sand-600">
              <span><b className="text-sand-900">{hadirCount}</b> hari hadir</span>
              <span><b className="text-amber-700">{lateTotal}</b> menit telat (akumulasi)</span>
              {(data.shifts ?? []).length > 0 && (
                <span className="text-sand-400">
                  Shift: {(data.shifts ?? []).map((s) => `${s.shift.name} (${s.dayOfWeek === -1 ? 'tiap hari' : DOW_FULL[s.dayOfWeek]})`).join(' · ')}
                </span>
              )}
            </div>
            <div className="grid grid-cols-7 gap-1.5 text-center text-xs">
              {DOW.map((d) => (
                <p key={d} className="pb-1 font-bold uppercase tracking-wider text-sand-400">{d}</p>
              ))}
              {cells.map((d, i) => {
                if (d === null) return <span key={`e${i}`} />;
                const iso = `${month}-${String(d).padStart(2, '0')}`;
                const rec = byDate.get(iso);
                const dow = new Date(Date.UTC(y!, mo! - 1, d)).getUTCDay();
                const shift = shiftFor(dow);
                const isToday = iso === todayIso;
                return (
                  <div
                    key={iso}
                    title={rec?.note ?? (shift ? `${shift.name} ${minToHHMM(shift.startMinute)}–${minToHHMM(shift.endMinute)}` : undefined)}
                    className={`min-h-20 rounded-xl border px-1.5 py-1 text-left ${
                      isToday ? 'border-primary-400 bg-primary-50' : 'border-sand-200 bg-white'
                    } ${rec?.status === 'ALPHA' ? 'border-red-200 bg-red-50' : ''}`}
                  >
                    <p className={`text-[11px] font-bold ${isToday ? 'text-primary-700' : 'text-sand-500'}`}>{d}</p>
                    {shift && !rec && dow !== 0 && (
                      <p className="mt-0.5 text-[9px] leading-tight text-sand-400">
                        {minToHHMM(shift.startMinute)}–{minToHHMM(shift.endMinute)}
                      </p>
                    )}
                    {rec ? (
                      <div className="mt-0.5 space-y-0.5">
                        <Badge tone={STATUS_BADGE[rec.status] ?? 'neutral'} className="px-1 py-0 text-[9px]">
                          {rec.status}
                        </Badge>
                        <p className="text-[10px] leading-tight text-sand-700">
                          {fmtTime(rec.checkInAt)}–{fmtTime(rec.checkOutAt)}
                        </p>
                        {rec.lateMinutes ? (
                          <p className="text-[9px] font-semibold text-amber-700">+{rec.lateMinutes} mnt</p>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
            {(data.shifts ?? []).length === 0 && (
              <p className="mt-3 text-xs text-sand-400">
                Anda memakai jam kerja global — kurikulum bisa memasang shift khusus di Jadwal Kerja → Penugasan Shift.
              </p>
            )}
          </Widget>
        </>
      )}

      {camOn && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-4 shadow-xl">
            <h3 className="mb-3 font-semibold">
              Selfie Absen {pending === 0 ? 'Masuk' : 'Pulang'}
            </h3>
            <video ref={videoRef} autoPlay playsInline muted className="w-full rounded-xl bg-black" />
            <p className="mt-2 text-xs text-slate-500">
              Pastikan wajah terlihat jelas. Lokasi Anda akan dicatat saat tombol kirim ditekan.
            </p>
            <div className="mt-3 flex justify-end gap-2">
              <Button variant="secondary" onClick={stopCam} disabled={busy}>Batal</Button>
              <Button onClick={capture} disabled={busy}>
                {busy ? 'Mengirim…' : 'Ambil & Kirim'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </Shell>
  );
}
