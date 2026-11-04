'use client';

import { useCallback, useRef, useState } from 'react';
import { Button, Modal } from '@smpmuh3/ui';

export interface ConfirmOptions {
  /** Judul singkat — pertanyaan keputusan. */
  title: string;
  /** Penjelasan konsekuensi aksi (opsional). */
  body?: string | undefined;
  /** Label tombol konfirmasi — default "Ya, lanjutkan". */
  confirmLabel?: string | undefined;
  /** Aksi berbahaya → tombol merah. Default true. */
  danger?: boolean | undefined;
}

interface Pending extends Required<Omit<ConfirmOptions, 'body' | 'confirmLabel' | 'danger'>> {
  body?: string | undefined;
  confirmLabel?: string | undefined;
  danger: boolean;
  resolve: (ok: boolean) => void;
}

/**
 * Dialog konfirmasi untuk keputusan krusial (hapus, batal, void, verifikasi,
 * transisi status) — pengganti window.confirm yang konsisten dengan desain.
 *
 * ```tsx
 * const { confirm, dialog } = useConfirm();
 * …
 * if (await confirm({ title: 'Hapus transaksi?', danger: true })) …
 * …
 * return (… {dialog} …);
 * ```
 */
export function useConfirm() {
  const [pending, setPending] = useState<Pending | null>(null);
  const resolveRef = useRef<((ok: boolean) => void) | null>(null);

  const confirm = useCallback(
    (opts: ConfirmOptions | string): Promise<boolean> =>
      new Promise((resolve) => {
        const o = typeof opts === 'string' ? { title: opts } : opts;
        resolveRef.current = resolve;
        setPending({
          title: o.title,
          body: o.body,
          confirmLabel: o.confirmLabel ?? 'Ya, lanjutkan',
          danger: o.danger ?? true,
          resolve,
        });
      }),
    [],
  );

  const close = (ok: boolean) => {
    resolveRef.current?.(ok);
    resolveRef.current = null;
    setPending(null);
  };

  const dialog = (
    <Modal
      open={pending !== null}
      onClose={() => close(false)}
      title={pending?.title ?? ''}
      size="md"
    >
      <div className="space-y-5">
        {pending?.body ? (
          <p className="text-sm leading-relaxed text-sand-600">{pending.body}</p>
        ) : null}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={() => close(false)}>
            Batal
          </Button>
          <Button
            type="button"
            variant={pending?.danger ? 'danger' : 'primary'}
            onClick={() => close(true)}
          >
            {pending?.confirmLabel ?? 'Ya, lanjutkan'}
          </Button>
        </div>
      </div>
    </Modal>
  );

  return { confirm, dialog };
}
