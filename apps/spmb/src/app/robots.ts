import type { MetadataRoute } from 'next';

const siteUrl = process.env.SPMB_URL ?? 'https://spmb.smpmuh3bdg.sch.id';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: '*', allow: '/' },
    sitemap: `${siteUrl}/sitemap.xml`,
  };
}
