import { Accordion, AccordionItem, Section, SectionHeading } from '@smpmuh3/ui';
import { spmbConfig } from '@/config/spmb.config';

export function Faq() {
  const { faq } = spmbConfig;

  return (
    <Section id="faq" aria-labelledby="faq-heading">
      <SectionHeading
        eyebrow="FAQ"
        title="Pertanyaan yang sering diajukan"
        description="Tidak menemukan jawaban? Hubungi kami melalui kanal kontak di bawah."
      />
      <div className="mx-auto max-w-3xl">
        <Accordion>
          {faq.map((item) => (
            <AccordionItem key={item.question} question={item.question}>
              <p className="text-sm text-pretty sm:text-base">{item.answer}</p>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </Section>
  );
}
