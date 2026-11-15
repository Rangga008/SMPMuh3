'use client';

import { useEffect, useState } from 'react';
import { Button, Modal } from '@smpmuh3/ui';
import { getTokens } from '@/lib/api';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

export interface ViewTarget {
  path: string; // path API relatif, mis. /ops/archives/:id/file
  name: string;
  mime?: string | null | undefined;
}

/** Ambil blob ber-auth untuk preview/unduh. */
async function fetchBlob(path: string) {
  const tokens = getTokens();
  const res = await fetch(`${API}${path}`, {
    headers: tokens?.accessToken ? { Authorization: `Bearer ${tokens.accessToken}` } : {},
  });
  if (!res.ok) throw new Error(`Gagal memuat berkas (${res.status}).`);
  return res.blob();
}

export function downloadTarget(t: ViewTarget) {
  return fetchBlob(t.path).then((blob) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = t.name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  });
}

/** Modal viewfinder — tampilkan PDF/gambar langsung; format lain → tombol unduh. */
export function FileViewerModal({ target, onClose }: { target: ViewTarget | null; onClose: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  const [kind, setKind] = useState<'image' | 'pdf' | 'other' | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!target) { setUrl(null); setKind(null); setErr(null); return; }
    let revoked: string | null = null;
    setUrl(null); setErr(null); setKind(null);
    const mime = (target.mime ?? '').toLowerCase();
    const ext = target.name.split('.').pop()?.toLowerCase() ?? '';
    fetchBlob(target.path)
      .then((blob) => {
        const type = blob.type || mime;
        const isImage = type.startsWith('image/') || ['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(ext);
        const isPdf = type === 'application/pdf' || ext === 'pdf';
        setKind(isImage ? 'image' : isPdf ? 'pdf' : 'other');
        revoked = URL.createObjectURL(blob);
        setUrl(revoked);
      })
      .catch((e) => setErr(e instanceof Error ? e.message : 'Gagal memuat berkas.'));
    return () => { if (revoked) URL.revokeObjectURL(revoked); };
  }, [target]);

  if (!target) return null;
  return (
    <Modal open onClose={onClose} title={target.name} size="xl">
      {err ? <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{err}</p> : null}
      {!err && !url ? <p className="py-10 text-center text-sm text-sand-400">Memuat berkas…</p> : null}
      {url && kind === 'image' ? (
        <div className="flex justify-center bg-sand-50">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt={target.name} className="max-h-[70vh] rounded-lg object-contain" />
        </div>
      ) : null}
      {url && kind === 'pdf' ? (
        <iframe src={url} title={target.name} className="h-[70vh] w-full rounded-lg border border-sand-200" />
      ) : null}
      {url && kind === 'other' ? (
        <p className="py-8 text-center text-sm text-sand-500">
          Format ini tidak bisa dipratinjau di browser — unduh untuk membukanya.
        </p>
      ) : null}
      <div className="mt-4 flex justify-end gap-2 border-t border-sand-100 pt-3">
        <Button variant="outline" onClick={onClose}>Tutup</Button>
        <Button onClick={() => void downloadTarget(target)}>Unduh</Button>
      </div>
    </Modal>
  );
}

/** Hook kecil: state target + elemen modal — tinggal {viewer}. */
export function useFileViewer() {
  const [target, setTarget] = useState<ViewTarget | null>(null);
  return {
    open: (t: ViewTarget) => setTarget(t),
    download: downloadTarget,
    viewer: <FileViewerModal target={target} onClose={() => setTarget(null)} />,
  };
}
