'use client';

import { useCallback, useRef, useState } from 'react';
import { Button, Field, Input, Modal, Textarea } from '@smpmuh3/ui';

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

export interface PromptOptions {
  /** Judul singkat — apa yang diminta. */
  title: string;
  /** Penjelasan tambahan (opsional). */
  body?: string | undefined;
  /** Label field — default "Catatan". */
  label?: string | undefined;
  /** Placeholder input. */
  placeholder?: string | undefined;
  /** Nilai awal. */
  defaultValue?: string | undefined;
  /** Label tombol OK — default "Simpan". */
  confirmLabel?: string | undefined;
  /** Wajib isi — tombol OK mati bila kosong. */
  required?: boolean | undefined;
  /** Input multiline (textarea). */
  multiline?: boolean | undefined;
}

interface PendingPrompt {
  opts: PromptOptions;
  resolve: (v: string | null) => void;
}

/**
 * Dialog input teks untuk alasan/catatan singkat — pengganti window.prompt
 * yang konsisten dengan desain. Resolve null bila dibatalkan.
 *
 * ```tsx
 * const { prompt, dialog } = usePrompt();
 * const note = await prompt({ title: 'Alasan penolakan', required: true });
 * if (note === null) return; // batal
 * ```
 */
export function usePrompt() {
  const [pending, setPending] = useState<PendingPrompt | null>(null);
  const [value, setValue] = useState('');
  const resolveRef = useRef<((v: string | null) => void) | null>(null);

  const prompt = useCallback(
    (opts: PromptOptions): Promise<string | null> =>
      new Promise((resolve) => {
        resolveRef.current = resolve;
        setValue(opts.defaultValue ?? '');
        setPending({ opts, resolve });
      }),
    [],
  );

  const close = (v: string | null) => {
    resolveRef.current?.(v);
    resolveRef.current = null;
    setPending(null);
  };

  const dialog = (
    <Modal
      open={pending !== null}
      onClose={() => close(null)}
      title={pending?.opts.title ?? ''}
      size="md"
    >
      {pending ? (
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            close(value.trim());
          }}
        >
          {pending.opts.body ? (
            <p className="text-sm leading-relaxed text-sand-600">{pending.opts.body}</p>
          ) : null}
          <Field label={pending.opts.label ?? 'Catatan'}>
            {pending.opts.multiline ? (
              <Textarea
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder={pending.opts.placeholder}
                rows={3}
                autoFocus
              />
            ) : (
              <Input
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder={pending.opts.placeholder}
                autoFocus
              />
            )}
          </Field>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => close(null)}>
              Batal
            </Button>
            <Button
              type="submit"
              disabled={!!pending.opts.required && !value.trim()}
            >
              {pending.opts.confirmLabel ?? 'Simpan'}
            </Button>
          </div>
        </form>
      ) : null}
    </Modal>
  );

  return { prompt, dialog };
}
