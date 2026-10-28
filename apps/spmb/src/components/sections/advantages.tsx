import { Card, Section, SectionHeading } from '@smpmuh3/ui';

// Generic, non-fabricated statements about Muhammadiyah schooling —
// replace with verified school strengths once confirmed.
const advantages = [
  {
    title: 'Sekolah Muhammadiyah',
    description:
      'Bagian dari jaringan pendidikan Muhammadiyah dengan nilai-nilai Islami dan kemajuan.',
  },
  {
    title: 'Pembinaan Karakter',
    description:
      'Pendidikan yang menyeimbangkan ilmu pengetahuan, akhlak, dan ibadah.',
  },
  {
    title: 'Lingkungan Kota Bandung',
    description:
      'Berada di Kota Bandung dengan akses yang mudah dijangkau keluarga.',
  },
  {
    title: 'Pendaftaran Transparan',
    description:
      'Proses SPMB online yang jelas — status pendaftaran dapat dipantau kapan saja.',
  },
];

export function Advantages() {
  return (
    <Section aria-labelledby="keunggulan-heading">
      <SectionHeading
        eyebrow="Keunggulan"
        title="Mengapa memilih kami"
        description="Pendidikan yang menumbuhkan ilmu dan karakter dalam lingkungan yang mendukung."
      />
      <ul className="grid gap-5 sm:grid-cols-2">
        {advantages.map((item) => (
          <li key={item.title}>
            <Card className="flex h-full items-start gap-4 border-transparent p-7 transition-all duration-200 hover:-translate-y-1 hover:border-primary-200 hover:shadow-lift motion-reduce:transition-none motion-reduce:hover:translate-y-0">
              <span
                aria-hidden="true"
                className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-primary-50 text-primary-700"
              >
                <svg viewBox="0 0 24 24" fill="none" className="size-6">
                  <path
                    d="M12 3l1.9 5.8H20l-4.9 3.6 1.9 5.8-5-3.6-5 3.6 1.9-5.8L4 8.8h6.1L12 3z"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinejoin="round"
                  />
                </svg>
              </span>
              <span>
                <h3 className="mb-1 text-base font-bold text-sand-950">{item.title}</h3>
                <p className="text-sm text-pretty text-sand-700">{item.description}</p>
              </span>
            </Card>
          </li>
        ))}
      </ul>
    </Section>
  );
}
