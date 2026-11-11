'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { Button } from '@smpmuh3/ui';
import { Shell } from '@/components/shell';
import { getStudentRecord, updateStudentRecord, uploadStudentPhoto, studentPhotoUrl } from '@/lib/api-ops';
import { ApiError, phoneLocal } from '@/lib/api';

type Details = Record<string, string>;
type Penyakit = { jenis: string; kelas: string; tahun: string; lama: string; ket: string };
type Beasiswa = { tahun: string; dari: string };
type KehadiranRow = { kelas: string; hadir: string; hadirPct: string; sakit: string; izin: string; alpa: string; jml: string; pct: string; efektif: string };
type NilaiRow = { m: string; n: string[]; ujian: string; ijazah: string };
type NilaiKepala = { tp: string; kelas: string };
type NilaiEkskul = { nama: string; ket: string };
type NilaiHadir = { sakit: string[]; izin: string[]; tk: string[] };
type NilaiKeputusan = { tp: string; ket: string };

const KEPRIBADIAN = [
  ['disiplin', 'Disiplin/Ketertiban'],
  ['prakarsa', 'Prakarsa/Kreativitas'],
  ['tanggungJawab', 'Tanggung Jawab'],
  ['penyesuaian', 'Penyesuaian Diri'],
  ['emosi', 'Kemantapan Emosi'],
  ['kerjasama', 'Kerjasama'],
] as const;

const MAPEL_BAWAAN = [
  'Pendidikan Agama dan Budi Pekerti',
  'Pendidikan Pancasila dan Kewarganegaraan',
  'Bahasa Indonesia',
  'Matematika (Umum)',
  'Ilmu Pengetahuan Alam (IPA)',
  'Ilmu Pengetahuan Sosial (IPS)',
  'Bahasa Inggris',
  'Seni Budaya',
  'Pend. Jasmani, Olahraga dan Kesehatan',
  'Informatika',
  'Muatan Lokal Bahasa Daerah',
];

const KOSONG_KEHADIRAN = (): KehadiranRow[] =>
  Array.from({ length: 6 }, () => ({ kelas: '', hadir: '', hadirPct: '', sakit: '', izin: '', alpa: '', jml: '', pct: '', efektif: '' }));
const KOSONG_KEPALA = (): NilaiKepala[] => [{ tp: '', kelas: '' }, { tp: '', kelas: '' }, { tp: '', kelas: '' }];
const KOSONG_EKSKUL = (): NilaiEkskul[] => [{ nama: '', ket: '' }, { nama: '', ket: '' }, { nama: '', ket: '' }];
const KOSONG_HADIR = (): NilaiHadir => ({ sakit: Array(6).fill(''), izin: Array(6).fill(''), tk: Array(6).fill('') });
const KOSONG_KEPUTUSAN = (): NilaiKeputusan[] => [{ tp: '', ket: '' }, { tp: '', ket: '' }, { tp: '', ket: '' }];
const KOSONG_MAPEL = (): NilaiRow[] =>
  MAPEL_BAWAAN.map((m) => ({ m, n: Array(6).fill(''), ujian: '', ijazah: '' }));

const tryParse = <T,>(raw: string | undefined, fb: T): T => {
  try { return raw ? (JSON.parse(raw) as T) : fb; } catch { return fb; }
};

/* Komponen presentasi di LUAR komponen halaman — sebelumnya didefinisikan di
   dalam render sehingga React meng-unmount+remount seluruh input tiap ketukan:
   fokus hilang dan halaman melompat ke atas (bug scroll). */
const Row = ({ no, label, children }: { no: number | string; label: string; children: React.ReactNode }) => (
  <div className="induk-row">
    <span className="induk-no">{no}</span>
    <span className="induk-label">{label}</span>
    <span className="induk-sep">:</span>
    <span className="induk-val">{children}</span>
  </div>
);
const T = ({ k, ph, ro, get, set }: { k: string; ph?: string; ro?: string; get: (k: string) => string; set: (k: string, v: string) => void }) =>
  ro !== undefined
    ? <span className="induk-text">{ro || '—'}</span>
    : <input className="induk-input" value={get(k)} placeholder={ph} onChange={(e) => set(k, e.target.value)} />;
const Section = ({ title }: { title: string }) => <h3 className="induk-section">{title}</h3>;
const Sub = ({ label, children }: { label: string; children?: React.ReactNode }) => (
  <div className="induk-sub"><span className="lbl">{label}</span><span>:</span>{children}</div>
);
const SubInput = ({ label, k, w, get, set }: { label: string; k: string; w?: number; get: (k: string) => string; set: (k: string, v: string) => void }) => (
  <Sub label={label}><input className="induk-input" style={w ? { width: w } : undefined} value={get(k)} onChange={(e) => set(k, e.target.value)} /></Sub>
);

/** Lembar Buku Induk Peserta Didik — layout mengikuti buku induk cetak SMP. */
export default function BukuIndukPage() {
  const { id } = useParams<{ id: string }>();
  const [s, setS] = useState<Awaited<ReturnType<typeof getStudentRecord>> | null>(null);
  const [d, setD] = useState<Details>({});
  const [penyakit, setPenyakit] = useState<Penyakit[]>([]);
  const [kepribadian, setKepribadian] = useState<Record<string, string>>({});
  const [beasiswa, setBeasiswa] = useState<Beasiswa[]>([{ tahun: '', dari: '' }, { tahun: '', dari: '' }, { tahun: '', dari: '' }]);
  const [kehadiran, setKehadiran] = useState<KehadiranRow[]>(KOSONG_KEHADIRAN);
  const [nilaiKepala, setNilaiKepala] = useState<NilaiKepala[]>(KOSONG_KEPALA);
  const [nilaiMapel, setNilaiMapel] = useState<NilaiRow[]>(KOSONG_MAPEL);
  const [nilaiEkskul, setNilaiEkskul] = useState<NilaiEkskul[]>(KOSONG_EKSKUL);
  const [nilaiHadir, setNilaiHadir] = useState<NilaiHadir>(KOSONG_HADIR);
  const [nilaiKeputusan, setNilaiKeputusan] = useState<NilaiKeputusan[]>(KOSONG_KEPUTUSAN);
  const [nik, setNik] = useState('');
  const [photoV, setPhotoV] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    getStudentRecord(id).then((r) => {
      setS(r);
      setNik(r.nik ?? '');
      const det = { ...(r.recordDetails ?? {}) } as Details;
      // Prefill dari kolom kanonik siswa agar buku induk sinkron dengan
      // data diri — kolom ini juga ditulis balik saat simpan.
      if (!det.ayahNama) det.ayahNama = r.fatherName ?? '';
      if (!det.ibuNama) det.ibuNama = r.motherName ?? '';
      if (!det.ayahPekerjaan) det.ayahPekerjaan = r.parentOccupation ?? '';
      if (!det.ayahHp) det.ayahHp = phoneLocal(r.parentPhone ?? r.parent?.phone);
      // Format wali baru = 2 kolom (L/P) — data lama kolom tunggal masuk kolom L.
      if (!det.waliLNama) det.waliLNama = det.waliNama ?? r.parent?.name ?? '';
      if (!det.waliLTtl) det.waliLTtl = det.waliTtl ?? '';
      if (!det.waliLWarga) det.waliLWarga = det.waliWarga ?? '';
      if (!det.waliLPendidikan) det.waliLPendidikan = det.waliPendidikan ?? '';
      if (!det.waliLPekerjaan) det.waliLPekerjaan = det.waliPekerjaan ?? '';
      if (!det.waliLPenghasilan) det.waliLPenghasilan = det.waliPenghasilan ?? '';
      if (!det.waliLAlamat) det.waliLAlamat = det.waliAlamat ?? '';
      if (!det.waliLHubungan) det.waliLHubungan = det.waliHubungan ?? '';
      if (!det.asalSd) det.asalSd = r.previousSchool ?? r.candidate?.previousSchool ?? '';
      if (!det.kelainan) det.kelainan = r.healthNotes ?? '';
      if (!det.iq) det.iq = r.intelligenceNotes ?? '';
      if (!det.pindahKeluarAlasan) det.pindahKeluarAlasan = r.leavingNotes ?? '';
      if (!det.catatan) det.catatan = r.otherNotes ?? '';
      setD(det);
      setPenyakit(tryParse<Penyakit[]>(det.penyakit, []));
      setKepribadian(tryParse<Record<string, string>>(det.kepribadian, {}));
      const b = tryParse<Beasiswa[]>(det.beasiswa, []);
      while (b.length < 3) b.push({ tahun: '', dari: '' });
      setBeasiswa(b.slice(0, 3));
      const kh = tryParse<KehadiranRow[]>(det.kehadiran, []);
      setKehadiran(KOSONG_KEHADIRAN().map((k, i) => ({ ...k, ...(kh[i] ?? {}) })));
      const nk = tryParse<NilaiKepala[]>(det.nilaiKepala, []);
      setNilaiKepala(KOSONG_KEPALA().map((k, i) => ({ ...k, ...(nk[i] ?? {}) })));
      const nm = tryParse<NilaiRow[]>(det.nilaiMapel, []);
      setNilaiMapel(nm.length ? nm.map((x) => ({ m: x.m ?? '', n: Array.from({ length: 6 }, (_, i) => x.n?.[i] ?? ''), ujian: x.ujian ?? '', ijazah: x.ijazah ?? '' })) : KOSONG_MAPEL());
      const ne = tryParse<NilaiEkskul[]>(det.nilaiEkskul, []);
      const ekskulPrefill = (r.ekskulMemberships ?? []).map((m2) => ({ nama: m2.extracurricular.name, ket: m2.role ?? '' }));
      setNilaiEkskul(KOSONG_EKSKUL().map((k, i) => ({ ...k, ...(ne[i] ?? ekskulPrefill[i] ?? {}) })));
      const nh = tryParse<NilaiHadir>(det.nilaiHadir, KOSONG_HADIR());
      setNilaiHadir({ sakit: Array.from({ length: 6 }, (_, i) => nh.sakit?.[i] ?? ''), izin: Array.from({ length: 6 }, (_, i) => nh.izin?.[i] ?? ''), tk: Array.from({ length: 6 }, (_, i) => nh.tk?.[i] ?? '') });
      const nj = tryParse<NilaiKeputusan[]>(det.nilaiKeputusan, []);
      setNilaiKeputusan(KOSONG_KEPUTUSAN().map((k, i) => ({ ...k, ...(nj[i] ?? {}) })));
    }).catch((e) => setError(e instanceof ApiError ? e.message : 'Gagal memuat.'));
  }, [id]);

  const set = (k: string, v: string) => setD((p) => ({ ...p, [k]: v }));
  const g = (k: string) => d[k] ?? '';
  const setN = (i: number, j: number, v: string) =>
    setNilaiMapel((p) => p.map((x, xi) => xi === i ? { ...x, n: x.n.map((y, yi) => yi === j ? v : y) } : x));
  const setHadir = (f: keyof NilaiHadir, i: number, v: string) =>
    setNilaiHadir((p) => ({ ...p, [f]: p[f].map((x, xi) => xi === i ? v : x) }));

  async function pickPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    setError(null); setNotice(null);
    try {
      await uploadStudentPhoto(id, f);
      setPhotoV((v) => v + 1);
      setS((p) => (p ? { ...p, photoKey: 'set' } : p));
      setNotice('Pas foto diperbarui.');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Gagal mengunggah foto.');
    }
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!s) return;
    setBusy(true); setError(null); setNotice(null);
    try {
      const recordDetails: Details = {
        ...d,
        penyakit: JSON.stringify(penyakit.filter((p) => Object.values(p).some(Boolean))),
        kepribadian: JSON.stringify(kepribadian),
        beasiswa: JSON.stringify(beasiswa.filter((b) => b.tahun || b.dari)),
        kehadiran: JSON.stringify(kehadiran),
        nilaiKepala: JSON.stringify(nilaiKepala),
        nilaiMapel: JSON.stringify(nilaiMapel.filter((x) => x.m || x.n.some(Boolean) || x.ujian || x.ijazah)),
        nilaiEkskul: JSON.stringify(nilaiEkskul.filter((x) => x.nama || x.ket)),
        nilaiHadir: JSON.stringify(nilaiHadir),
        nilaiKeputusan: JSON.stringify(nilaiKeputusan.filter((x) => x.tp || x.ket)),
      };
      await updateStudentRecord(id, {
        nik: nik.trim() || null,
        fatherName: g('ayahNama'), motherName: g('ibuNama'),
        parentOccupation: g('ayahPekerjaan'), parentPhone: g('ayahHp'),
        previousSchool: g('asalSd'), healthNotes: g('kelainan'),
        intelligenceNotes: g('iq'), leavingNotes: g('pindahKeluarAlasan'),
        otherNotes: g('catatan'),
        recordDetails,
      });
      setNotice('Buku induk tersimpan.');
    } catch (err) { setError(err instanceof ApiError ? err.message : 'Gagal menyimpan.'); }
    finally { setBusy(false); }
  }

  const jk = s?.gender === 'MALE' ? 'Laki-laki' : s?.gender === 'FEMALE' ? 'Perempuan' : '';
  const ttl = [s?.birthPlace, s?.birthDate?.slice(0, 10)].filter(Boolean).join(', ');
  // Jumlah & rata-rata tiap kolom semester — dihitung dari nilai angka yang diisi.
  const sumSem = (j: number) => nilaiMapel.reduce((a, x) => a + (Number(x.n[j]) || 0), 0);
  const cntSem = (j: number) => nilaiMapel.filter((x) => Number(x.n[j])).length;

  return (
    <Shell>
      <style>{`
        .induk-doc{max-width:820px;margin:0 auto;background:#fff;color:#111;font-size:12.5pt;padding:28px 36px;}
        .induk-doc h1{text-align:center;font-size:15pt;font-weight:800;letter-spacing:.02em;margin:0}
        .induk-head{display:flex;justify-content:space-between;gap:16px;margin-top:10px}
        .induk-head .hrows{flex:1}
        .photo-box{width:96px;height:128px;border:1.5px solid #111;display:flex;align-items:center;justify-content:center;text-align:center;font-size:9pt;color:#555;flex-shrink:0;overflow:hidden;position:relative;cursor:pointer;background:#fff}
        .photo-box img{width:100%;height:100%;object-fit:cover}
        .induk-row{display:flex;gap:8px;padding:1.5px 0;align-items:baseline}
        .induk-no{width:26px;text-align:right;font-weight:700;flex-shrink:0}
        .induk-label{width:340px;flex-shrink:0}
        .induk-sep{flex-shrink:0}
        .induk-val{flex:1;min-width:0}
        .induk-input{width:100%;border:0;border-bottom:1px dotted #777;background:transparent;padding:0 2px;font:inherit;color:inherit}
        .induk-input:focus{outline:none;border-bottom-color:#000;background:#fffbeb}
        .induk-text{white-space:pre-line}
        .induk-sub{margin-left:60px;padding:1.5px 0;display:flex;gap:8px;align-items:baseline}
        .induk-sub .lbl{width:280px;flex-shrink:0}
        .induk-section{text-align:center;font-weight:800;letter-spacing:.03em;margin:16px 0 6px;text-transform:uppercase}
        .induk-letter{text-align:left;font-weight:800;letter-spacing:.03em;margin:14px 0 4px}
        table.induk-table{border-collapse:collapse;width:100%;font-size:11pt;margin:4px 0}
        table.induk-table th,table.induk-table td{border:1px solid #111;padding:3px 5px;text-align:left;vertical-align:top}
        table.induk-table th{background:#f0f0f0;text-align:center;font-weight:700}
        table.induk-table input{width:100%;border:0;background:transparent;font:inherit;color:inherit;padding:0}
        table.induk-table input:focus{outline:none;background:#fffbeb}
        .page-break{break-before:page;border-top:2px dashed #ccc;margin-top:24px;padding-top:16px}
        @media print{
          aside,header,.no-print{display:none!important}
          #konten{padding:0!important}
          body{background:#fff}
          .induk-doc{padding:0;max-width:none;font-size:11pt}
          .induk-input{border-bottom-color:#999}
        }
      `}</style>

      <div className="no-print mb-3 flex items-center justify-between">
        <Link href={`/kesiswaan/${id}`} className="text-sm font-semibold text-primary-700 hover:text-primary-800">← Detail Siswa</Link>
        <div className="flex gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => window.print()}>🖨 Cetak</Button>
          <Button type="submit" form="induk-form" size="sm" disabled={busy}>{busy ? 'Menyimpan…' : 'Simpan'}</Button>
        </div>
      </div>
      {error ? <p className="no-print mb-3 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
      {notice ? <p className="no-print mb-3 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{notice}</p> : null}
      {!s ? <p className="text-sm text-sand-500">Memuat…</p> : null}

      {s && (
        <form id="induk-form" onSubmit={save}>
          <div className="induk-doc">
            <h1>LEMBAR BUKU INDUK PESERTA DIDIK SMP</h1>
            <div className="induk-head">
              <div className="hrows">
                <div className="induk-row"><span className="induk-label" style={{ width: 120 }}>Nomor Induk</span><span className="induk-sep">:</span><span className="induk-val"><span className="induk-text">{s.nis ?? '—'}</span></span></div>
                <div className="induk-row"><span className="induk-label" style={{ width: 120 }}>NISN</span><span className="induk-sep">:</span><span className="induk-val"><span className="induk-text">{s.nisn ?? '—'}</span></span></div>
                <div className="induk-row"><span className="induk-label" style={{ width: 120 }}>NIK</span><span className="induk-sep">:</span><span className="induk-val"><input className="induk-input" inputMode="numeric" maxLength={16} value={nik} onChange={(e) => setNik(e.target.value.replace(/\D/g, ''))} placeholder="16 digit" /></span></div>
                <div className="induk-row"><span className="induk-label" style={{ width: 120 }}>Waktu Diterima<br />Di Sekolah Ini</span><span className="induk-sep">:</span><span className="induk-val"><T k="waktuDiterima" get={g} set={set} /></span></div>
              </div>
              <div className="photo-box" onClick={() => fileRef.current?.click()} title="Klik untuk unggah pas foto">
                {s.photoKey
                  ? <img src={`${studentPhotoUrl(id)}?v=${photoV}`} alt="Pas foto" />
                  : <>Pas Photo<br />3 x 4 cm</>}
              </div>
              <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={pickPhoto} />
            </div>
            <p className="no-print text-[10px] text-sand-400 mt-1 text-right">Klik kotak foto untuk unggah pas foto (JPG/PNG/WebP) — sinkron ke data siswa.</p>

            <Section title="A. Keterangan Pribadi Siswa" />
            <Row no={1} label="Nama Lengkap"><span className="induk-text"><b>{s.name}</b></span></Row>
            <Row no={2} label="Nama Panggilan"><T k="panggilan" get={g} set={set} /></Row>
            <Row no={3} label="Jenis Kelamin"><span className="induk-text">{jk || '—'}</span></Row>
            <Row no={4} label="Tempat dan Tanggal Lahir"><span className="induk-text">{ttl || '—'}</span></Row>
            <Row no={5} label="Agama"><T k="agama" ph="Islam" get={g} set={set} /></Row>
            <Row no={6} label="Kewarganegaraan"><T k="kewarganegaraan" ph="Indonesia" get={g} set={set} /></Row>
            <Row no={7} label="Anak ke"><T k="anakKe" get={g} set={set} /></Row>
            <Row no={8} label="Jumlah Saudara">
              <span className="induk-text">
                Kandung : <input className="induk-input" style={{ width: 40 }} value={g('saudaraKandung')} onChange={(e) => set('saudaraKandung', e.target.value)} />
                {'  '}Tiri : <input className="induk-input" style={{ width: 40 }} value={g('saudaraTiri')} onChange={(e) => set('saudaraTiri', e.target.value)} />
                {'  '}Angkat : <input className="induk-input" style={{ width: 40 }} value={g('saudaraAngkat')} onChange={(e) => set('saudaraAngkat', e.target.value)} />
              </span>
            </Row>
            <Row no={9} label="Anak yatim/piatu/yatim piatu"><T k="yatim" get={g} set={set} /></Row>
            <Row no={10} label="Bahasa sehari-hari di rumah"><T k="bahasa" get={g} set={set} /></Row>

            <Section title="B. Keterangan Tempat Tinggal Siswa" />
            <Row no={11} label="Alamat Peserta Didik">
              <span className="induk-text">{s.address ?? s.candidate?.address ?? ''} <T k="alamatDetail" get={g} set={set} /></span>
              <SubInput label="Kode Pos" k="kodePos" get={g} set={set} />
              <SubInput label="Telepon/HP pribadi" k="telpPribadi" get={g} set={set} />
            </Row>
            <Row no={12} label="Selama bersekolah tinggal dengan"><T k="tinggalDengan" ph="Orang tua / Nenek / dll" get={g} set={set} /></Row>
            <Row no={13} label="Jarak dari tempat tinggal ke sekolah"><T k="jarakSekolah" get={g} set={set} /></Row>
            <Row no={14} label="Ke sekolah dengan"><T k="transportasi" ph="Jalan kaki / Sepeda / Ojek" get={g} set={set} /></Row>

            <Section title="C. Keterangan Jasmani dan Kesehatan Siswa" />
            <Row no={15} label="Berat badan">
              <span className="induk-text">saat diterima : <input className="induk-input" style={{ width: 50 }} value={g('beratTerima')} onChange={(e) => set('beratTerima', e.target.value)} /> kg{'   '}saat meninggalkan sekolah : <input className="induk-input" style={{ width: 50 }} value={g('beratKeluar')} onChange={(e) => set('beratKeluar', e.target.value)} /> kg</span>
            </Row>
            <Row no={16} label="Tinggi badan">
              <span className="induk-text">saat diterima : <input className="induk-input" style={{ width: 50 }} value={g('tinggiTerima')} onChange={(e) => set('tinggiTerima', e.target.value)} /> cm{'   '}saat meninggalkan sekolah : <input className="induk-input" style={{ width: 50 }} value={g('tinggiKeluar')} onChange={(e) => set('tinggiKeluar', e.target.value)} /> cm</span>
            </Row>
            <Row no={17} label="Golongan Darah"><T k="golDarah" get={g} set={set} /></Row>
            <Row no={18} label="Penyakit yang pernah diderita (sakit berat yang memerlukan perawatan khusus)">
              <table className="induk-table">
                <thead><tr><th style={{ width: 28 }}>No</th><th>Jenis Penyakit</th><th style={{ width: 60 }}>Kelas</th><th style={{ width: 60 }}>Tahun</th><th style={{ width: 80 }}>Lama Sakit</th><th>Keterangan</th><th className="no-print" style={{ width: 30 }}></th></tr></thead>
                <tbody>
                  {penyakit.map((p, i) => (
                    <tr key={i}>
                      <td style={{ textAlign: 'center' }}>{i + 1}</td>
                      {(['jenis', 'kelas', 'tahun', 'lama', 'ket'] as const).map((f) => (
                        <td key={f}><input value={p[f]} onChange={(e) => setPenyakit((ps) => ps.map((x, xi) => xi === i ? { ...x, [f]: e.target.value } : x))} /></td>
                      ))}
                      <td className="no-print"><button type="button" onClick={() => setPenyakit((ps) => ps.filter((_, xi) => xi !== i))} className="text-red-600">✕</button></td>
                    </tr>
                  ))}
                  {penyakit.length === 0 ? <tr><td colSpan={7} style={{ textAlign: 'center', color: '#888' }}>— tidak ada —</td></tr> : null}
                </tbody>
              </table>
              <button type="button" className="no-print text-xs font-bold text-primary-700" onClick={() => setPenyakit((ps) => [...ps, { jenis: '', kelas: '', tahun: '', lama: '', ket: '' }])}>+ baris</button>
            </Row>
            <Row no={19} label="Kelainan Jasmaniah Lainnya"><T k="kelainan" get={g} set={set} /></Row>

            <Section title="D. Keterangan tentang Pendidikan Sebelumnya" />
            <Row no={20} label="Diterima di sekolah ini sebagai siswa baru tanggal"><T k="diterimaTgl" get={g} set={set} /></Row>
            <Sub label="Asal Sekolah Dasar"><input className="induk-input" value={g('asalSd') || (s.previousSchool ?? '')} onChange={(e) => set('asalSd', e.target.value)} /></Sub>
            <SubInput label="Alamat" k="sdAlamat" get={g} set={set} />
            <SubInput label="Tanggal dan No. Ijazah" k="sdIjazah" get={g} set={set} />
            <Row no={21} label="Diterima di sekolah ini sebagai siswa pindahan pada tanggal"><T k="pindahTgl" get={g} set={set} /></Row>
            <SubInput label="Di kelas" k="pindahKelas" get={g} set={set} />
            <SubInput label="Dari SMP" k="pindahDariSmp" get={g} set={set} />
            <SubInput label="Alamat" k="pindahSmpAlamat" get={g} set={set} />
            <SubInput label="Asal SD/No. Ijazah" k="pindahAsalSd" get={g} set={set} />
            <SubInput label="Alasan pindah ke sekolah ini" k="pindahAlasan" get={g} set={set} />

            <Section title="E. Keterangan tentang Orang Tua Kandung" />
            <Row no={22} label="Data orang tua kandung"><span /></Row>
            <table className="induk-table">
              <thead><tr><th style={{ width: 190 }}></th><th>Ayah</th><th>Ibu</th></tr></thead>
              <tbody>
                {([
                  ['Nama', 'ayahNama', 'ibuNama'],
                  ['Tempat, Tanggal Lahir', 'ayahTtl', 'ibuTtl'],
                  ['Kewarganegaraan', 'ayahWarga', 'ibuWarga'],
                  ['Pendidikan Terakhir', 'ayahPendidikan', 'ibuPendidikan'],
                  ['Pekerjaan', 'ayahPekerjaan', 'ibuPekerjaan'],
                  ['Penghasilan/ bulan', 'ayahPenghasilan', 'ibuPenghasilan'],
                  ['Alamat', 'ayahAlamat', 'ibuAlamat'],
                  ['No HP', 'ayahHp', 'ibuHp'],
                ] as const).map(([lbl, ka, ki]) => (
                  <tr key={lbl}>
                    <td>{lbl}</td>
                    <td><input value={g(ka)} onChange={(e) => set(ka, e.target.value)} placeholder={ka === 'ayahNama' ? (s.fatherName ?? '') : ka === 'ayahPekerjaan' ? (s.parentOccupation ?? '') : ka === 'ayahHp' ? (s.parentPhone ?? s.parent?.phone ?? '') : ''} /></td>
                    <td><input value={g(ki)} onChange={(e) => set(ki, e.target.value)} placeholder={ki === 'ibuNama' ? (s.motherName ?? '') : ''} /></td>
                  </tr>
                ))}
              </tbody>
            </table>

            <Section title="F. Keterangan tentang Wali" />
            <Row no={23} label="Data wali"><span /></Row>
            <table className="induk-table">
              <thead><tr><th style={{ width: 190 }}></th><th>Laki-laki</th><th>Perempuan</th></tr></thead>
              <tbody>
                {([
                  ['Nama', 'waliLNama', 'waliPNama'],
                  ['Tempat & tanggal lahir', 'waliLTtl', 'waliPTtl'],
                  ['Kewarganegaraan', 'waliLWarga', 'waliPWarga'],
                  ['Pendidikan tertinggi', 'waliLPendidikan', 'waliPPendidikan'],
                  ['Pekerjaan', 'waliLPekerjaan', 'waliPPekerjaan'],
                  ['Penghasilan/bulan/tahun', 'waliLPenghasilan', 'waliPPenghasilan'],
                  ['Alamat', 'waliLAlamat', 'waliPAlamat'],
                  ['Hubungan dengan peserta didik', 'waliLHubungan', 'waliPHubungan'],
                ] as const).map(([lbl, kl, kp]) => (
                  <tr key={lbl}>
                    <td>{lbl}</td>
                    <td><input value={g(kl)} onChange={(e) => set(kl, e.target.value)} /></td>
                    <td><input value={g(kp)} onChange={(e) => set(kp, e.target.value)} /></td>
                  </tr>
                ))}
              </tbody>
            </table>

            <Section title="G. Keterangan Intelegensi, Kepribadian dan Prestasi Siswa" />
            <Row no={24} label="Inteligensi (IQ)">
              <input className="induk-input" style={{ width: 70 }} value={g('iq')} onChange={(e) => set('iq', e.target.value)} />
              <span className="induk-text">{'  '}Berdasarkan tes tanggal : <input className="induk-input" style={{ width: 120 }} value={g('iqTesTanggal')} onChange={(e) => set('iqTesTanggal', e.target.value)} /></span>
            </Row>
            <Row no={25} label="Kepribadian"><span /></Row>
            <table className="induk-table">
              <thead><tr><th style={{ width: 30 }}>No</th><th>Aspek yang dinilai</th><th style={{ width: 70 }}>Baik</th><th style={{ width: 70 }}>Cukup</th><th style={{ width: 70 }}>Kurang</th></tr></thead>
              <tbody>
                {KEPRIBADIAN.map(([k, lbl], i) => (
                  <tr key={k}>
                    <td style={{ textAlign: 'center' }}>{i + 1}</td>
                    <td>{lbl}</td>
                    {(['B', 'C', 'K'] as const).map((v) => (
                      <td key={v} style={{ textAlign: 'center', cursor: 'pointer' }} onClick={() => setKepribadian((p) => ({ ...p, [k]: p[k] === v ? '' : v }))}>
                        {kepribadian[k] === v ? '✓' : ''}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            <Row no={26} label="Keikutsertaan/Prestasi yang pernah dicapai dalam bidang"><span /></Row>
            <SubInput label="a. Kesenian" k="prestasiKesenian" get={g} set={set} />
            <SubInput label="b. Olahraga" k="prestasiOlahraga" get={g} set={set} />
            <SubInput label="c. Organisasi" k="prestasiOrganisasi" get={g} set={set} />
            <SubInput label="d. Pramuka" k="prestasiPramuka" get={g} set={set} />
            <SubInput label="e. Karya Tulis" k="prestasiKaryaTulis" get={g} set={set} />
            <SubInput label="f. Lainnya" k="prestasiLain" get={g} set={set} />
            {/* Prestasi & ekskul terekam — sinkron otomatis dengan detail siswa */}
            {(s.achievements?.length ?? 0) > 0 || (s.ekskulMemberships?.length ?? 0) > 0 ? (
              <div className="induk-sub" style={{ display: 'block' }}>
                {(s.ekskulMemberships?.length ?? 0) > 0 ? (
                  <p style={{ margin: '2px 0' }}>
                    <span className="lbl" style={{ display: 'inline-block' }}>Ekstrakurikuler (otomatis)</span>
                    : {s.ekskulMemberships!.map((m) => [m.extracurricular.name, m.role].filter(Boolean).join(' — ')).join(', ')}
                  </p>
                ) : null}
                {(s.achievements?.length ?? 0) > 0 ? (
                  <p style={{ margin: '2px 0' }}>
                    <span className="lbl" style={{ display: 'inline-block' }}>Prestasi terekam (otomatis)</span>
                    : {s.achievements!.map((a) => [a.title, a.level, a.year].filter(Boolean).join(' — ')).join('; ')}
                  </p>
                ) : null}
              </div>
            ) : null}
            <Row no={27} label="Penerimaan bea siswa"><span /></Row>
            {beasiswa.map((b, i) => (
              <div key={i} className="induk-sub">
                <span className="lbl">Tahun <input className="induk-input" style={{ width: 70 }} value={b.tahun} onChange={(e) => setBeasiswa((bs) => bs.map((x, xi) => xi === i ? { ...x, tahun: e.target.value } : x))} /></span>
                <span>Dari :</span>
                <input className="induk-input" value={b.dari} onChange={(e) => setBeasiswa((bs) => bs.map((x, xi) => xi === i ? { ...x, dari: e.target.value } : x))} />
              </div>
            ))}

            <Section title="H. Keterangan Kehadiran" />
            <Row no={28} label="Jumlah hari kehadiran tiap semester"><span /></Row>
            <table className="induk-table" style={{ fontSize: '10pt' }}>
              <thead>
                <tr>
                  <th rowSpan={2}>Kelas/semester</th>
                  <th colSpan={2}>Hadir</th>
                  <th colSpan={5}>Tidak hadir karena</th>
                  <th rowSpan={2}>Jumlah hari belajar efektif</th>
                </tr>
                <tr><th>Jumlah</th><th>%</th><th>Sakit</th><th>Izin</th><th>Alpa</th><th>Jumlah</th><th>%</th></tr>
              </thead>
              <tbody>
                {kehadiran.map((kh, i) => (
                  <tr key={i}>
                    <td>
                      <input style={{ width: 46 }} placeholder="Kls" value={kh.kelas} onChange={(e) => setKehadiran((p) => p.map((x, xi) => xi === i ? { ...x, kelas: e.target.value } : x))} />
                      {' '}/ smt {i % 2 === 0 ? 1 : 2}
                    </td>
                    {(['hadir', 'hadirPct', 'sakit', 'izin', 'alpa', 'jml', 'pct', 'efektif'] as const).map((f) => (
                      <td key={f}><input value={kh[f]} onChange={(e) => setKehadiran((p) => p.map((x, xi) => xi === i ? { ...x, [f]: e.target.value } : x))} /></td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>

            <Section title="I. Meninggalkan Sekolah" />
            <Row no={29} label="Tamat Belajar">
              <span className="induk-text">Tanggal : <input className="induk-input" style={{ width: 110 }} value={g('tamatTgl')} onChange={(e) => set('tamatTgl', e.target.value)} />{'  '}No Ijazah : <input className="induk-input" style={{ width: 130 }} value={g('tamatIjazah')} onChange={(e) => set('tamatIjazah', e.target.value)} /></span>
              <SubInput label="Melanjutkan sekolah ke" k="lanjutKe" get={g} set={set} />
              <SubInput label="Alamat" k="lanjutAlamat" get={g} set={set} />
            </Row>
            <Row no={30} label="Pindah Sekolah ke"><T k="pindahKeSekolah" get={g} set={set} /></Row>
            <Sub label="Tanggal Pindah / Dari Kelas"><input className="induk-input" style={{ width: 90 }} value={g('pindahKeluarTgl')} onChange={(e) => set('pindahKeluarTgl', e.target.value)} /> / <input className="induk-input" style={{ width: 60 }} value={g('pindahDariKelas')} onChange={(e) => set('pindahDariKelas', e.target.value)} /></Sub>
            <SubInput label="Alamat Sekolah" k="pindahAlamatSekolah" get={g} set={set} />
            <SubInput label="Alasan Pindah" k="pindahKeluarAlasan" get={g} set={set} />
            <Row no={31} label="Putus Sekolah">
              <span className="induk-text">Tanggal : <input className="induk-input" style={{ width: 110 }} value={g('putusTgl')} onChange={(e) => set('putusTgl', e.target.value)} />{'  '}Alasan : <input className="induk-input" style={{ width: 200 }} value={g('putusAlasan')} onChange={(e) => set('putusAlasan', e.target.value)} /></span>
            </Row>

            <Section title="J. Lain-Lain" />
            <Row no={32} label="Catatan penting selama siswa belajar di sekolah ini"><span /></Row>
            <textarea className="induk-input" rows={4} style={{ border: '1px dotted #777', width: '100%', marginTop: 4 }} value={g('catatan')} placeholder={s.otherNotes ?? ''} onChange={(e) => set('catatan', e.target.value)} />

            {/* ===== Lembar Daftar Nilai — halaman lanjutan buku induk ===== */}
            <div className="page-break">
              <h1>LEMBAR BUKU INDUK — DAFTAR NILAI</h1>
              <div className="induk-head">
                <div className="hrows">
                  <div className="induk-row"><span className="induk-label" style={{ width: 90 }}>Nama Siswa</span><span className="induk-sep">:</span><span className="induk-val"><b>{s.name}</b></span></div>
                  <div className="induk-row"><span className="induk-label" style={{ width: 90 }}>NIS / NISN</span><span className="induk-sep">:</span><span className="induk-val">{s.nis ?? '—'} / {s.nisn ?? '—'}</span></div>
                </div>
                <div className="photo-box" style={{ cursor: 'default' }}>{s.photoKey ? <img src={`${studentPhotoUrl(id)}?v=${photoV}`} alt="" /> : <>Pas<br />Photo</>}</div>
              </div>
              <div style={{ display: 'flex', gap: 12, margin: '8px 0', fontSize: '10.5pt' }}>
                {nilaiKepala.map((k, i) => (
                  <div key={i} style={{ flex: 1, border: '1px solid #111', padding: '3px 6px' }}>
                    <div>Tahun Pelajaran : <input className="induk-input" style={{ width: 74 }} value={k.tp} placeholder="20../20.." onChange={(e) => setNilaiKepala((p) => p.map((x, xi) => xi === i ? { ...x, tp: e.target.value } : x))} /></div>
                    <div>Kelas : <input className="induk-input" style={{ width: 50 }} value={k.kelas} placeholder={`${7 + i}`} onChange={(e) => setNilaiKepala((p) => p.map((x, xi) => xi === i ? { ...x, kelas: e.target.value } : x))} />{' '}<span style={{ color: '#555' }}>(smt {i * 2 + 1} &amp; {i * 2 + 2})</span></div>
                  </div>
                ))}
              </div>
              <table className="induk-table" style={{ fontSize: '10pt' }}>
                <thead>
                  <tr>
                    <th rowSpan={2} style={{ width: 24 }}>No</th>
                    <th rowSpan={2}>Mata Pelajaran</th>
                    <th colSpan={6}>Nilai Akhir Semester</th>
                    <th rowSpan={2} style={{ width: 52 }}>Nilai Ujian</th>
                    <th rowSpan={2} style={{ width: 52 }}>Nilai Ijazah</th>
                    <th rowSpan={2} className="no-print" style={{ width: 24 }}></th>
                  </tr>
                  <tr>{[1, 2, 3, 4, 5, 6].map((x) => <th key={x} style={{ width: 40 }}>S{x}</th>)}</tr>
                </thead>
                <tbody>
                  {nilaiMapel.map((r, i) => (
                    <tr key={i}>
                      <td style={{ textAlign: 'center' }}>{i + 1}</td>
                      <td><input value={r.m} onChange={(e) => setNilaiMapel((p) => p.map((x, xi) => xi === i ? { ...x, m: e.target.value } : x))} /></td>
                      {r.n.map((v, j) => (
                        <td key={j}><input value={v} onChange={(e) => setN(i, j, e.target.value)} /></td>
                      ))}
                      <td><input value={r.ujian} onChange={(e) => setNilaiMapel((p) => p.map((x, xi) => xi === i ? { ...x, ujian: e.target.value } : x))} /></td>
                      <td><input value={r.ijazah} onChange={(e) => setNilaiMapel((p) => p.map((x, xi) => xi === i ? { ...x, ijazah: e.target.value } : x))} /></td>
                      <td className="no-print"><button type="button" onClick={() => setNilaiMapel((p) => p.filter((_, xi) => xi !== i))} className="text-red-600">✕</button></td>
                    </tr>
                  ))}
                  <tr style={{ fontWeight: 700, background: '#f7f7f7' }}>
                    <td /><td>Jumlah Nilai</td>
                    {[0, 1, 2, 3, 4, 5].map((j) => <td key={j} style={{ textAlign: 'center' }}>{sumSem(j) || ''}</td>)}
                    <td /><td /><td className="no-print" />
                  </tr>
                  <tr style={{ fontWeight: 700, background: '#f7f7f7' }}>
                    <td /><td>Rata-rata</td>
                    {[0, 1, 2, 3, 4, 5].map((j) => <td key={j} style={{ textAlign: 'center' }}>{cntSem(j) ? (sumSem(j) / cntSem(j)).toFixed(1).replace('.', ',') : ''}</td>)}
                    <td /><td /><td className="no-print" />
                  </tr>
                </tbody>
              </table>
              <button type="button" className="no-print text-xs font-bold text-primary-700" onClick={() => setNilaiMapel((p) => [...p, { m: '', n: Array(6).fill(''), ujian: '', ijazah: '' }])}>+ baris mapel</button>

              <div style={{ display: 'flex', gap: 14, marginTop: 10, fontSize: '10.5pt' }}>
                <div style={{ flex: 1 }}>
                  <p style={{ fontWeight: 800, textTransform: 'uppercase', marginBottom: 2 }}>Ekstrakurikuler</p>
                  <table className="induk-table" style={{ fontSize: '10pt' }}>
                    <thead><tr><th style={{ width: 24 }}>No</th><th>Ekstrakurikuler</th><th>Keterangan</th></tr></thead>
                    <tbody>
                      {nilaiEkskul.map((x, i) => (
                        <tr key={i}>
                          <td style={{ textAlign: 'center' }}>{i + 1}</td>
                          <td><input value={x.nama} onChange={(e) => setNilaiEkskul((p) => p.map((y, yi) => yi === i ? { ...y, nama: e.target.value } : y))} /></td>
                          <td><input value={x.ket} onChange={(e) => setNilaiEkskul((p) => p.map((y, yi) => yi === i ? { ...y, ket: e.target.value } : y))} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div style={{ flex: 1 }}>
                  <p style={{ fontWeight: 800, textTransform: 'uppercase', marginBottom: 2 }}>Ketidakhadiran (hari)</p>
                  <table className="induk-table" style={{ fontSize: '10pt' }}>
                    <thead><tr><th>Semester</th><th>Sakit</th><th>Izin</th><th>Tanpa Ket.</th></tr></thead>
                    <tbody>
                      {[0, 1, 2, 3, 4, 5].map((i) => (
                        <tr key={i}>
                          <td style={{ textAlign: 'center' }}>{i + 1}</td>
                          <td><input value={nilaiHadir.sakit[i]} onChange={(e) => setHadir('sakit', i, e.target.value)} /></td>
                          <td><input value={nilaiHadir.izin[i]} onChange={(e) => setHadir('izin', i, e.target.value)} /></td>
                          <td><input value={nilaiHadir.tk[i]} onChange={(e) => setHadir('tk', i, e.target.value)} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div style={{ display: 'flex', gap: 14, marginTop: 8, fontSize: '10.5pt' }}>
                <div style={{ flex: 2 }}>
                  <p style={{ fontWeight: 800, textTransform: 'uppercase', marginBottom: 2 }}>Keputusan Akhir Tahun Pelajaran</p>
                  <table className="induk-table" style={{ fontSize: '10pt' }}>
                    <thead><tr><th style={{ width: 90 }}>Th. Pelajaran</th><th>Keputusan (Naik/Tidak Naik ke Kelas …)</th></tr></thead>
                    <tbody>
                      {nilaiKeputusan.map((x, i) => (
                        <tr key={i}>
                          <td><input value={x.tp} placeholder={nilaiKepala[i]?.tp || '20../20..'} onChange={(e) => setNilaiKeputusan((p) => p.map((y, yi) => yi === i ? { ...y, tp: e.target.value } : y))} /></td>
                          <td><input value={x.ket} onChange={(e) => setNilaiKeputusan((p) => p.map((y, yi) => yi === i ? { ...y, ket: e.target.value } : y))} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div style={{ flex: 1 }}>
                  <p style={{ fontWeight: 800, textTransform: 'uppercase', marginBottom: 2 }}>Nomor Seri Ijazah</p>
                  <input className="induk-input" value={g('noSeriIjazah')} onChange={(e) => set('noSeriIjazah', e.target.value)} style={{ border: '1px solid #111', padding: '3px 6px' }} />
                </div>
              </div>
            </div>
          </div>
        </form>
      )}
    </Shell>
  );
}
