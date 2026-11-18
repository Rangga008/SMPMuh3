'use client';

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="id">
      <body style={{ margin: 0, fontFamily: 'system-ui, -apple-system, sans-serif', background: '#f5f3ee', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <div style={{ width: '100%', maxWidth: 420, background: '#fff', border: '1px solid #e6e2d8', borderRadius: 16, padding: 32, textAlign: 'center', boxShadow: '0 1px 3px rgba(0,0,0,.06)' }}>
          <div style={{ width: 56, height: 56, margin: '0 auto 16px', borderRadius: '50%', background: '#fef2f2', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26 }}>⚠️</div>
          <h1 style={{ margin: 0, fontSize: 18, color: '#1c1917' }}>Terjadi kesalahan</h1>
          <p style={{ margin: '8px 0 0', fontSize: 14, color: '#78716c', lineHeight: 1.5 }}>
            Aplikasi gagal dimuat. Coba muat ulang — jika berulang, hubungi admin.
          </p>
          <div style={{ marginTop: 24, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <button
              type="button"
              onClick={() => window.location.reload()}
              style={{ width: '100%', padding: '10px 16px', borderRadius: 12, border: 'none', background: '#047857', color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
            >
              Muat Ulang Halaman
            </button>
            <button
              type="button"
              onClick={() => reset()}
              style={{ width: '100%', padding: '10px 16px', borderRadius: 12, border: '1px solid #e6e2d8', background: '#fff', color: '#44403c', fontSize: 14, fontWeight: 500, cursor: 'pointer' }}
            >
              Coba Lagi
            </button>
            <a
              href="/"
              style={{ width: '100%', padding: '10px 16px', borderRadius: 12, color: '#78716c', fontSize: 14, fontWeight: 500, textDecoration: 'none', display: 'block', boxSizing: 'border-box' }}
            >
              ← Kembali ke Dasbor
            </a>
          </div>
        </div>
      </body>
    </html>
  );
}
