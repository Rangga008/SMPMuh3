import { Card, Section, SectionHeading } from '@smpmuh3/ui';
import { spmbConfig } from '@/config/spmb.config';

export function Pathways() {
  const { pathways } = spmbConfig;

  return (
    <Section id="jalur" className="bg-white" aria-labelledby="jalur-heading">
      <SectionHeading
        eyebrow="Jalur Pendaftaran"
        title="Pilih jalur yang sesuai"
        description="Setiap jalur mengikuti ketentuan seleksi masing-masing. Detail resmi diumumkan oleh sekolah."
      />
      <ul className="grid gap-5 md:grid-cols-3">
        {pathways.map((pathway) => (
          <li key={pathway.name}>
            <Card className="relative flex h-full flex-col gap-2 overflow-hidden border-transparent p-7 pt-9 transition-all duration-200 hover:-translate-y-1 hover:shadow-lift motion-reduce:transition-none motion-reduce:hover:translate-y-0">
              <span
                aria-hidden="true"
                className="absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r from-primary-600 to-accent-400"
              />
              <h3 className="text-lg font-bold text-sand-950">{pathway.name}</h3>
              <p className="text-sm text-pretty text-sand-700">{pathway.description}</p>
            </Card>
          </li>
        ))}
      </ul>
    </Section>
  );
}
