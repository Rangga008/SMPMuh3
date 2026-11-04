import type { InputHTMLAttributes, LabelHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';
import { cn } from '../lib/cn';

/** Shared styling for text-like form controls. */
export const inputClasses =
  'h-11 w-full rounded-xl border border-sand-300 bg-white px-4 text-sm ' +
  'text-sand-900 shadow-xs placeholder:text-sand-400 ' +
  'transition-colors focus:border-primary-600 focus-visible:focus-ring ' +
  'disabled:cursor-not-allowed disabled:bg-sand-100 disabled:text-sand-500 ' +
  'motion-reduce:transition-none';

export const selectClasses = cn(inputClasses, 'appearance-none pr-10');

export const textareaClasses = cn(
  'min-h-24 w-full rounded-xl border border-sand-300 bg-white px-4 py-3 ' +
    'text-sm text-sand-900 shadow-xs placeholder:text-sand-400 ' +
    'transition-colors focus:border-primary-600 focus-visible:focus-ring ' +
    'disabled:cursor-not-allowed disabled:bg-sand-100 disabled:text-sand-500 ' +
    'motion-reduce:transition-none',
);

/** File picker — tombol ::file-selector-button distyle agar sejajar input lain. */
export const fileInputClasses =
  'w-full cursor-pointer rounded-xl border border-sand-300 bg-white text-sm ' +
  'text-sand-600 shadow-xs transition-colors ' +
  'file:mr-4 file:cursor-pointer file:border-0 file:bg-primary-50 file:px-4 ' +
  'file:py-2.5 file:text-sm file:font-semibold file:text-primary-800 ' +
  'file:transition-colors hover:file:bg-primary-100 ' +
  'focus:border-primary-600 focus-visible:focus-ring ' +
  'disabled:cursor-not-allowed disabled:bg-sand-100 disabled:text-sand-500 ' +
  'motion-reduce:transition-none';

export function Input({ className, type, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      type={type}
      className={cn(type === 'file' ? fileInputClasses : inputClasses, className)}
      {...props}
    />
  );
}

export function Select({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
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
