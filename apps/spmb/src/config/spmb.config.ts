/**
 * SPMB landing page content — CONFIGURABLE DATA.
 *
 * Confirmed by the school (via coordinator):
 *  - Tahun ajaran 2027/2028
 *  - Gelombang 1: 1 November 2026 – Desember 2026
 *  - Alur: akun → data dasar → bayar pendaftaran → formulir + dokumen →
 *    verifikasi → pembayaran DP → psikotes → pengumuman → daftar ulang
 *  - Biaya: pendaftaran Rp250.000, DSP Rp2.800.000, SPP Rp250.000, seragam Rp1.700.000
 *  - Jalur: reguler, afirmasi, prestasi (akademik, tahfidz 25%/50%, non-akademik, alumni SDM)
 *  - Jargon: Inisiatif, Kreatif, Religius, Optimis
 *
 * Contact details still pending official values — update `contact` below.
 */

export type RegistrationStatus = 'open' | 'soon' | 'closed';
export type WaveStatus = 'active' | 'soon' | 'closed';

export interface SpmbConfig {
  school: {
    name: string;
    shortName: string;
    accreditation: string;
    tagline: string;
    jargon: string[];
    description: string;
  };
  academicYear: string;
  registration: {
    status: RegistrationStatus;
    wave: string;
    periodLabel: string;
    note: string;
  };
  cta: {
    register: { href: string; label: string };
    checkStatus: { href: string; label: string };
  };
  flow: { title: string; detail: string }[];
  requirements: string[];
  terms: string[];
  waves: { name: string; period: string; status: WaveStatus }[];
  documents: { label: string; optional?: boolean }[];
  guides: { title: string; description: string; href: string | null }[];
  pathways: { name: string; description: string; points?: string[] }[];
  fees: {
    label: string;
    amount: number;
    stage: string;
    note?: string;
  }[];
  payments: { title: string; description: string }[];
  faq: { question: string; answer: string }[];
  contact: {
    address: string | null;
    phone: string | null;
    whatsapp: string | null;
    email: string | null;
    person: { name: string; phone: string | null };
  };
}

export const spmbConfig: SpmbConfig = {
  school: {
    name: 'SMP Muhammadiyah 3 Kota Bandung',
    shortName: 'SMP Muhammadiyah 3',
    accreditation: 'A',
    tagline: 'Sekolah Muhammadiyah — Kota Bandung',
    jargon: ['Inisiatif', 'Kreatif', 'Religius', 'Optimis'],
    description:
      'Sekolah menengah pertama terakreditasi A di Kota Bandung dalam naungan Muhammadiyah.',
  },
  academicYear: '2027/2028',
  registration: {
    status: 'open',
    wave: 'Gelombang 1',
    periodLabel: '1 November – Desember 2026',
    note: 'Pendaftaran Gelombang 1 dibuka 1 November hingga akhir Desember 2026.',
  },
  cta: {
    register: { href: '/daftar', label: 'Daftar Sekarang' },
    checkStatus: { href: '/cek-status', label: 'Cek Status' },
  },
  flow: [
    {
      title: 'Buat Akun Orang Tua',
      detail:
        'Daftarkan akun dengan nomor HP aktif — kwitansi pembayaran dikirim ke nomor ini.',
    },
    {
      title: 'Isi Data Dasar Calon Murid',
      detail:
        'Nama, jenis kelamin, tanggal lahir, dan asal sekolah — lalu pilih gelombang.',
    },
    {
      title: 'Bayar Uang Pendaftaran',
      detail:
        'Transfer (unggah bukti) atau tunai di sekolah. Formulir terbuka setelah pembayaran diverifikasi.',
    },
    {
      title: 'Isi Formulir & Unggah Dokumen',
      detail:
        'Lengkapi formulir, pilih jalur pendaftaran, dan unggah dokumen persyaratan.',
    },
    {
      title: 'Verifikasi Berkas',
      detail:
        'Panitia memeriksa kelengkapan. Pantau hasilnya lewat Cek Status — termasuk jika perlu perbaikan.',
    },
    {
      title: 'Pembayaran DP',
      detail:
        'Setelah berkas lolos, bayar uang muka (DP). Sisanya dilunasi saat daftar ulang di sekolah.',
    },
    {
      title: 'Psikotes di Sekolah',
      detail:
        'Ikuti psikotes sesuai jadwal yang tampil pada Cek Status.',
    },
    {
      title: 'Pengumuman & Daftar Ulang',
      detail:
        'Hasil seleksi diumumkan lewat Cek Status. Yang diterima melakukan daftar ulang sekaligus pelunasan di sekolah.',
    },
  ],
  requirements: [
    'Memiliki akun SPMB dengan nomor HP aktif',
    'Membayar uang pendaftaran',
    'Mengisi formulir pendaftaran secara lengkap',
    'Mengunggah dokumen persyaratan (lihat daftar di bawah)',
    'Mengikuti psikotes di sekolah sesuai jadwal',
    'Menandatangani surat pernyataan kesediaan mengikuti aturan SPMB 2027/2028',
  ],
  terms: [
    'Nomor HP wajib aktif — kwitansi pembayaran dan pemberitahuan dikirim ke nomor tersebut.',
    'Pembayaran dilakukan via transfer (unggah bukti) atau tunai langsung di sekolah.',
    'DP yang sudah dibayar mengurangi total tagihan — sisanya dilunasi saat daftar ulang di sekolah.',
    'Berkas yang belum lengkap dapat diminta revisi oleh panitia melalui akun SPMB.',
    'Pengumuman diterima/tidak disampaikan melalui Cek Status dan notifikasi akun.',
  ],
  waves: [
    {
      name: 'Gelombang 1',
      period: '1 November – Desember 2026',
      status: 'active',
    },
    { name: 'Gelombang 2', period: 'Jadwal menyusul', status: 'soon' },
    { name: 'Gelombang 3', period: 'Jadwal menyusul', status: 'soon' },
  ],
  documents: [
    { label: 'Fotokopi KTP orang tua/wali' },
    { label: 'Fotokopi kartu keluarga' },
    { label: 'Fotokopi akta kelahiran' },
    { label: 'Ijazah / SK lulus / SK pernah sekolah' },
    { label: 'Formulir pendaftaran' },
    { label: 'Sertifikat/bukti prestasi (khusus jalur prestasi)', optional: true },
    { label: 'Nilai TKA', optional: true },
    { label: 'Pas foto terbaru', optional: true },
  ],
  guides: [
    {
      title: 'Brosur Digital SPMB 2027/2028',
      description: 'Brosur digital SPMB SMP Muhammadiyah 3 TP 2027/2028.',
      href: null, // TODO: link resmi brosur
    },
    {
      title: 'Panduan SPMB Online 2027/2028',
      description: 'Panduan singkat tata cara SPMB online.',
      href: null, // TODO: link resmi panduan
    },
    {
      title: 'Surat Pernyataan',
      description: 'Surat pernyataan kesediaan mengikuti aturan SPMB TP 2027/2028.',
      href: null, // TODO: link surat pernyataan
    },
  ],
  pathways: [
    {
      name: 'Jalur Reguler',
      description: 'Seleksi umum untuk seluruh calon peserta didik baru.',
    },
    {
      name: 'Jalur Afirmasi',
      description:
        'Dukungan bagi keluarga yang membutuhkan — sesuai ketentuan sekolah.',
    },
    {
      name: 'Jalur Prestasi',
      description:
        'Diskon DSP bagi calon murid berprestasi — wajib unggah sertifikat/bukti.',
      points: [
        'Prestasi akademik — nilai rapor',
        'Prestasi non-akademik — tahfidz & kejuaraan',
        'Tahfidz 2 juz → diskon DSP 25%',
        'Tahfidz 3 juz atau lebih → diskon DSP 50%',
        'Alumni SD Muhammadiyah Kota Bandung',
      ],
    },
  ],
  fees: [
    {
      label: 'Uang Pendaftaran',
      amount: 250_000,
      stage: 'Saat mendaftar online',
      note: 'Wajib sebelum mengisi formulir',
    },
    {
      label: 'DSP (Dana Sumbangan Pendidikan)',
      amount: 2_800_000,
      stage: 'DP sebelum psikotes, lunas saat daftar ulang',
      note: 'dapat diangsur · diskon jalur prestasi berlaku',
    },
    {
      label: 'Seragam',
      amount: 1_700_000,
      stage: 'Saat daftar ulang di sekolah',
    },
    {
      label: 'SPP Bulanan',
      amount: 250_000,
      stage: 'Per bulan setelah diterima',
      note: 'ditagihkan rutin setiap bulan',
    },
  ],
  payments: [
    {
      title: 'Transfer Bank',
      description:
        'Unggah bukti transfer — diverifikasi panitia, kwitansi terkirim ke nomor HP Anda.',
    },
    {
      title: 'Tunai di Sekolah',
      description:
        'Bayar langsung ke bagian administrasi — kwitansi tetap terkirim ke nomor HP.',
    },
  ],
  faq: [
    {
      question: 'Bagaimana cara mendaftar?',
      answer:
        'Buat akun dengan nomor HP, isi data dasar calon murid, bayar uang pendaftaran, lalu lengkapi formulir dan dokumen.',
    },
    {
      question: 'Kapan pendaftaran dibuka?',
      answer:
        'Gelombang 1 dibuka 1 November hingga Desember 2026 untuk tahun ajaran 2027/2028.',
    },
    {
      question: 'Bagaimana sistem pembayarannya?',
      answer:
        'Uang pendaftaran dibayar di awal. Setelah berkas lolos verifikasi ada pembayaran DP (uang muka) — sisanya dilunasi saat daftar ulang di sekolah. Transfer atau tunai, kwitansi dikirim ke nomor HP.',
    },
    {
      question: 'Apa itu jalur prestasi?',
      answer:
        'Jalur dengan diskon DSP: tahfidz 2 juz (25%), tahfidz 3+ juz (50%), prestasi akademik/non-akademik, dan alumni SD Muhammadiyah Kota Bandung. Wajib mengunggah sertifikat atau bukti yang diverifikasi panitia.',
    },
    {
      question: 'Bagaimana saya tahu status pendaftaran saya?',
      answer:
        'Gunakan menu "Cek Status" dengan nomor pendaftaran + email atau nomor HP. Di sana terlihat tiap tahap — termasuk alasan jika ada yang belum lolos, dan jadwal psikotes.',
    },
  ],
  contact: {
    address: 'Kota Bandung, Jawa Barat', // TODO: alamat lengkap resmi
    phone: null, // TODO: telepon resmi
    whatsapp: null, // TODO: WA panitia
    email: null, // TODO: email resmi
    person: {
      name: 'Pak Gungun',
      phone: null, // TODO: nomor HP Pak Gungun
    },
  },
};
