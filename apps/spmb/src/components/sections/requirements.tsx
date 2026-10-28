import { Card, Section, SectionHeading } from '@smpmuh3/ui';
import { spmbConfig } from '@/config/spmb.config';

export function Requirements() {
  const { requirements } = spmbConfig;

  return (
    <Section id="syarat" className="bg-white" aria-labelledby="syarat-heading">
      <SectionHeading
        eyebrow="Persyaratan"
        title="Siapkan dokumen berikut"
        description="Daftar berkas yang dibutuhkan saat pendaftaran. Daftar resmi dapat berubah — ikuti petunjuk pada formulir."
      />
      <Card className="mx-auto max-w-3xl p-6 sm:p-8">
        <ul className="flex flex-col divide-y divide-sand-100">
          {requirements.map((req) => (
            <li key={req} className="flex items-center gap-4 py-4 first:pt-0 last:pb-0">
              <span
                aria-hidden="true"
                className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary-700 text-white"
              >
                <svg viewBox="0 0 20 20" fill="none" className="size-4.5">
                  <path
                    d="m4 10.5 4 4 8-9"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </span>
              <span className="text-sm text-pretty text-sand-800 sm:text-base">{req}</span>
            </li>
          ))}
        </ul>
      </Card>
    </Section>
  );
}
