import type { ReactNode } from 'react';
import { cn } from '../lib/cn';

export interface AccordionItemProps {
  question: string;
  children: ReactNode;
}

/**
 * Accessible disclosure built on native <details>/<summary> — keyboard
 * accessible and functional without JavaScript.
 */
export function AccordionItem({ question, children }: AccordionItemProps) {
  return (
    <details
      className={cn(
        'group rounded-xl border border-sand-200 bg-white px-5 open:shadow-sm',
        'transition-shadow duration-150 motion-reduce:transition-none',
      )}
    >
      <summary
        className={cn(
          'flex cursor-pointer list-none items-center justify-between gap-4 py-4',
          'font-semibold text-sand-900 select-none',
          'focus-visible:focus-ring rounded-lg',
          '[&::-webkit-details-marker]:hidden',
        )}
      >
        {question}
        <svg
          aria-hidden="true"
          viewBox="0 0 20 20"
          fill="none"
          className="size-5 shrink-0 text-primary-700 transition-transform duration-150 group-open:rotate-180 motion-reduce:transition-none"
        >
          <path
            d="m5 7.5 5 5 5-5"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </summary>
      <div className="pb-5 text-sand-700">{children}</div>
    </details>
  );
}

export function Accordion({ children }: { children: ReactNode }) {
  return <div className="flex flex-col gap-3">{children}</div>;
}
