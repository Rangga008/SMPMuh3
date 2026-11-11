'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Button } from '@smpmuh3/ui';
import { Shell } from '@/components/shell';
import { getStudentRecord, updateStudentRecord } from '@/lib/api-ops';
import { ApiError } from '@/lib/api';

type Details = Record<string, string>;
type Penyakit = { jenis: string; kelas: string; tahun: string; lama: string; ket: string };
type Beasiswa = { tahun: string; dari: string };

const KEPRIBADIAN = [
  ['disiplin', 'Disiplin/Ketertiban'],
  ['prakarsa', 'Prakarsa/Kreativitas'],
  ['tanggungJawab', 'Tanggung Jawab'],
  ['penyesuaian', 'Penyesuaian Diri'],
  ['emosi', 'Kemantapan Emosi'],
  ['kerjasama', 'Kerjasama'],
] as const;

const tryParse = <T,>(raw: string | undefined, fb: T): T => {
  try { return raw ? (JSON.parse(raw) as T) : fb; } catch { return fb; }
};

/** Lembar Buku Induk Peserta Didik — layout mengikuti format Dapodik (docx referensi). */
export default function BukuIndukPage() {
  const { id } = useParams<{ id: string }>();
  const [s, setS] = useState<Awaited<ReturnType<typeof getStudentRecord>> | null>(null);
  const [d, setD] = useState<Details>({});
  const [penyakit, setPenyakit] = useState<Penyakit[]>([]);
  const [kepribadian, setKepribadian] = useState<Record<string, string>>({});
  const [beasiswa, setBeasiswa] = useState<Beasiswa[]>([{ tahun: '', dari: '' }, { tahun: '', dari: '' }, { tahun: '', dari: '' }]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    getStudentRecord(id).then((r) => {
      setS(r);
      const det = { ...(r.recordDetails ?? {}) } as Details;
      // Prefill dari kolom kanonik siswa agar buku induk sinkron dengan
      // data diri — kolom ini juga ditulis balik saat simpan.
      if (!det.ayahNama) det.ayahNama = r.fatherName ?? '';
      if (!det.ibuNama) det.ibuNama = r.motherName ?? '';
      if (!det.ayahPekerjaan) det.ayahPekerjaan = r.parentOccupation ?? '';
      if (!det.ayahHp) det.ayahHp = r.parentPhone ?? r.parent?.phone ?? '';
      if (!det.waliNama) det.waliNama = r.parent?.name ?? '';
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
    }).catch((e) => setError(e instanceof ApiError ? e.message : 'Gagal memuat.'));
  }, [id]);

  const set = (k: string, v: string) => setD((p) => ({ ...p, [k]: v }));
  const g = (k: string) => d[k] ?? '';

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
      };
      await updateStudentRecord(id, {
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

  // Baris item bernomor ala buku induk: "1  Nama Lengkap : _______"
  const Row = ({ no, label, children }: { no: number | string; label: string; children: React.ReactNode }) => (
    <div className="induk-row">
      <span className="induk-no">{no}</span>
      <span className="induk-label">{label}</span>
      <span className="induk-sep">:</span>
      <span className="induk-val">{children}</span>
    </div>
  );
  const T = ({ k, ph, ro }: { k: string; ph?: string; ro?: string }) =>
    ro !== undefined
      ? <span className="induk-text">{ro || '—'}</span>
      : <input className="induk-input" value={g(k)} placeholder={ph} onChange={(e) => set(k, e.target.value)} />;
  const Section = ({ title }: { title: string }) => <h3 className="induk-section">{title}</h3>;

  const jk = s?.gender === 'MALE' ? 'Laki-laki' : s?.gender === 'FEMALE' ? 'Perempuan' : '';
  const ttl = [s?.birthPlace, s?.birthDate?.slice(0, 10)].filter(Boolean).join(', ');

  return (
    <Shell>
      <style>{`
        .induk-doc{max-width:820px;margin:0 auto;background:#fff;color:#111;font-size:12.5pt;padding:28px 36px;}
        .induk-doc h1{text-align:center;font-size:15pt;font-weight:800;letter-spacing:.02em;margin:0}
        .induk-head{display:flex;justify-content:space-between;gap:16px;margin-top:10px}
        .induk-head .hrows{flex:1}
        .photo-box{width:96px;height:128px;border:1.5px solid #111;display:flex;align-items:center;justify-content:center;text-align:center;font-size:9pt;color:#555;flex-shrink:0}
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
        table.induk-table{border-collapse:collapse;width:100%;font-size:11pt;margin:4px 0}
        table.induk-table th,table.induk-table td{border:1px solid #111;padding:3px 5px;text-align:left;vertical-align:top}
        table.induk-table th{background:#f0f0f0;text-align:center;font-weight:700}
        table.induk-table input{width:100%;border:0;background:transparent;font:inherit;color:inherit;padding:0}
        table.induk-table input:focus{outline:none;background:#fffbeb}
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
                <div className="induk-row"><span className="induk-label" style={{ width: 120 }}>Waktu Diterima<br />Di Sekolah Ini</span><span className="induk-sep">:</span><span className="induk-val"><T k="waktuDiterima" /></span></div>
              </div>
              <div className="photo-box">Pas Photo<br />3 x 4 cm</div>
            </div>

            <Section title="Keterangan Pribadi Siswa" />
            <Row no={1} label="Nama Lengkap"><span className="induk-text"><b>{s.name}</b></span></Row>
            <Row no={2} label="Nama Panggilan"><T k="panggilan" /></Row>
            <Row no={3} label="Jenis Kelamin"><span className="induk-text">{jk || '—'}</span></Row>
            <Row no={4} label="Tempat dan Tanggal Lahir"><span className="induk-text">{ttl || '—'}</span></Row>
            <Row no={5} label="Agama"><T k="agama" ph="Islam" /></Row>
            <Row no={6} label="Kewarganegaraan"><T k="kewarganegaraan" ph="Indonesia" /></Row>
            <Row no={7} label="Anak ke"><T k="anakKe" /></Row>
            <Row no={8} label="Jumlah Saudara">
              <span className="induk-text">
                Kandung : <input className="induk-input" style={{ width: 40 }} value={g('saudaraKandung')} onChange={(e) => set('saudaraKandung', e.target.value)} />
                {'  '}Tiri : <input className="induk-input" style={{ width: 40 }} value={g('saudaraTiri')} onChange={(e) => set('saudaraTiri', e.target.value)} />
                {'  '}Angkat : <input className="induk-input" style={{ width: 40 }} value={g('saudaraAngkat')} onChange={(e) => set('saudaraAngkat', e.target.value)} />
              </span>
            </Row>
            <Row no={9} label="Anak yatim/piatu/yatim piatu"><T k="yatim" /></Row>
            <Row no={10} label="Bahasa sehari-hari di rumah"><T k="bahasa" /></Row>

            <Section title="Keterangan Tempat Tinggal Siswa" />
            <Row no={11} label="Alamat Peserta Didik">
              <span className="induk-text">{s.address ?? s.candidate?.address ?? ''} <T k="alamatDetail" /></span>
              <span className="induk-sub"><span className="lbl">Kode Pos</span><span>:</span><input className="induk-input" value={g('kodePos')} onChange={(e) => set('kodePos', e.target.value)} /></span>
              <span className="induk-sub"><span className="lbl">Telepon/HP pribadi</span><span>:</span><input className="induk-input" value={g('telpPribadi')} onChange={(e) => set('telpPribadi', e.target.value)} /></span>
            </Row>
            <Row no={12} label="Selama bersekolah tinggal dengan"><T k="tinggalDengan" ph="Orang tua / Nenek / dll" /></Row>
            <Row no={13} label="Jarak dari tempat tinggal ke sekolah"><T k="jarakSekolah" /></Row>
            <Row no={14} label="Ke sekolah dengan"><T k="transportasi" ph="Jalan kaki / Sepeda / Ojek" /></Row>

            <Section title="Keterangan Jasmani dan Kesehatan Siswa" />
            <Row no={15} label="Berat badan">
              <span className="induk-text">saat diterima : <input className="induk-input" style={{ width: 50 }} value={g('beratTerima')} onChange={(e) => set('beratTerima', e.target.value)} /> kg{'   '}saat meninggalkan sekolah : <input className="induk-input" style={{ width: 50 }} value={g('beratKeluar')} onChange={(e) => set('beratKeluar', e.target.value)} /> kg</span>
            </Row>
            <Row no={16} label="Tinggi badan">
              <span className="induk-text">saat diterima : <input className="induk-input" style={{ width: 50 }} value={g('tinggiTerima')} onChange={(e) => set('tinggiTerima', e.target.value)} /> cm{'   '}saat meninggalkan sekolah : <input className="induk-input" style={{ width: 50 }} value={g('tinggiKeluar')} onChange={(e) => set('tinggiKeluar', e.target.value)} /> cm</span>
            </Row>
            <Row no={17} label="Golongan Darah"><T k="golDarah" /></Row>
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
            <Row no={19} label="Kelainan Jasmaniah Lainnya"><T k="kelainan" /></Row>

            <Section title="Keterangan tentang Pendidikan Sebelumnya" />
            <Row no={20} label="Diterima di sekolah ini sebagai siswa baru tanggal"><T k="diterimaTgl" /></Row>
            <div className="induk-sub"><span className="lbl">Asal Sekolah Dasar</span><span>:</span><input className="induk-input" value={g('asalSd') || (s.previousSchool ?? '')} onChange={(e) => set('asalSd', e.target.value)} /></div>
            <div className="induk-sub"><span className="lbl">Alamat</span><span>:</span><input className="induk-input" value={g('sdAlamat')} onChange={(e) => set('sdAlamat', e.target.value)} /></div>
            <div className="induk-sub"><span className="lbl">Tanggal dan No. Ijazah</span><span>:</span><input className="induk-input" value={g('sdIjazah')} onChange={(e) => set('sdIjazah', e.target.value)} /></div>
            <Row no={21} label="Diterima di sekolah ini sebagai siswa pindahan pada tanggal"><T k="pindahTgl" /></Row>
            <div className="induk-sub"><span className="lbl">Di kelas</span><span>:</span><input className="induk-input" value={g('pindahKelas')} onChange={(e) => set('pindahKelas', e.target.value)} /></div>
            <div className="induk-sub"><span className="lbl">Dari SMP</span><span>:</span><input className="induk-input" value={g('pindahDariSmp')} onChange={(e) => set('pindahDariSmp', e.target.value)} /></div>
            <div className="induk-sub"><span className="lbl">Alamat</span><span>:</span><input className="induk-input" value={g('pindahSmpAlamat')} onChange={(e) => set('pindahSmpAlamat', e.target.value)} /></div>
            <div className="induk-sub"><span className="lbl">Asal SD/No. Ijazah</span><span>:</span><input className="induk-input" value={g('pindahAsalSd')} onChange={(e) => set('pindahAsalSd', e.target.value)} /></div>
            <div className="induk-sub"><span className="lbl">Alasan pindah ke sekolah ini</span><span>:</span><input className="induk-input" value={g('pindahAlasan')} onChange={(e) => set('pindahAlasan', e.target.value)} /></div>

            <Section title="Keterangan tentang Orang Tua Kandung" />
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

            <Section title="Keterangan tentang Wali" />
            <Row no={23} label="Nama"><T k="waliNama" /></Row>
            <div className="induk-sub"><span className="lbl">Tempat, Tanggal Lahir</span><span>:</span><input className="induk-input" value={g('waliTtl')} onChange={(e) => set('waliTtl', e.target.value)} /></div>
            <div className="induk-sub"><span className="lbl">Kewarganegaraan</span><span>:</span><input className="induk-input" value={g('waliWarga')} onChange={(e) => set('waliWarga', e.target.value)} /></div>
            <div className="induk-sub"><span className="lbl">Pendidikan terakhir</span><span>:</span><input className="induk-input" value={g('waliPendidikan')} onChange={(e) => set('waliPendidikan', e.target.value)} /></div>
            <div className="induk-sub"><span className="lbl">Pekerjaan</span><span>:</span><input className="induk-input" value={g('waliPekerjaan')} onChange={(e) => set('waliPekerjaan', e.target.value)} /></div>
            <div className="induk-sub"><span className="lbl">Penghasilan/bulan</span><span>:</span><input className="induk-input" value={g('waliPenghasilan')} onChange={(e) => set('waliPenghasilan', e.target.value)} /></div>
            <div className="induk-sub"><span className="lbl">Alamat</span><span>:</span><input className="induk-input" value={g('waliAlamat')} onChange={(e) => set('waliAlamat', e.target.value)} /></div>
            <div className="induk-sub"><span className="lbl">Hubungan dengan Peserta Didik</span><span>:</span><input className="induk-input" value={g('waliHubungan')} onChange={(e) => set('waliHubungan', e.target.value)} /></div>

            <Section title="Keterangan Intelegensi, Kepribadian dan Prestasi Siswa" />
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
            <Row no={26} label="Keikutsertaan/prestasi yang pernah dicapai dalam bidang"><span /></Row>
            <div className="induk-sub"><span className="lbl">a. Kesenian</span><span>:</span><input className="induk-input" value={g('prestasiKesenian')} onChange={(e) => set('prestasiKesenian', e.target.value)} /></div>
            <div className="induk-sub"><span className="lbl">b. Olahraga</span><span>:</span><input className="induk-input" value={g('prestasiOlahraga')} onChange={(e) => set('prestasiOlahraga', e.target.value)} /></div>
            <div className="induk-sub"><span className="lbl">c. Organisasi</span><span>:</span><input className="induk-input" value={g('prestasiOrganisasi')} onChange={(e) => set('prestasiOrganisasi', e.target.value)} /></div>
            <div className="induk-sub"><span className="lbl">d. Pramuka</span><span>:</span><input className="induk-input" value={g('prestasiPramuka')} onChange={(e) => set('prestasiPramuka', e.target.value)} /></div>
            <div className="induk-sub"><span className="lbl">e. Karya Tulis</span><span>:</span><input className="induk-input" value={g('prestasiKaryaTulis')} onChange={(e) => set('prestasiKaryaTulis', e.target.value)} /></div>
            <div className="induk-sub"><span className="lbl">f. Lainnya</span><span>:</span><input className="induk-input" value={g('prestasiLain')} onChange={(e) => set('prestasiLain', e.target.value)} /></div>
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

            <Section title="Keterangan Kehadiran" />
            <Row no={28} label="Jumlah hari kehadiran tiap semester"><span /></Row>
            <table className="induk-table" style={{ fontSize: '10pt' }}>
              <thead>
                <tr>
                  <th rowSpan={2}>Kelas/Semester</th>
                  <th colSpan={2}>Hadir</th>
                  <th colSpan={5}>Tidak hadir karena</th>
                  <th rowSpan={2}>Jumlah hari belajar efektif</th>
                </tr>
                <tr><th>Jumlah</th><th>%</th><th>Sakit</th><th>Izin</th><th>Alpa</th><th>Jumlah</th><th>%</th></tr>
              </thead>
              <tbody>
                {[7, 8, 9].flatMap((k) => ['Semester 1', 'Semester 2'].map((sm) => (
                  <tr key={`${k}${sm}`}><td>{k} / {sm}</td><td /><td /><td /><td /><td /><td /><td /><td /></tr>
                )))}
              </tbody>
            </table>

            <Section title="Meninggalkan Sekolah" />
            <Row no={29} label="Tamat Belajar">
              <span className="induk-text">Tanggal : <input className="induk-input" style={{ width: 110 }} value={g('tamatTgl')} onChange={(e) => set('tamatTgl', e.target.value)} />{'  '}No Ijazah : <input className="induk-input" style={{ width: 130 }} value={g('tamatIjazah')} onChange={(e) => set('tamatIjazah', e.target.value)} /></span>
              <span className="induk-sub"><span className="lbl">Melanjutkan sekolah ke</span><span>:</span><input className="induk-input" value={g('lanjutKe')} onChange={(e) => set('lanjutKe', e.target.value)} /></span>
              <span className="induk-sub"><span className="lbl">Alamat</span><span>:</span><input className="induk-input" value={g('lanjutAlamat')} onChange={(e) => set('lanjutAlamat', e.target.value)} /></span>
            </Row>
            <Row no={30} label="Pindah Sekolah ke"><T k="pindahKeSekolah" /></Row>
            <div className="induk-sub"><span className="lbl">Tanggal Pindah / Dari Kelas</span><span>:</span><input className="induk-input" style={{ width: 90 }} value={g('pindahKeluarTgl')} onChange={(e) => set('pindahKeluarTgl', e.target.value)} /> / <input className="induk-input" style={{ width: 60 }} value={g('pindahDariKelas')} onChange={(e) => set('pindahDariKelas', e.target.value)} /></div>
            <div className="induk-sub"><span className="lbl">Alamat Sekolah</span><span>:</span><input className="induk-input" value={g('pindahAlamatSekolah')} onChange={(e) => set('pindahAlamatSekolah', e.target.value)} /></div>
            <div className="induk-sub"><span className="lbl">Alasan Pindah</span><span>:</span><input className="induk-input" value={g('pindahKeluarAlasan')} onChange={(e) => set('pindahKeluarAlasan', e.target.value)} /></div>
            <Row no={31} label="Putus Sekolah">
              <span className="induk-text">Tanggal : <input className="induk-input" style={{ width: 110 }} value={g('putusTgl')} onChange={(e) => set('putusTgl', e.target.value)} />{'  '}Alasan : <input className="induk-input" style={{ width: 200 }} value={g('putusAlasan')} onChange={(e) => set('putusAlasan', e.target.value)} /></span>
            </Row>

            <Section title="Lain-Lain" />
            <Row no={32} label="Catatan penting selama siswa belajar di sekolah ini"><span /></Row>
            <textarea className="induk-input" rows={4} style={{ border: '1px dotted #777', width: '100%', marginTop: 4 }} value={g('catatan')} placeholder={s.otherNotes ?? ''} onChange={(e) => set('catatan', e.target.value)} />
          </div>
        </form>
      )}
    </Shell>
  );
}
