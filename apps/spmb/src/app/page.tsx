import Link from 'next/link';
import {
  Accordion,
  AccordionItem,
  Badge,
  buttonClasses,
} from '@smpmuh3/ui';
import { spmbConfig as c } from '@/config/spmb.config';
import { getSchoolPublic } from '@/lib/school';

const statusLabel = { open: 'Dibuka', soon: 'Segera', closed: 'Ditutup' } as const;

const rupiah = (n: number) =>
  new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(n);

function CheckItem({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span
        aria-hidden="true"
        className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-primary-100 text-primary-800"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="size-3.5">
          <path d="m5 13 4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
      <span className="text-sm leading-relaxed text-sand-800">{children}</span>
    </li>
  );
}

function SectionHead({
  kicker,
  title,
  desc,
}: {
  kicker: string;
  title: string;
  desc?: string;
}) {
  return (
    <div className="mx-auto max-w-2xl text-center">
      <p className="text-xs font-bold uppercase tracking-widest text-accent-600">
        {kicker}
      </p>
      <h2 className="mt-2 text-2xl font-extrabold tracking-tight text-sand-950 sm:text-3xl">
        {title}
      </h2>
      {desc ? <p className="mt-3 text-sm leading-relaxed text-sand-600 sm:text-base">{desc}</p> : null}
    </div>
  );
}

export default async function Home() {
  const school = await getSchoolPublic();
  const schoolName = school?.name ?? c.school.name;
  const address = school?.address ?? c.contact.address;
  const phone = school?.whatsapp ?? school?.phone ?? c.contact.person.phone;
  const phoneLabel = phone
    ? `${school ? 'Sekolah' : c.contact.person.name} — ${phone}`
    : c.contact.person.name;
  const email = school?.email ?? c.contact.email;
  return (
    <>
      {/* ============ HERO ============ */}
      <section className="relative overflow-hidden bg-gradient-to-b from-primary-50 via-sand-50 to-white">
        <div
          aria-hidden="true"
          className="pattern-islami pointer-events-none absolute inset-0"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-40 -top-40 size-[480px] rounded-full bg-primary-200/40 blur-3xl"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -left-40 top-40 size-[420px] rounded-full bg-accent-200/30 blur-3xl"
        />
        <div className="relative mx-auto max-w-4xl px-4 pb-16 pt-14 text-center sm:px-6 sm:pb-20 sm:pt-20">
          <div className="flex flex-wrap items-center justify-center gap-2">
            <Badge tone="accent">
              {c.registration.wave} · {c.registration.periodLabel}
            </Badge>
            <Badge tone="primary">Akreditasi {c.school.accreditation}</Badge>
          </div>
          <h1 className="mt-5 text-3xl font-extrabold leading-tight tracking-tight text-sand-950 sm:text-5xl">
            Selamat Datang di Laman{' '}
            <span className="text-primary-800">SPMB</span>
            <br />
            {schoolName}
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-sm font-semibold tracking-wide text-primary-700 sm:text-base">
            {c.school.jargon.join(' · ')}
          </p>
          <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-sand-600 sm:text-base">
            {c.school.description} Daftarkan putra-putri Anda melalui jalur
            pendaftaran online — mudah, jelas, dan terpantau.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link href={c.cta.register.href} className={buttonClasses({ size: 'lg', className: 'w-full sm:w-auto' })}>
              {c.cta.register.label}
            </Link>
            <Link href={c.cta.checkStatus.href} className={buttonClasses({ variant: 'outline', size: 'lg', className: 'w-full sm:w-auto' })}>
              {c.cta.checkStatus.label}
            </Link>
          </div>

          <dl className="mx-auto mt-12 grid max-w-3xl grid-cols-1 gap-3 sm:grid-cols-3">
            {[
              ['Status', statusLabel[c.registration.status]],
              ['Tahun Ajaran', c.academicYear],
              ['Alamat', address ?? 'Kota Bandung'],
            ].map(([k, v]) => (
              <div
                key={k}
                className="rounded-2xl border border-sand-200 bg-white/80 px-5 py-4 shadow-soft backdrop-blur"
              >
                <dt className="text-[11px] font-bold uppercase tracking-wider text-sand-500">
                  {k}
                </dt>
                <dd className="mt-1 text-sm font-extrabold text-primary-800">
                  {v}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* ============ ALUR ============ */}
      <section id="alur" className="bg-white py-16 sm:py-20">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
          <SectionHead
            kicker="Alur Pendaftaran"
            title="Cara Mendaftar"
            desc="Ikuti langkah-langkah berikut untuk menyelesaikan pendaftaran murid baru."
          />
          <ol className="mt-10 space-y-4">
            {c.flow.map((s, i) => (
              <li
                key={s.title}
                className="flex items-start gap-4 rounded-2xl border border-sand-200 bg-sand-50 p-5 transition-shadow hover:shadow-soft"
              >
                <span
                  aria-hidden="true"
                  className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary-700 text-sm font-extrabold text-white"
                >
                  {i + 1}
                </span>
                <div>
                  <h3 className="font-bold text-sand-950">{s.title}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-sand-600">
                    {s.detail}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ============ JALUR ============ */}
      <section id="jalur" className="bg-sand-100/60 py-16 sm:py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <SectionHead
            kicker="Jalur Pendaftaran"
            title="Pilih Jalur yang Sesuai"
            desc="Jalur prestasi memberikan keringanan biaya DSP — wajib menyertakan sertifikat atau bukti yang diverifikasi panitia."
          />
          <div className="mt-10 grid gap-5 sm:grid-cols-3">
            {c.pathways.map((p) => (
              <div
                key={p.name}
                className="flex flex-col rounded-3xl border border-sand-200 bg-white p-6 shadow-card transition-shadow hover:shadow-lift sm:p-7"
              >
                <span
                  aria-hidden="true"
                  className="flex size-11 items-center justify-center rounded-2xl bg-primary-100 text-primary-800"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="size-5">
                    <path d="M12 2l2.9 6.3 6.9.6-5.2 4.5 1.6 6.7L12 16.7 5.8 20.1l1.6-6.7L2.2 8.9l6.9-.6L12 2Z" strokeLinejoin="round" />
                  </svg>
                </span>
                <h3 className="mt-4 text-lg font-extrabold text-sand-950">{p.name}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-sand-600">{p.description}</p>
                {p.points ? (
                  <ul className="mt-4 space-y-2 border-t border-sand-100 pt-4">
                    {p.points.map((pt) => (
                      <li key={pt} className="flex gap-2 text-sm text-sand-800">
                        <span aria-hidden="true" className="mt-1.5 size-1.5 shrink-0 rounded-full bg-accent-400" />
                        {pt}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ============ BIAYA & PEMBAYARAN ============ */}
      <section id="biaya" className="bg-white py-16 sm:py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <SectionHead
            kicker="Biaya Pendidikan"
            title="Informasi Biaya"
            desc="Transparan sejak awal — pembayaran via transfer (unggah bukti) atau tunai di sekolah, dan kwitansi dikirim ke nomor HP Anda."
          />
          <div className="mx-auto mt-10 max-w-3xl overflow-hidden rounded-3xl border border-sand-200 bg-white shadow-card">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="bg-primary-800 text-primary-50">
                  <th className="px-5 py-4 text-xs font-bold uppercase tracking-wider">Komponen Biaya</th>
                  <th className="hidden px-5 py-4 text-xs font-bold uppercase tracking-wider sm:table-cell">Kapan Dibayar</th>
                  <th className="px-5 py-4 text-right text-xs font-bold uppercase tracking-wider">Nominal</th>
                </tr>
              </thead>
              <tbody>
                {c.fees.map((f) => (
                  <tr key={f.label} className="border-t border-sand-100">
                    <td className="px-5 py-4">
                      <p className="font-bold text-sand-950">{f.label}</p>
                      {f.note ? (
                        <p className="mt-0.5 text-xs font-medium text-accent-700">{f.note}</p>
                      ) : null}
                      <p className="mt-0.5 text-xs text-sand-500 sm:hidden">{f.stage}</p>
                    </td>
                    <td className="hidden px-5 py-4 text-sand-600 sm:table-cell">{f.stage}</td>
                    <td className="px-5 py-4 text-right font-extrabold text-primary-800">
                      {rupiah(f.amount)}
                    </td>
                  </tr>
                ))}
                <tr className="border-t-2 border-primary-200 bg-primary-50">
                  <td className="px-5 py-4 font-extrabold text-primary-900" colSpan={2}>
                    Total biaya masuk (pendaftaran + DSP + seragam)
                  </td>
                  <td className="px-5 py-4 text-right text-base font-extrabold text-primary-900">
                    {rupiah(
                      c.fees
                        .filter((f) => !f.label.startsWith('SPP'))
                        .reduce((t, f) => t + f.amount, 0),
                    )}
                  </td>
                </tr>
              </tbody>
            </table>
            <p className="border-t border-sand-100 bg-sand-50 px-5 py-3 text-xs leading-relaxed text-sand-600">
              * Total di atas <strong>belum termasuk diskon jalur prestasi</strong> — jalur
              prestasi memberi keringanan DSP hingga 50%. DSP dapat diangsur; sisa
              pembayaran dilunasi saat daftar ulang di sekolah. SPP ditagihkan
              rutin per bulan setelah murid diterima.
            </p>
          </div>
          <div className="mt-8 grid gap-5 sm:grid-cols-2">
            {c.payments.map((p) => (
              <div
                key={p.title}
                className="flex gap-4 rounded-3xl border border-sand-200 bg-white p-6 shadow-card"
              >
                <span
                  aria-hidden="true"
                  className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-primary-100 text-primary-800"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="size-5">
                    <rect x="3" y="6" width="18" height="13" rx="2" />
                    <path d="M3 10h18M7 15h4" strokeLinecap="round" />
                  </svg>
                </span>
                <div>
                  <h3 className="font-bold text-sand-950">{p.title}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-sand-600">{p.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ============ SYARAT & KETENTUAN ============ */}
      <section id="syarat" className="bg-sand-100/60 py-16 sm:py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <SectionHead
            kicker="Syarat & Ketentuan"
            title="Persyaratan Pendaftaran"
          />
          <div className="mt-10 grid gap-6 md:grid-cols-2">
            <div className="rounded-3xl border border-sand-200 bg-white p-6 shadow-card sm:p-8">
              <h3 className="text-lg font-extrabold text-sand-950">
                Syarat Administrasi
              </h3>
              <ul className="mt-5 space-y-3.5">
                {c.requirements.map((r) => (
                  <CheckItem key={r}>{r}</CheckItem>
                ))}
              </ul>
            </div>
            <div className="rounded-3xl border border-sand-200 bg-white p-6 shadow-card sm:p-8">
              <h3 className="text-lg font-extrabold text-sand-950">
                Ketentuan Umum
              </h3>
              <ul className="mt-5 space-y-3.5">
                {c.terms.map((t) => (
                  <li key={t} className="flex gap-3">
                    <span
                      aria-hidden="true"
                      className="mt-1.5 size-2 shrink-0 rounded-full bg-accent-400"
                    />
                    <span className="text-sm leading-relaxed text-sand-800">
                      {t}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ============ GELOMBANG ============ */}
      <section id="gelombang" className="bg-white py-16 sm:py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <SectionHead
            kicker="Jadwal Pendaftaran"
            title="Gelombang Pendaftaran"
            desc={`Penerimaan murid baru tahun ajaran ${c.academicYear} dibuka per gelombang.`}
          />
          <div className="mt-10 grid gap-5 sm:grid-cols-3">
            {c.waves.map((w) => (
              <div
                key={w.name}
                className={`rounded-3xl border p-6 shadow-card sm:p-7 ${
                  w.status === 'active'
                    ? 'border-primary-300 bg-primary-50 ring-1 ring-primary-200'
                    : 'border-sand-200 bg-white'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-lg font-extrabold text-sand-950">
                    {w.name}
                  </h3>
                  <Badge tone={w.status === 'active' ? 'primary' : 'neutral'}>
                    {w.status === 'active'
                      ? 'Dibuka'
                      : w.status === 'soon'
                        ? 'Segera'
                        : 'Ditutup'}
                  </Badge>
                </div>
                <p className="mt-3 text-sm font-semibold text-primary-800">
                  {w.period}
                </p>
                {w.status === 'active' ? (
                  <Link
                    href={c.cta.register.href}
                    className={buttonClasses({ size: 'sm', className: 'mt-5 w-full' })}
                  >
                    Daftar {w.name}
                  </Link>
                ) : null}
              </div>
            ))}
          </div>
          <p className="mt-6 text-center text-xs text-sand-500">{c.registration.note}</p>
        </div>
      </section>

      {/* ============ DOKUMEN ============ */}
      <section id="dokumen" className="bg-sand-100/60 py-16 sm:py-20">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
          <SectionHead
            kicker="Kelengkapan"
            title="Dokumen Pendaftaran"
            desc="Siapkan dokumen berikut — diunggah melalui akun SPMB setelah mengisi formulir."
          />
          <div className="mt-10 rounded-3xl border border-sand-200 bg-white p-6 shadow-card sm:p-8">
            <ul className="grid gap-x-8 gap-y-3.5 sm:grid-cols-2">
              {c.documents.map((d) => (
                <CheckItem key={d.label}>
                  {d.label}
                  {d.optional ? (
                    <span className="ml-2 rounded-md bg-sand-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-sand-500">
                      Opsional
                    </span>
                  ) : null}
                </CheckItem>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* ============ BROSUR & PANDUAN ============ */}
      <section id="brosur" className="bg-white py-16 sm:py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <SectionHead
            kicker="Brosur & Panduan"
            title="Unduh Materi Pendaftaran"
          />
          <div className="mt-10 grid gap-5 sm:grid-cols-3">
            {c.guides.map((g) => (
              <div
                key={g.title}
                className="flex flex-col rounded-3xl border border-sand-200 bg-white p-6 shadow-card transition-shadow hover:shadow-lift"
              >
                <span
                  aria-hidden="true"
                  className="flex size-11 items-center justify-center rounded-2xl bg-primary-100 text-primary-800"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="size-5">
                    <path d="M12 3v12m0 0 4-4m-4 4-4-4" strokeLinecap="round" strokeLinejoin="round" />
                    <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" strokeLinecap="round" />
                  </svg>
                </span>
                <h3 className="mt-4 font-bold leading-snug text-sand-950">
                  {g.title}
                </h3>
                <p className="mt-1.5 flex-1 text-sm leading-relaxed text-sand-600">
                  {g.description}
                </p>
                {g.href ? (
                  <a
                    href={g.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={buttonClasses({ variant: 'outline', size: 'sm', className: 'mt-5 w-full' })}
                  >
                    Unduh
                  </a>
                ) : (
                  <span className="mt-5 inline-flex h-9 items-center justify-center rounded-xl border border-dashed border-sand-300 text-xs font-semibold text-sand-400">
                    Tautan menyusul
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ============ FAQ ============ */}
      <section id="faq" className="bg-sand-100/60 py-16 sm:py-20">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
          <SectionHead kicker="FAQ" title="Pertanyaan Umum" />
          <div className="mt-10">
            <Accordion>
              {c.faq.map((f) => (
                <AccordionItem key={f.question} question={f.question}>
                  {f.answer}
                </AccordionItem>
              ))}
            </Accordion>
          </div>
        </div>
      </section>

      {/* ============ KONTAK + CTA ============ */}
      <section id="kontak" className="bg-white py-16 sm:py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <SectionHead kicker="Hubungi Kami" title="Alamat & Kontak" />
          <div className="mt-10 grid gap-5 sm:grid-cols-3">
            {[
              {
                label: 'Alamat',
                value: address ?? 'Menyusul',
                icon: (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="size-5"><path d="M12 21s-7-5.1-7-11a7 7 0 1 1 14 0c0 5.9-7 11-7 11Z" /><circle cx="12" cy="10" r="2.5" /></svg>
                ),
              },
              {
                label: 'Panitia SPMB',
                value: phoneLabel,
                icon: (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="size-5"><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2Z" /></svg>
                ),
              },
              {
                label: 'Email',
                value: email ?? 'Menyusul',
                icon: (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="size-5"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></svg>
                ),
              },
            ].map((k) => (
              <div
                key={k.label}
                className="rounded-3xl border border-sand-200 bg-sand-50 p-6 text-center"
              >
                <span
                  aria-hidden="true"
                  className="mx-auto flex size-11 items-center justify-center rounded-2xl bg-white text-primary-800 shadow-xs"
                >
                  {k.icon}
                </span>
                <h3 className="mt-4 text-xs font-bold uppercase tracking-wider text-sand-500">
                  {k.label}
                </h3>
                <p className="mt-2 text-sm font-semibold text-sand-900">{k.value}</p>
              </div>
            ))}
          </div>

          <div className="relative mt-14 overflow-hidden rounded-3xl bg-gradient-to-br from-primary-800 via-primary-700 to-primary-900 p-8 text-center sm:p-12">
            <div
              aria-hidden="true"
              className="pattern-islami-light pointer-events-none absolute inset-0"
            />
            <div className="relative">
            <h2 className="mx-auto max-w-xl text-2xl font-extrabold tracking-tight text-white sm:text-3xl">
              Siap Mendaftarkan Putra-Putri Anda?
            </h2>
            <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-primary-100">
              {c.registration.wave} dibuka {c.registration.periodLabel} — tahun
              ajaran {c.academicYear}.
            </p>
            <div className="mt-7 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link href={c.cta.register.href} className={buttonClasses({ variant: 'secondary', size: 'lg', className: 'w-full sm:w-auto' })}>
                {c.cta.register.label}
              </Link>
              <Link href="/cek-status" className={buttonClasses({ variant: 'outline', size: 'lg', className: 'w-full border-white/40 bg-white/10 text-white hover:border-white/70 hover:bg-white/20 sm:w-auto' })}>
                {c.cta.checkStatus.label}
              </Link>
            </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
