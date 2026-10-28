import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Merge conditional class names with Tailwind-aware dedup. */
export function cn(...classes: ClassValue[]): string {
  return twMerge(clsx(classes));
}
