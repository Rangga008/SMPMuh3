import type { ReactNode } from 'react';
import { Card, Section, SectionHeading } from '@smpmuh3/ui';
import { spmbConfig } from '@/config/spmb.config';

const icons: Record<string, ReactNode> = {
  Alamat: (
    <path
      d="M10 17.5s6-4.9 6-9.5a6 6 0 1 0-12 0c0 4.6 6 9.5 6 9.5Zm0-7a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinejoin="round"
    />
  ),
  Telepon: (
    <path
      d="M4.5 4h3l1.5 3.5-2 1.5a11 11 0 0 0 4 4l1.5-2L16 12.5v3a1.5 1.5 0 0 1-1.5 1.5A12.5 12.5 0 0 1 3 5.5 1.5 1.5 0 0 1 4.5 4Z"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinejoin="round"
    />
  ),
  WhatsApp: (
    <path
      d="M10 3a7 7 0 0 0-6 10.5L3 17l3.6-1A7 7 0 1 0 10 3Zm-2.5 4.5c.3 0 .6.8.8 1.2.1.4-.4 1-.6 1.3.5 1.2 1.5 2 2.6 2.4.3-.2.9-.8 1.3-.6.4.2 1.2.6 1.2.9 0 .9-1 1.6-1.8 1.6-2.7 0-6-2.5-6-5.3 0-.8.7-1.9 1.5-1.9Z"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinejoin="round"
    />
  ),
  Email: (
    <path
      d="M3.5 6.5h13a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1h-13a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1Zm.5 1 6 4 6-4"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinejoin="round"
    />
  ),
};

function ContactRow({
  label,
  value,
  href,
}: {
  label: string;
  value: string | null;
  href?: string | undefined;
}) {
  return (
    <li className="flex items-center gap-4">
      <span
        aria-hidden="true"
        className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-primary-50 text-primary-700"
      >
        <svg viewBox="0 0 20 20" fill="none" className="size-5">
          {icons[label]}
        </svg>
      </span>
      <span className="min-w-0">
        <span className="block text-xs font-bold tracking-wide text-sand-500 uppercase">
          {label}
        </span>
        {value ? (
          href ? (
            <a
              href={href}
              className="block truncate text-sm font-semibold text-primary-800 hover:underline focus-visible:focus-ring rounded sm:text-base"
            >
              {value}
            </a>
          ) : (
            <span className="block text-sm font-semibold text-sand-900 sm:text-base">
              {value}
            </span>
          )
        ) : (
          <span className="block text-sm text-sand-500 italic">
            Akan diumumkan
          </span>
        )}
      </span>
    </li>
  );
}

export function Contact() {
  const { contact, school } = spmbConfig;

  return (
    <Section id="kontak" className="bg-white" aria-labelledby="kontak-heading">
      <SectionHeading
        eyebrow="Kontak"
        title="Butuh bantuan?"
        description="Tim SPMB siap membantu pertanyaan seputar pendaftaran."
      />
      <Card className="mx-auto max-w-3xl p-6 sm:p-8">
        <ul className="grid gap-6 sm:grid-cols-2">
          <ContactRow label="Alamat" value={contact.address ?? school.name} />
          <ContactRow
            label="Telepon"
            value={contact.phone}
            href={contact.phone ? `tel:${contact.phone.replace(/\s/g, '')}` : undefined}
          />
          <ContactRow
            label="WhatsApp"
            value={contact.whatsapp}
            href={
              contact.whatsapp
                ? `https://wa.me/${contact.whatsapp.replace(/\D/g, '')}`
                : undefined
            }
          />
          <ContactRow
            label="Email"
            value={contact.email}
            href={contact.email ? `mailto:${contact.email}` : undefined}
          />
        </ul>
      </Card>
    </Section>
  );
}
