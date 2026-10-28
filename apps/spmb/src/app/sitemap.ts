import type { MetadataRoute } from 'next';

const siteUrl = process.env.SPMB_URL ?? 'https://spmb.smpmuh3bdg.sch.id';

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: siteUrl, changeFrequency: 'weekly', priority: 1 },
    { url: `${siteUrl}/daftar`, changeFrequency: 'monthly', priority: 0.9 },
    { url: `${siteUrl}/cek-status`, changeFrequency: 'monthly', priority: 0.6 },
  ];
}
