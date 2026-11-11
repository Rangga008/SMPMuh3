import { Children, Fragment, isValidElement } from 'react';
import type { InputHTMLAttributes, LabelHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';
import { cn } from '../lib/cn';
import { SearchableSelect, type ParsedOption } from './searchable-select';
import { fileInputClasses, inputClasses, selectClasses, textareaClasses } from './field-classes';

export { fileInputClasses, inputClasses, selectClasses, textareaClasses };

export function Input({ className, type, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      type={type}
      className={cn(type === 'file' ? fileInputClasses : inputClasses, className)}
      {...props}
    />
  );
}

/** Rekursif ambil teks dari children <option> (boleh array/elemen bersarang). */
const textOf = (node: ReactNode): string => {
  if (node == null || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textOf).join('');
  if (isValidElement(node)) return textOf((node.props as { children?: ReactNode }).children);
  return '';
};

/**
 * Baca anak <option>/<optgroup> menjadi daftar opsi datar.
 * Null bila ada anak yang bukan option/optgroup (tak bisa di-combobox-kan).
 */
export function collectOptions(children: ReactNode): ParsedOption[] | null {
  const out: ParsedOption[] = [];
  let ok = true;
  const walk = (nodes: ReactNode, group?: string) => {
    Children.forEach(nodes, (child) => {
      if (child == null || typeof child === 'boolean') return;
      if (!isValidElement(child)) {
        ok = false;
        return;
      }
      if (child.type === 'option') {
        const p = child.props as { value?: string | number; disabled?: boolean; children?: ReactNode };
        const label = textOf(p.children).trim();
        out.push({
          value: p.value === undefined ? label : String(p.value),
          label,
          disabled: !!p.disabled,
          group,
        });
      } else if (child.type === 'optgroup') {
        const p = child.props as { label?: string; children?: ReactNode };
        walk(p.children, p.label ?? group);
      } else if (child.type === Fragment) {
        walk((child.props as { children?: ReactNode }).children, group);
      } else {
        ok = false;
      }
    });
  };
  walk(children);
  return ok ? out : null;
}

/** Opsi >5 otomatis jadi combobox ketik-cari; searchable={false} memaksa native. */
const SEARCH_THRESHOLD = 5;

export function Select({
  className,
  children,
  searchable,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & { searchable?: boolean }) {
  if (!props.multiple && !props.size) {
    const opts = collectOptions(children);
    const want = searchable === true || (searchable !== false && !!opts && opts.length > SEARCH_THRESHOLD);
    if (opts && want) {
      return <SearchableSelect options={opts} className={className} {...props} />;
    }
  }
  return (
    <select className={cn(selectClasses, className)} {...props}>
      {children}
    </select>
  );
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(textareaClasses, className)} {...props} />;
}

interface FieldProps extends LabelHTMLAttributes<HTMLLabelElement> {
  label: string;
  hint?: string | undefined;
  children: ReactNode;
}

/** Label + control + optional hint, stacked with consistent spacing. */
export function Field({ label, hint, children, className, ...props }: FieldProps) {
  return (
    <label className={cn('flex flex-col gap-1.5', className)} {...props}>
      <span className="text-sm font-semibold text-sand-900">{label}</span>
      {children}
      {hint ? <span className="text-xs text-sand-500">{hint}</span> : null}
    </label>
  );
}
