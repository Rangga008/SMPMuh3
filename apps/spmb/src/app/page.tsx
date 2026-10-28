import { SiteFooter } from '@/components/site-footer';
import { SiteHeader } from '@/components/site-header';
import { Advantages } from '@/components/sections/advantages';
import { Contact } from '@/components/sections/contact';
import { CtaBanner } from '@/components/sections/cta-banner';
import { Faq } from '@/components/sections/faq';
import { Hero } from '@/components/sections/hero';
import { Pathways } from '@/components/sections/pathways';
import { Payment } from '@/components/sections/payment';
import { Requirements } from '@/components/sections/requirements';
import { SchoolIntro } from '@/components/sections/school-intro';
import { SpmbOverview } from '@/components/sections/spmb-overview';
import { Timeline } from '@/components/sections/timeline';

export default function HomePage() {
  return (
    <>
      <SiteHeader />
      <main id="konten">
        <Hero />
        <SchoolIntro />
        <SpmbOverview />
        <Advantages />
        <Pathways />
        <Timeline />
        <Requirements />
        <CtaBanner />
        <Payment />
        <Faq />
        <Contact />
      </main>
      <SiteFooter />
    </>
  );
}
