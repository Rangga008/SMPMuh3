'use client';

import { richHtml } from '@/lib/math';

const LETTERS = 'ABCDE';

/** Bentuk soal yang dipratinjau — sama dengan bentuk API (options/key). */
export interface PreviewQuestion {
  number: number;
  type: string;
  weight?: number;
  prompt?: string | null;
  passageCode?: string | null;
  options?: {
    choices?: string[];
    statements?: string[];
    pairs?: { left: string; right: string }[];
    rights?: string[];
  } | null;
  key?: unknown;
}

const Rich = ({ text }: { text: string }) => (
  <span className="rich-html [&_img]:max-h-40 [&_img]:rounded-lg" dangerouslySetInnerHTML={{ __html: richHtml(text) }} />
);

/**
 * Pratinjau satu butir soal persis tampilan siswa di aplikasi CBT — prompt,
 * pilihan bergaya kartu, pernyataan B/S, atau pasangan menjodohkan. Kunci
 * ditandai hijau (konteks guru — siswa tidak melihatnya).
 */
export function QuestionPreview({
  q,
  passageContent,
  showKey = true,
}: {
  q: PreviewQuestion;
  /** Isi bacaan yang dirujuk passageCode (kalau ada). */
  passageContent?: string | null;
  /** Tampilkan tanda kunci — untuk guru/admin, bukan tampilan siswa murni. */
  showKey?: boolean;
}) {
  const opts = q.options ?? {};
  const keyBtn = (on: boolean) =>
    `${on ? 'border-emerald-500 bg-emerald-50' : 'border-sand-200 bg-white'} ${on ? 'text-emerald-700' : 'text-sand-600'}`;

  let answer: React.ReactNode = null;
  if (q.type === 'MCQ') {
    const key = typeof q.key === 'number' ? (q.key as number) : -1;
    answer = (
      <div className="space-y-2">
        {(opts.choices ?? []).map((c, i) => (
          <div key={i} className={`flex w-full items-start gap-3 rounded-2xl border-2 px-4 py-3 text-left text-sm ${keyBtn(showKey && i === key)}`}>
            <span className={`grid size-7 shrink-0 place-items-center rounded-lg text-xs font-black ${showKey && i === key ? 'bg-emerald-600 text-white' : 'bg-sand-100 text-sand-500'}`}>
              {LETTERS[i]}
            </span>
            <span className="pt-1"><Rich text={c} /></span>
          </div>
        ))}
      </div>
    );
  } else if (q.type === 'MCQ_COMPLEX') {
    const keys = Array.isArray(q.key) ? (q.key as number[]) : [];
    answer = (
      <div className="space-y-2">
        {(opts.choices ?? []).map((c, i) => {
          const on = showKey && keys.includes(i);
          return (
            <div key={i} className={`flex w-full items-start gap-3 rounded-2xl border-2 px-4 py-3 text-left text-sm ${keyBtn(on)}`}>
              <span className={`grid size-7 shrink-0 place-items-center rounded-lg text-xs font-black ${on ? 'bg-emerald-600 text-white' : 'bg-sand-100 text-sand-500'}`}>
                {on ? '✓' : LETTERS[i]}
              </span>
              <span className="pt-1"><Rich text={c} /></span>
            </div>
          );
        })}
      </div>
    );
  } else if (q.type === 'TRUE_FALSE') {
    const key = typeof q.key === 'boolean' ? (q.key as boolean) : null;
    answer = (
      <div className="grid grid-cols-2 gap-3">
        {([['BENAR', true], ['SALAH', false]] as const).map(([lbl, v]) => (
          <div key={lbl} className={`rounded-2xl border-2 py-4 text-center text-sm font-black ${keyBtn(showKey && key === v)}`}>
            {lbl}
          </div>
        ))}
      </div>
    );
  } else if (q.type === 'TRUE_FALSE_COMPLEX') {
    const keys = Array.isArray(q.key) ? (q.key as boolean[]) : [];
    answer = (
      <div className="space-y-2.5">
        {(opts.statements ?? []).map((st, i) => (
          <div key={i} className="flex flex-col gap-2 rounded-2xl border border-sand-200 bg-white p-3.5 sm:flex-row sm:items-center">
            <span className="flex-1 text-sm font-medium">
              <span className="mr-1.5 inline-grid size-6 place-items-center rounded-lg bg-sand-100 text-[11px] font-black text-sand-500">{i + 1}</span>
              <Rich text={st} />
            </span>
            <div className="flex shrink-0 gap-2">
              {([['B', true], ['S', false]] as const).map(([lbl, v]) => (
                <span key={lbl} className={`grid w-12 place-items-center rounded-xl border-2 py-2 text-sm font-black ${keyBtn(showKey && keys[i] === v)}`}>
                  {lbl}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  } else {
    // MATCHING — item kiri + dropdown pasangan kanan.
    const pairs = opts.pairs ?? [];
    const rights = opts.rights?.length ? opts.rights : [...new Set(pairs.map((p) => p.right))];
    const keys = Array.isArray(q.key) ? (q.key as number[]) : [];
    answer = (
      <div className="space-y-2.5">
        {pairs.map((p, i) => (
          <div key={i} className="flex flex-col gap-2 rounded-2xl border border-sand-200 bg-white p-3.5 sm:flex-row sm:items-center">
            <span className="flex-1 text-sm font-medium">
              <span className="mr-1.5 inline-grid size-6 place-items-center rounded-lg bg-sand-100 text-[11px] font-black text-sand-500">{i + 1}</span>
              <Rich text={p.left} />
            </span>
            <span className={`rounded-xl border-2 px-3 py-2 text-sm font-medium ${showKey && keys[i] != null && rights[keys[i]!] ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-sand-200 text-sand-500'}`}>
              {showKey && keys[i] != null && rights[keys[i]!] ? <Rich text={rights[keys[i]!]!} /> : '— pilih pasangan —'}
            </span>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {passageContent ? (
        <div className="rounded-2xl border border-sky-200 bg-sky-50 p-3.5 text-sm text-sand-700">
          <p className="mb-1 text-[11px] font-black uppercase tracking-wide text-sky-700">Bacaan{q.passageCode ? ` ${q.passageCode}` : ''}</p>
          <Rich text={passageContent} />
        </div>
      ) : null}
      <div className="flex gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary-700 text-sm font-black text-white">{q.number}</span>
        <div className="min-w-0 flex-1 pt-1 text-[15px] font-medium leading-relaxed text-sand-900">
          <Rich text={q.prompt ?? ''} />
        </div>
      </div>
      {answer}
    </div>
  );
}
