import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import '@fontsource-variable/plus-jakarta-sans';
import './globals.css';

// Favicon mengikuti logo sekolah dari API — /logo.png me-proxy ke
// /school/logo; saat belum ada logo diunggah, route balas 404 dan
// browser memakai default.
export const metadata: Metadata = {
  title: {
    default: 'Admin — SMP Muhammadiyah 3 Kota Bandung',
    template: '%s — Admin Sekolah',
  },
  robots: { index: false, follow: false },
  icons: { icon: '/logo.png' },
};

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
          className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-[60] focus:rounded-lg focus:bg-primary-700 focus:px-4 focus:py-2 focus:text-white"
        >
          Langsung ke konten
        </a>
        {children}
      </body>
    </html>
  );
}
