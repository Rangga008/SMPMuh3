import { NextResponse } from 'next/server';

// Proxy logo sekolah dari API — dipakai sebagai favicon (<link rel="icon">)
// dan bisa dipakai <img> same-origin. Cache singkat agar ganti logo
// cepat terlihat tanpa menunggu ISR halaman.
const API =
  process.env.API_INTERNAL_URL ??
  process.env.NEXT_PUBLIC_API_URL ??
  'http://localhost:4000/api/v1';

export async function GET() {
  try {
    const res = await fetch(`${API}/school/logo`, {
      next: { revalidate: 60 },
    });
    if (!res.ok) return new NextResponse(null, { status: 404 });
    const buf = Buffer.from(await res.arrayBuffer());
    return new NextResponse(buf, {
      headers: {
        'Content-Type': res.headers.get('content-type') ?? 'image/png',
        'Cache-Control': 'public, max-age=60',
      },
    });
  } catch {
    return new NextResponse(null, { status: 404 });
  }
}
