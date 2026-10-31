import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import '@fontsource-variable/plus-jakarta-sans';
import { spmbConfig } from '@/config/spmb.config';
import { getSchoolPublic } from '@/lib/school';
import { SiteHeader } from '@/components/site-header';
import { SiteFooter } from '@/components/site-footer';
import './globals.css';

const siteUrl = process.env.SPMB_URL ?? 'https://spmb.smpmuh3bdg.sch.id';

export async function generateMetadata(): Promise<Metadata> {
  const school = await getSchoolPublic();
  const schoolName = school?.name ?? spmbConfig.school.name;
  const shortName = school?.name ?? spmbConfig.school.shortName;
  return {
    metadataBase: new URL(siteUrl),
    title: {
      default: `SPMB ${schoolName}`,
      template: `%s — SPMB ${shortName}`,
    },
    // Favicon mengikuti logo yang diunggah admin (/logo.png = proxy API).
    // ?v=logoVersion memaksa browser fetch ulang saat logo diganti —
    // favicon di-cache sangat agresif per-URL oleh browser.
    ...(school?.hasLogo
      ? { icons: { icon: `/logo.png?v=${school.logoVersion ?? 1}` } }
      : {}),
    description: `Sistem Penerimaan Murid Baru ${schoolName} ` +
      `tahun ajaran ${spmbConfig.academicYear}. Informasi jalur pendaftaran, ` +
      'syarat, jadwal, dan cara mendaftar.',
    openGraph: {
      type: 'website',
      locale: 'id_ID',
      siteName: `SPMB ${shortName}`,
      title: `SPMB ${schoolName}`,
      description: 'Informasi dan pendaftaran peserta didik baru.',
    },
  };
}

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'School',
  name: spmbConfig.school.name,
  url: siteUrl,
};

// Revalidasi ISR — profil sekolah (nama/kontak/logo) bisa diubah admin
// lewat Pengaturan tanpa rebuild; header/footer mengambilnya dari API.
export const revalidate = 300;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="id" suppressHydrationWarning>
      <body>
        {/* Terapkan tema tersimpan sebelum paint pertama — cegah flash
            putih saat pengguna memilih mode gelap. */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "try{var t=localStorage.getItem('theme');if(t==='dark'||(!t&&matchMedia('(prefers-color-scheme: dark)').matches))document.documentElement.classList.add('dark')}catch(e){}",
          }}
        />
        <a
          href="#konten"
          className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:rounded-lg focus:bg-primary-700 focus:px-4 focus:py-2 focus:text-white"
        >
          Langsung ke konten
        </a>
        <SiteHeader />
        <div id="konten">{children}</div>
        <SiteFooter />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </body>
    </html>
  );
}
