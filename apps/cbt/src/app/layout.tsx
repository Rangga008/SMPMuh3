import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import '@fontsource-variable/plus-jakarta-sans';
import { getSchoolPublic } from '@/lib/school';
import './globals.css';

export async function generateMetadata(): Promise<Metadata> {
  const school = await getSchoolPublic();
  const schoolName = school?.name ?? 'SMP Muhammadiyah 3 Bandung';
  return {
    title: {
      default: `Ujian CBT ${schoolName}`,
      template: `%s — CBT ${schoolName}`,
    },
    ...(school?.hasLogo
      ? { icons: { icon: `/logo.png?v=${school.logoVersion ?? 1}` } }
      : {}),
    description: `Ujian daring (Computer-Based Test) siswa ${schoolName}. Masuk dengan NIS dan kode ujian dari pengawas.`,
    robots: { index: false, follow: false },
  };
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="id" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
