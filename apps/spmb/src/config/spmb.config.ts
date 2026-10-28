/**
 * SPMB landing page content — CONFIGURABLE DATA.
 *
 * Everything here is a placeholder pending confirmation from the school.
 * Do not treat values as verified facts. Update after the school confirms
 * official figures, dates, fees, and contact details.
 */

export type RegistrationStatus = 'open' | 'soon' | 'closed';

export interface SpmbConfig {
  school: {
    name: string;
    shortName: string;
    description: string;
  };
  academicYear: string;
  registration: {
    status: RegistrationStatus;
    periodLabel: string;
    note: string;
  };
  cta: {
    register: { href: string; label: string };
    checkStatus: { href: string; label: string };
  };
  pathways: { name: string; description: string }[];
  requirements: string[];
  timeline: { label: string; detail: string; period: string }[];
  faq: { question: string; answer: string }[];
  payment: {
    summary: string;
    methods: string[];
    note: string;
  };
  contact: {
    address: string | null;
    phone: string | null;
    whatsapp: string | null;
    email: string | null;
  };
}

export const spmbConfig: SpmbConfig = {
  school: {
    name: 'SMP Muhammadiyah 3 Kota Bandung',
    shortName: 'SMP Muhammadiyah 3',
    // TODO: replace with the school's official description.
    description:
      'Sekolah menengah pertama di Kota Bandung dalam naungan Muhammadiyah.',
  },
  // TODO: confirm with school — aligned with seeded AcademicYear for now.
  academicYear: '2026/2027',
  registration: {
    status: 'open', // 'open' | 'soon' | 'closed'
    periodLabel: 'Gelombang 1', // TODO: confirm wave naming/schedule
    note: 'Pendaftaran dibuka. Jadwal dan kuota dapat berubah — pantau pengumuman resmi.',
  },
  cta: {
    register: { href: '/daftar', label: 'Daftar Sekarang' },
    checkStatus: { href: '/cek-status', label: 'Cek Status Pendaftaran' },
  },
  // TODO: confirm actual admission pathways with the school.
  pathways: [
    {
      name: 'Jalur Reguler',
      description:
        'Seleksi umum untuk seluruh calon peserta didik baru.',
    },
    {
      name: 'Jalur Prestasi',
      description:
        'Bagi calon siswa dengan prestasi akademik maupun non-akademik.',
    },
    {
      name: 'Jalur Afirmasi',
      description:
        'Dukungan bagi keluarga yang membutuhkan — sesuai ketentuan sekolah.',
    },
  ],
  // TODO: verify the official document checklist with the school.
  requirements: [
    'Fotokopi ijazah atau surat keterangan lulus SD/MI',
    'Fotokopi kartu keluarga',
    'Fotokopi akta kelahiran',
    'Pas foto terbaru',
    'Mengisi formulir pendaftaran',
  ],
  // TODO: replace periods with the official schedule once published.
  timeline: [
    {
      label: 'Pendaftaran',
      detail: 'Mengisi formulir pendaftaran dan melengkapi berkas.',
      period: 'Jadwal menyusul',
    },
    {
      label: 'Verifikasi Berkas',
      detail: 'Petugas memeriksa kelengkapan dokumen pendaftaran.',
      period: 'Jadwal menyusul',
    },
    {
      label: 'Pembayaran',
      detail: 'Pembayaran biaya pendaftaran sesuai instruksi resmi.',
      period: 'Jadwal menyusul',
    },
    {
      label: 'Pengumuman',
      detail: 'Hasil seleksi diumumkan melalui kanal resmi sekolah.',
      period: 'Jadwal menyusul',
    },
    {
      label: 'Daftar Ulang',
      detail: 'Siswa yang dinyatakan diterima melakukan daftar ulang.',
      period: 'Jadwal menyusul',
    },
  ],
  faq: [
    {
      question: 'Bagaimana cara mendaftar?',
      answer:
        'Klik tombol "Daftar Sekarang", isi formulir pendaftaran, lalu unggah dokumen yang diminta. Petugas akan memverifikasi berkas Anda.',
    },
    {
      question: 'Kapan pendaftaran dibuka?',
      answer:
        'Jadwal pendaftaran diumumkan melalui kanal resmi sekolah. Halaman ini akan diperbarui saat jadwal resmi tersedia.',
    },
    {
      question: 'Berapa biaya pendaftarannya?',
      answer:
        'Rincian biaya mengikuti ketentuan resmi sekolah dan akan ditampilkan pada langkah pembayaran. Silakan hubungi sekolah untuk informasi terkini.',
    },
    {
      question: 'Bagaimana saya tahu pendaftaran saya diterima?',
      answer:
        'Gunakan menu "Cek Status Pendaftaran" untuk memantau status berkas Anda, atau tunggu pengumuman resmi dari sekolah.',
    },
    {
      question: 'Apakah bisa mendaftar langsung ke sekolah?',
      answer:
        'Pendaftaran online adalah jalur utama. Untuk kunjungan langsung, silakan hubungi sekolah terlebih dahulu.',
    },
  ],
  payment: {
    summary:
      'Pembayaran biaya pendaftaran dilakukan setelah formulir terkirim. ' +
      'Instruksi pembayaran ditampilkan di akun pendaftar.',
    // TODO: confirm official payment channels (bank account, VA, QRIS...).
    methods: ['Transfer bank — detail resmi menyusul', 'Kanal lain akan diumumkan'],
    note: 'Jangan melakukan pembayaran di luar kanal resmi sekolah.',
  },
  // TODO: fill with verified school contact details.
  contact: {
    address: null, // e.g. "Jl. ... No. ..., Kota Bandung"
    phone: null, // e.g. "(022) ..."
    whatsapp: null, // e.g. "+62 8xx-xxxx-xxxx"
    email: null, // e.g. "spmb@smpmuh3bdg.sch.id"
  },
};
