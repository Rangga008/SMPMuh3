import { Card, Section, SectionHeading } from '@smpmuh3/ui';
import { spmbConfig } from '@/config/spmb.config';

export function Payment() {
  const { payment } = spmbConfig;

  return (
    <Section id="biaya" className="bg-white" aria-labelledby="biaya-heading">
      <SectionHeading
        eyebrow="Biaya"
        title="Informasi pembayaran"
        description={payment.summary}
      />
      <div className="mx-auto grid max-w-3xl gap-5">
        <Card className="p-6 sm:p-8">
          <h3 className="mb-5 text-lg font-bold text-sand-950">Kanal pembayaran</h3>
          <ul className="flex flex-col gap-4">
            {payment.methods.map((method) => (
              <li key={method} className="flex items-center gap-4 text-sm text-sand-800 sm:text-base">
                <span
                  aria-hidden="true"
                  className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-primary-50 text-primary-700"
                >
                  <svg viewBox="0 0 20 20" fill="none" className="size-5">
                    <path
                      d="M3 7a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z"
                      stroke="currentColor"
                      strokeWidth="1.6"
                    />
                    <path d="M3 8.5h14" stroke="currentColor" strokeWidth="1.6" />
                  </svg>
                </span>
                {method}
              </li>
            ))}
          </ul>
        </Card>
        <p className="flex items-start gap-3 rounded-2xl border border-accent-200 bg-accent-50 px-5 py-4 text-sm font-medium text-accent-900">
          <svg
            aria-hidden="true"
            viewBox="0 0 20 20"
            fill="none"
            className="mt-0.5 size-5 shrink-0"
          >
            <path
              d="M10 7v4m0 3.5v.5M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Z"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
            />
          </svg>
          {payment.note}
        </p>
      </div>
    </Section>
  );
}
