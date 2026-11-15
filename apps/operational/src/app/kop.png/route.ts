import { NextResponse } from 'next/server';

// Proxy gambar kop surat dari API — dipakai <img> di dokumen cetakan.
const API =
  process.env.API_INTERNAL_URL ??
  process.env.NEXT_PUBLIC_API_URL ??
  'http://localhost:4000/api/v1';

export async function GET() {
  try {
    const res = await fetch(`${API}/school/kop`, {
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
