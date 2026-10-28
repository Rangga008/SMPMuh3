import { Section, SectionHeading } from '@smpmuh3/ui';
import { spmbConfig } from '@/config/spmb.config';

export function Timeline() {
  const { timeline } = spmbConfig;

  return (
    <Section id="jadwal" aria-labelledby="jadwal-heading">
      <SectionHeading
        eyebrow="Jadwal"
        title="Tahapan pendaftaran"
        description="Ikuti setiap tahap sesuai urutan. Jadwal resmi diperbarui melalui halaman ini dan pengumuman sekolah."
      />
      <ol className="relative mx-auto flex max-w-2xl flex-col gap-8 border-s-2 border-primary-200 pl-8">
        {timeline.map((item, i) => (
          <li key={item.label} className="relative">
            <span
              aria-hidden="true"
              className="absolute top-0.5 -left-[41px] flex size-6 items-center justify-center rounded-full border-2 border-accent-500 bg-white text-xs font-bold text-primary-800 shadow-sm"
            >
              {i + 1}
            </span>
            <div className="flex flex-col gap-1">
              <div className="flex flex-wrap items-baseline gap-x-3">
                <h3 className="text-lg font-bold text-sand-950">{item.label}</h3>
                <span className="text-sm font-semibold text-primary-700">{item.period}</span>
              </div>
              <p className="text-sm text-pretty text-sand-700">{item.detail}</p>
            </div>
          </li>
        ))}
      </ol>
    </Section>
  );
}
