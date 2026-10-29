import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import '@fontsource-variable/plus-jakarta-sans';
import { spmbConfig } from '@/config/spmb.config';
import './globals.css';

const siteUrl = process.env.SPMB_URL ?? 'https://spmb.smpmuh3bdg.sch.id';

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: `SPMB ${spmbConfig.school.name}`,
    template: `%s — SPMB ${spmbConfig.school.shortName}`,
  },
  description: `Sistem Penerimaan Murid Baru ${spmbConfig.school.name} ` +
    `tahun ajaran ${spmbConfig.academicYear}. Informasi jalur pendaftaran, ` +
    'syarat, jadwal, dan cara mendaftar.',
  openGraph: {
    type: 'website',
    locale: 'id_ID',
    siteName: `SPMB ${spmbConfig.school.shortName}`,
    title: `SPMB ${spmbConfig.school.name}`,
    description: 'Informasi dan pendaftaran peserta didik baru.',
  },
};

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'School',
  name: spmbConfig.school.name,
  url: siteUrl,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="id">
      <body>
        <a
          href="#konten"
          className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:rounded-lg focus:bg-primary-700 focus:px-4 focus:py-2 focus:text-white"
        >
          Langsung ke konten
        </a>
        {children}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </body>
    </html>
  );
}
