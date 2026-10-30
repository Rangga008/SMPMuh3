import Link from 'next/link';
import { spmbConfig } from '@/config/spmb.config';
import { getSchoolPublic } from '@/lib/school';
import { NAV_LINKS } from './site-header';

const IconWrap = ({ children }: { children: React.ReactNode }) => (
  <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-white/10 text-accent-300">
    {children}
  </span>
);

export async function SiteFooter() {
  const { contact } = spmbConfig;
  const school = await getSchoolPublic();
  const schoolName = school?.name ?? spmbConfig.school.name;
  const address = school?.address ?? contact.address;
  const phone = school?.whatsapp ?? school?.phone ?? contact.person.phone;
  const phoneLabel = phone
    ? `${school ? 'Sekolah' : contact.person.name} — ${phone}`
    : `Panitia: ${contact.person.name}`;
  const email = school?.email ?? contact.email;
  const year = new Date().getFullYear();

  return (
    <footer className="pattern-islami-light bg-primary-950 text-primary-100">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-14 sm:px-6 md:grid-cols-3 lg:px-8">
        <div>
          <div className="flex items-center gap-2.5">
            <span
              aria-hidden="true"
              className="flex size-9 items-center justify-center rounded-xl bg-accent-400 text-xs font-extrabold text-primary-950"
            >
              M3
            </span>
            <span className="text-sm font-extrabold tracking-tight text-white">
              SPMB · {schoolName}
            </span>
          </div>
          <p className="mt-4 max-w-xs text-sm leading-relaxed text-primary-200">
            {school?.tagline ?? spmbConfig.school.description}
          </p>
        </div>

        <nav aria-label="Navigasi bawah">
          <h3 className="text-xs font-bold uppercase tracking-wider text-accent-300">
            Navigasi
          </h3>
          <ul className="mt-4 space-y-2.5 text-sm">
            {NAV_LINKS.map((l) => (
              <li key={l.href}>
                <Link
                  href={l.href}
                  className="text-primary-200 transition-colors hover:text-white focus-visible:focus-ring"
                >
                  {l.label}
                </Link>
              </li>
            ))}
            <li>
              <Link
                href="/cek-status"
                className="text-primary-200 transition-colors hover:text-white focus-visible:focus-ring"
              >
                Cek Status
              </Link>
            </li>
          </ul>
        </nav>

        <div>
          <h3 className="text-xs font-bold uppercase tracking-wider text-accent-300">
            Kontak
          </h3>
          <ul className="mt-4 space-y-3 text-sm">
            <li className="flex gap-3">
              <IconWrap>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="size-4"><path d="M12 21s-7-5.1-7-11a7 7 0 1 1 14 0c0 5.9-7 11-7 11Z" /><circle cx="12" cy="10" r="2.5" /></svg>
              </IconWrap>
              <span className="text-primary-200">{address ?? 'Alamat menyusul'}</span>
            </li>
            <li className="flex gap-3">
              <IconWrap>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="size-4"><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2Z" /></svg>
              </IconWrap>
              <span className="text-primary-200">{phoneLabel}</span>
            </li>
            <li className="flex gap-3">
              <IconWrap>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="size-4"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></svg>
              </IconWrap>
              <span className="text-primary-200">{email ?? 'Email menyusul'}</span>
            </li>
          </ul>
        </div>
      </div>

      <div className="border-t border-white/10">
        <div className="mx-auto flex max-w-7xl flex-col gap-1 px-4 py-5 text-center text-xs text-primary-300 sm:flex-row sm:items-center sm:justify-between sm:px-6 sm:text-left lg:px-8">
          <p>© {year} Panitia SPMB · {schoolName}</p>
          <p>Tahun Ajaran {spmbConfig.academicYear}</p>
        </div>
      </div>
    </footer>
  );
}
