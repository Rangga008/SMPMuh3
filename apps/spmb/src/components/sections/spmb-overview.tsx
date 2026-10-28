import { Card, Section, SectionHeading } from '@smpmuh3/ui';

const steps = [
  {
    title: 'Isi Formulir',
    description: 'Lengkapi data calon siswa dan orang tua melalui formulir online.',
  },
  {
    title: 'Unggah Dokumen',
    description: 'Unggah berkas persyaratan dalam format yang ditentukan.',
  },
  {
    title: 'Pembayaran',
    description: 'Lakukan pembayaran sesuai instruksi yang ditampilkan.',
  },
  {
    title: 'Pantau Status',
    description: 'Ikuti perkembangan berkas Anda melalui halaman cek status.',
  },
];

export function SpmbOverview() {
  return (
    <Section id="alur" className="bg-white" aria-labelledby="alur-heading">
      <SectionHeading
        eyebrow="Alur Pendaftaran"
        title="Empat langkah mudah"
        description="Seluruh proses pendaftaran dilakukan secara online — tanpa perlu datang ke sekolah untuk mengambil formulir."
      />
      <ol className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {steps.map((step, i) => (
          <li key={step.title}>
            <Card className="flex h-full flex-col gap-3 border-transparent p-7 transition-all duration-200 hover:-translate-y-1 hover:border-primary-200 hover:shadow-lift motion-reduce:transition-none motion-reduce:hover:translate-y-0">
              <span
                aria-hidden="true"
                className="flex size-12 items-center justify-center rounded-2xl bg-primary-700 text-base font-extrabold text-white shadow-sm"
              >
                {i + 1}
              </span>
              <h3 className="text-lg font-bold text-sand-950">{step.title}</h3>
              <p className="text-sm text-pretty text-sand-700">{step.description}</p>
            </Card>
          </li>
        ))}
      </ol>
    </Section>
  );
}
