import { Section } from '@smpmuh3/ui';
import { spmbConfig } from '@/config/spmb.config';

export function SchoolIntro() {
  const { school } = spmbConfig;

  return (
    <Section id="tentang" aria-labelledby="tentang-heading">
      <div className="grid items-center gap-10 lg:grid-cols-2">
        <div className="flex flex-col gap-4">
          <span className="text-sm font-bold tracking-widest text-primary-700 uppercase">
            Tentang Sekolah
          </span>
          <h2
            id="tentang-heading"
            className="text-3xl font-extrabold tracking-tight text-balance text-sand-950 sm:text-4xl"
          >
            {school.name}
          </h2>
          <p className="text-base text-pretty text-sand-700 sm:text-lg">
            {school.description} Sebagai sekolah Muhammadiyah, kami
            menyelenggarakan pendidikan yang memadukan ilmu pengetahuan dan
            pembinaan karakter Islami.
          </p>
          <p className="text-base text-pretty text-sand-700">
            Informasi lebih lanjut mengenai profil, program, dan kegiatan
            sekolah akan ditampilkan pada situs resmi sekolah.
          </p>
        </div>
        {/* TODO: replace with an actual photo of the school */}
        <div
          aria-hidden="true"
          className="pattern-islami-light relative flex aspect-[4/3] items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br from-primary-700 via-primary-800 to-primary-900 shadow-card"
        >
          <svg
            viewBox="0 0 100 100"
            className="absolute -top-8 -right-8 size-40 text-white/15"
          >
            <g stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              {[...Array(12)].map((_, i) => {
                const a = (i * Math.PI) / 6;
                return (
                  <line
                    key={i}
                    x1={50 + 34 * Math.cos(a)}
                    y1={50 + 34 * Math.sin(a)}
                    x2={50 + 44 * Math.cos(a)}
                    y2={50 + 44 * Math.sin(a)}
                  />
                );
              })}
            </g>
            <circle cx="50" cy="50" r="26" fill="currentColor" opacity="0.5" />
          </svg>
          <span className="flex size-20 items-center justify-center rounded-3xl bg-accent-400 text-2xl font-extrabold text-primary-950 shadow-lift">
            M3
          </span>
        </div>
      </div>
    </Section>
  );
}
