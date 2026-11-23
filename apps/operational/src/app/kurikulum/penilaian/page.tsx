'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Badge, Button, Field, Input, Modal, Select } from '@smpmuh3/ui';
import { Shell } from '@/components/shell';
import { PageTitle, Widget } from '@/components/widgets';
import { useConfirm } from '@/components/confirm-dialog';
import {
  ApiError,
  addBookColumn,
  bookExamOptions,
  deleteBookColumn,
  ensureBook,
  getBook,
  getClassMatrix,
  listMatrixClasses,
  listMyBooks,
  pullColumnExam,
  setColumnEntries,
  updateBook,
  updateBookColumn,
  type BookColumn,
  type BookListItem,
  type BookView,
  type ClassMatrix,
  type ExamOption,
  type GradeColumnKind,
  type MatrixClass,
} from '@/lib/api';

const KIND_LABEL: Record<GradeColumnKind, string> = {
  FORMATIF: 'Formatif',
  SUMATIF_LM: 'Sumatif LM',
  ASAJ: 'ASAJ',
  CUSTOM: 'Tambahan',
};
const KIND_TONE: Record<GradeColumnKind, 'primary' | 'accent' | 'neutral' | 'danger'> = {
  FORMATIF: 'neutral',
  SUMATIF_LM: 'primary',
  ASAJ: 'accent',
  CUSTOM: 'neutral',
};
const fmt = (v: number | null | undefined) => (v == null ? '—' : Number.isInteger(v) ? `${v}` : v.toFixed(1));

export default function PenilaianPage() {
  const [tab, setTab] = useState<'buku' | 'wali'>('buku');
  const [books, setBooks] = useState<BookListItem[] | null>(null);
  const [matrixClasses, setMatrixClasses] = useState<MatrixClass[]>([]);
  const [activeBook, setActiveBook] = useState<BookView | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const loadLists = useCallback(async () => {
    try {
      const [b, mc] = await Promise.all([listMyBooks(), listMatrixClasses()]);
      setBooks(b.books);
      setMatrixClasses(mc.classes);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Gagal memuat daftar buku nilai.');
      setBooks([]);
    }
  }, []);
  useEffect(() => {
    void loadLists();
  }, [loadLists]);

  const openBook = async (item: BookListItem) => {
    try {
      setErr(null);
      const book = item.id
        ? await getBook(item.id)
        : await ensureBook({ classId: item.classId, subjectId: item.subjectId });
      setActiveBook(book);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Gagal membuka buku nilai.');
    }
  };
  const openById = async (id: string) => {
    try {
      setErr(null);
      setActiveBook(await getBook(id));
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Gagal membuka buku nilai.');
    }
  };

  return (
    <Shell>
      <PageTitle
        title="Penilaian"
        subtitle="Buku nilai per kelas × mapel — nilai harian, sumatif, ASAJ, dan kolom tambahan; nilai akhir dikirim ke wali kelas"
      />
      <div className="mb-4 flex gap-2">
        <Button variant={tab === 'buku' ? 'primary' : 'secondary'} onClick={() => setTab('buku')}>
          ✍️ Buku Nilai
        </Button>
        {matrixClasses.length > 0 && (
          <Button variant={tab === 'wali' ? 'primary' : 'secondary'} onClick={() => setTab('wali')}>
            🏠 Wali Kelas
          </Button>
        )}
      </div>
      {err && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-xs font-semibold text-red-700">
          {err}
        </div>
      )}

      {tab === 'buku' && !activeBook && (
        <BookList books={books} onOpen={openBook} />
      )}
      {tab === 'buku' && activeBook && (
        <BookGrid
          book={activeBook}
          onBack={() => {
            setActiveBook(null);
            void loadLists();
          }}
          onBook={setActiveBook}
        />
      )}
      {tab === 'wali' && !activeBook && <WaliMatrix classes={matrixClasses} onOpenBook={openById} />}
      {tab === 'wali' && activeBook && (
        <BookGrid
          book={activeBook}
          onBack={() => setActiveBook(null)}
          onBook={setActiveBook}
        />
      )}
    </Shell>
  );
}

/* ============ Daftar buku nilai — pilih kelas lalu tabel mapel ============ */
function BookList({ books, onOpen }: { books: BookListItem[] | null; onOpen: (b: BookListItem) => void }) {
  const classes = useMemo(() => {
    const m = new Map<string, { id: string; name: string; level: number }>();
    for (const b of books ?? []) {
      if (!m.has(b.classId)) m.set(b.classId, { id: b.classId, name: b.className ?? '?', level: b.classLevel ?? 0 });
    }
    return [...m.values()].sort((a, b) => a.level - b.level || a.name.localeCompare(b.name));
  }, [books]);
  const [classId, setClassId] = useState('');
  useEffect(() => {
    if (classes.length && !classes.some((c) => c.id === classId)) setClassId(classes[0]!.id);
  }, [classes, classId]);
  const rows = (books ?? []).filter((b) => b.classId === classId);

  if (books === null) return <Widget title="Buku Nilai"><p className="py-10 text-center text-xs text-sand-400">Memuat…</p></Widget>;
  if (!books.length)
    return (
      <Widget title="Buku Nilai">
        <p className="py-10 text-center text-xs text-sand-400">
          Belum ada penugasan mengajar pada tahun ajaran aktif — buku nilai muncul otomatis dari jadwal/penugasan.
        </p>
      </Widget>
    );
  return (
    <Widget
      title="Buku Nilai Saya"
      subtitle="Satu buku per kelas × mapel — struktur kolom dan bobot bebas diatur sendiri"
      action={
        <Select value={classId} onChange={(e) => setClassId(e.target.value)} className="w-48" searchable={false}>
          {classes.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </Select>
      }
    >
      <div className="overflow-x-auto rounded-2xl border border-sand-200">
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr className="bg-sand-100 text-left text-[11px] uppercase tracking-wide text-sand-500">
              <th className="px-3 py-2">Mata Pelajaran</th>
              <th className="w-16 px-2 py-2 text-center">Kode</th>
              <th className="w-24 px-2 py-2 text-center">Kolom</th>
              <th className="w-28 px-2 py-2 text-center">Status</th>
              <th className="w-28 px-2 py-2 text-center">Aksi</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((b) => (
              <tr key={`${b.classId}:${b.subjectId}`} className="border-t border-sand-100 hover:bg-sand-50/60">
                <td className="px-3 py-2.5 font-semibold text-sand-800">{b.subjectName}</td>
                <td className="px-2 py-2.5 text-center text-sand-500">{b.subjectCode}</td>
                <td className="px-2 py-2.5 text-center text-sand-500">
                  {b.id ? `${b.columnCount} kolom` : '—'}
                </td>
                <td className="px-2 py-2.5 text-center">
                  {b.submittedAt ? (
                    <Badge tone="accent">Terkirim</Badge>
                  ) : b.id ? (
                    <Badge tone="primary">Draft</Badge>
                  ) : (
                    <Badge tone="neutral">Baru</Badge>
                  )}
                </td>
                <td className="px-2 py-2.5 text-center">
                  <Button size="sm" variant={b.id ? 'secondary' : 'primary'} onClick={() => onOpen(b)}>
                    {b.id ? 'Buka' : 'Buat'}
                  </Button>
                </td>
              </tr>
            ))}
            {!rows.length && (
              <tr>
                <td colSpan={5} className="py-10 text-center text-sand-400">Tidak ada mapel di kelas ini.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Widget>
  );
}

/* ============ Grid buku nilai (model daftar nilai Excel) ============ */
function BookGrid({
  book,
  onBack,
  onBook,
}: {
  book: BookView;
  onBack: () => void;
  onBook: (b: BookView) => void;
}) {
  const { confirm, dialog } = useConfirm();
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [savingCell, setSavingCell] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [editCol, setEditCol] = useState<BookColumn | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const cellKey = (c: string, s: string) => `${c}:${s}`;
  const draftOf = (c: string, s: string, orig?: number) =>
    drafts[cellKey(c, s)] ?? (orig != null ? String(orig) : '');

  const saveCell = async (col: BookColumn, studentId: string) => {
    const key = cellKey(col.id, studentId);
    const raw = (drafts[key] ?? '').trim();
    const row = book.rows.find((r) => r.studentId === studentId);
    const orig = row?.cells[col.id];
    const val = raw === '' ? null : Number(raw.replace(',', '.'));
    if (raw !== '' && (val == null || Number.isNaN(val) || val < 0)) {
      setErr('Nilai harus angka ≥ 0 — kosongkan untuk menghapus.');
      return;
    }
    if ((orig ?? null) === val) return;
    setSavingCell(key);
    setErr(null);
    try {
      onBook(await setColumnEntries(col.id, [{ studentId, score: val }]));
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Gagal menyimpan nilai.');
    } finally {
      setSavingCell(null);
    }
  };

  const doSubmit = async (submit: boolean) => {
    if (
      submit &&
      !(await confirm({
        title: 'Kirim nilai akhir ke wali kelas?',
        body: 'Wali kelas akan melihat NR per siswa pada rekap. Buku masih bisa dibuka kembali bila perlu revisi.',
        confirmLabel: 'Ya, kirim',
        danger: false,
      }))
    )
      return;
    setBusy(true);
    try {
      onBook(await updateBook(book.id, { submit }));
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Gagal memperbarui status.');
    } finally {
      setBusy(false);
    }
  };

  const removeColumn = async (c: BookColumn) => {
    if (!(await confirm(`Hapus kolom "${c.name}" beserta semua nilainya?`))) return;
    setBusy(true);
    try {
      await deleteBookColumn(c.id);
      onBook(await getBook(book.id));
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Gagal menghapus kolom.');
    } finally {
      setBusy(false);
    }
  };

  const pullExam = async (c: BookColumn) => {
    if (!(await confirm(`Tarik nilai dari ujian "${c.examTitle}"? Nilai sel yang sudah terisi akan ditimpa.`))) return;
    setBusy(true);
    try {
      const res = await pullColumnExam(c.id);
      onBook(res.book);
      setErr(res.pulled ? null : 'Tidak ada nilai ujian yang cocok untuk siswa kelas ini.');
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Gagal menarik nilai ujian.');
    } finally {
      setBusy(false);
    }
  };

  const avgCols = book.columns.filter((c) => c.kind === 'FORMATIF' || c.kind === 'SUMATIF_LM');
  const weightedCols = book.columns.filter((c) => (c.kind === 'ASAJ' || c.kind === 'CUSTOM') && c.weight > 0);

  return (
    <div className="space-y-4">
      <Widget
        title={`${book.subject.name} — ${book.class.name}`}
        subtitle={
          book.submittedAt
            ? `Nilai akhir sudah dikirim ke wali kelas (${new Date(book.submittedAt).toLocaleDateString('id-ID')})`
            : `Wali kelas: ${book.class.homeroom?.name ?? '—'} · NR = (${fmt(book.avgWeight)}×rata-rata harian${weightedCols.length ? ' + ' + weightedCols.map((c) => `${fmt(c.weight)}×${c.name}`).join(' + ') : ''}) ÷ total bobot`
        }
        action={
          <div className="flex items-center gap-2">
            {book.submittedAt && <Badge tone="accent">✓ Terkirim ke wali</Badge>}
            <Button variant="secondary" onClick={onBack}>← Daftar</Button>
          </div>
        }
      >
        {err && (
          <div className="mb-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">
            {err}
          </div>
        )}

        {/* Toolbar */}
        {book.canEdit && (
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <Button onClick={() => setAddOpen(true)}>+ Kolom Nilai</Button>
            <Button variant="secondary" onClick={() => setSettingsOpen(true)}>⚙ Rumus &amp; Bobot</Button>
            <span className="flex-1" />
            {book.submittedAt ? (
              <Button variant="secondary" disabled={busy} onClick={() => void doSubmit(false)}>
                Buka kembali (revisi)
              </Button>
            ) : (
              <Button disabled={busy} onClick={() => void doSubmit(true)}>
                📨 Kirim Nilai Akhir ke Wali Kelas
              </Button>
            )}
          </div>
        )}

        {/* Grid */}
        <div className="overflow-x-auto rounded-2xl border border-sand-200">
          <table className="w-full min-w-[640px] border-collapse text-xs">
            <thead>
              <tr className="bg-sand-100 text-left text-[11px] uppercase tracking-wide text-sand-500">
                <th className="sticky left-0 z-10 bg-sand-100 px-2 py-2 text-center">No</th>
                <th className="sticky left-8 z-10 min-w-44 bg-sand-100 px-2 py-2">Nama Siswa</th>
                {book.columns.map((c) => (
                  <th key={c.id} className="min-w-24 border-l border-sand-100 px-1 py-1 text-center">
                    <div className="flex flex-col items-center gap-0.5">
                      <div className="flex items-center gap-1">
                        <button
                          className="font-bold text-sand-800 hover:text-primary-700 disabled:cursor-default"
                          disabled={!book.canEdit}
                          onClick={() => setEditCol(c)}
                          title={book.canEdit ? 'Pengaturan kolom (nama, jenis, bobot, tautan ujian)' : ''}
                        >
                          {c.name}
                        </button>
                        {book.canEdit && (
                          <button
                            className="text-[10px] text-sand-400 hover:text-primary-700"
                            title="Pengaturan kolom"
                            onClick={() => setEditCol(c)}
                          >
                            ✎
                          </button>
                        )}
                        {book.canEdit && (
                          <button
                            className="text-[10px] text-sand-400 hover:text-red-600 disabled:opacity-40"
                            title="Hapus kolom"
                            disabled={busy}
                            onClick={() => void removeColumn(c)}
                          >
                            ✕
                          </button>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        <Badge tone={KIND_TONE[c.kind]}>{KIND_LABEL[c.kind]}</Badge>
                        {c.weight > 0 && (c.kind === 'ASAJ' || c.kind === 'CUSTOM') && (
                          <span className="text-[10px] font-bold text-amber-700">×{fmt(c.weight)}</span>
                        )}
                      </div>
                      {c.examId && (
                        <button
                          className="rounded-md bg-primary-50 px-1.5 py-0.5 text-[10px] font-semibold text-primary-700 hover:bg-primary-100 disabled:text-sand-400"
                          disabled={!book.canEdit || busy}
                          onClick={() => void pullExam(c)}
                          title={`Tarik nilai dari: ${c.examTitle}`}
                        >
                          ⬇ tarik ujian
                        </button>
                      )}
                    </div>
                  </th>
                ))}
                <th className="min-w-16 bg-primary-50 px-1 py-1 text-center font-bold text-primary-800">
                  Rata²
                </th>
                <th className="min-w-16 bg-amber-50 px-1 py-1 text-center font-bold text-amber-800">NR</th>
              </tr>
            </thead>
            <tbody>
              {book.rows.map((r, i) => (
                <tr key={r.studentId} className="border-t border-sand-100 hover:bg-sand-50/60">
                  <td className="sticky left-0 z-10 bg-white px-2 py-1 text-center text-sand-400">
                    {r.absenceNo ?? i + 1}
                  </td>
                  <td className="sticky left-8 z-10 bg-white px-2 py-1 font-semibold text-sand-800">
                    {r.name}
                    {r.nis && <span className="ml-1 font-normal text-sand-400">{r.nis}</span>}
                  </td>
                  {book.columns.map((c) => {
                    const key = cellKey(c.id, r.studentId);
                    return (
                      <td key={c.id} className="px-1 py-1 text-center">
                        <input
                          type="text"
                          inputMode="decimal"
                          placeholder="·"
                          className="w-16 rounded-lg border border-sand-200 bg-white px-1 py-1.5 text-center text-xs tabular-nums shadow-sm outline-none transition placeholder:text-sand-300 hover:border-primary-300 focus:border-primary-400 focus:ring-2 focus:ring-primary-100 disabled:border-transparent disabled:bg-transparent disabled:text-sand-700 disabled:shadow-none"
                          value={draftOf(c.id, r.studentId, r.cells[c.id])}
                          disabled={!book.canEdit || savingCell === key}
                          onChange={(e) =>
                            setDrafts((d) => ({ ...d, [key]: e.target.value }))
                          }
                          onBlur={() => void saveCell(c, r.studentId)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                          }}
                        />
                      </td>
                    );
                  })}
                  <td className="bg-primary-50/60 px-1 py-1 text-center font-bold text-primary-800">
                    {fmt(r.avg)}
                  </td>
                  <td className="bg-amber-50/60 px-1 py-1 text-center font-extrabold text-amber-800">
                    {fmt(r.nr)}
                  </td>
                </tr>
              ))}
              {!book.rows.length && (
                <tr>
                  <td colSpan={book.columns.length + 4} className="py-10 text-center text-sand-400">
                    Belum ada siswa terdaftar di kelas ini.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-[11px] text-sand-400">
          Isi nilai di kotak putih lalu Enter atau klik luar untuk menyimpan · kosongkan untuk
          menghapus nilai · ✎/✕ di kepala kolom untuk atur/hapus kolom ·
          Formatif &amp; Sumatif LM ikut rata-rata ({avgCols.length} kolom) ·
          ASAJ/Tambahan berbobot sendiri · suku kosong tidak dihitung (prorata).
        </p>
      </Widget>

      {dialog}

      {/* Modal tambah kolom */}
      <ColumnModal
        open={addOpen}
        title="Tambah Kolom Nilai"
        bookId={book.id}
        onClose={() => setAddOpen(false)}
        onDone={(b) => {
          setAddOpen(false);
          onBook(b);
        }}
      />

      {/* Modal edit kolom */}
      {editCol && (
        <ColumnModal
          open
          title={`Kolom ${editCol.name}`}
          bookId={book.id}
          column={editCol}
          onClose={() => setEditCol(null)}
          onDone={(b) => {
            setEditCol(null);
            onBook(b);
          }}
          onDelete={() => {
            setEditCol(null);
            void removeColumn(editCol);
          }}
        />
      )}

      {/* Modal pengaturan rumus */}
      <BookSettingsModal
        open={settingsOpen}
        book={book}
        onClose={() => setSettingsOpen(false)}
        onDone={(b) => {
          setSettingsOpen(false);
          onBook(b);
        }}
      />
    </div>
  );
}

/* ============ Modal kolom (tambah/ubah) ============ */
function ColumnModal({
  open,
  title,
  bookId,
  column,
  onClose,
  onDone,
  onDelete,
}: {
  open: boolean;
  title: string;
  bookId: string;
  column?: BookColumn | undefined;
  onClose: () => void;
  onDone: (b: BookView) => void;
  onDelete?: (() => void) | undefined;
}) {
  const [kind, setKind] = useState<GradeColumnKind>(column?.kind ?? 'FORMATIF');
  const [name, setName] = useState(column?.name ?? '');
  const [weight, setWeight] = useState(column ? String(column.weight) : '');
  const [examId, setExamId] = useState(column?.examId ?? '');
  const [exams, setExams] = useState<ExamOption[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    bookExamOptions(bookId)
      .then(setExams)
      .catch(() => setExams([]));
  }, [open, bookId]);

  const weighted = kind === 'ASAJ' || kind === 'CUSTOM';

  const save = async () => {
    setBusy(true);
    setErr(null);
    try {
      const dto = {
        kind,
        ...(name.trim() ? { name: name.trim() } : {}),
        weight: weighted ? Number(weight || (kind === 'ASAJ' ? 2 : 0)) || 0 : 0,
        examId: examId || null,
      };
      const book = column
        ? await updateBookColumn(column.id, dto)
        : await addBookColumn(bookId, dto);
      onDone(book);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Gagal menyimpan kolom.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={title} size="lg">
      <div className="space-y-4">
        {err && <p className="rounded-xl bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">{err}</p>}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Jenis penilaian">
            <Select value={kind} onChange={(e) => setKind(e.target.value as GradeColumnKind)}>
              <option value="FORMATIF">Formatif / harian (ikut rata-rata)</option>
              <option value="SUMATIF_LM">Sumatif lingkup materi (ikut rata-rata)</option>
              <option value="ASAJ">ASAJ — akhir semester (berbobot)</option>
              <option value="CUSTOM">Kolom tambahan (berbobot sendiri)</option>
            </Select>
          </Field>
          <Field label="Nama kolom" hint="Kosongkan untuk nama otomatis (TP1, LM2, …)">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={kind === 'FORMATIF' ? 'TP1' : kind === 'SUMATIF_LM' ? 'LM1' : kind === 'ASAJ' ? 'ASAJ' : 'PR / Tugas 1'} />
          </Field>
          {weighted && (
            <Field label="Bobot pada NR" hint="Contoh buku Excel: rata-rata 2 + ASAJ 2 → NR=(2rata²+2ASAJ)/4">
              <Input type="number" min={0} step="0.5" value={weight} onChange={(e) => setWeight(e.target.value)} placeholder={kind === 'ASAJ' ? '2' : '0'} />
            </Field>
          )}
          <Field label="Tautkan ke ujian (opsional)" hint="Nilai bisa ditarik otomatis dari hasil CBT">
            <Select value={examId} onChange={(e) => setExamId(e.target.value)}>
              <option value="">— tidak ditautkan —</option>
              {(exams ?? []).map((x) => (
                <option key={x.id} value={x.id}>
                  {x.assessmentName} — {x.title} ({x.submitted} nilai)
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <div className="flex items-center gap-2">
          <Button disabled={busy} onClick={() => void save()}>
            {column ? 'Simpan' : 'Tambah Kolom'}
          </Button>
          {column && onDelete && (
            <Button variant="danger" disabled={busy} onClick={onDelete}>
              Hapus Kolom
            </Button>
          )}
          <Button variant="secondary" onClick={onClose}>Batal</Button>
        </div>
      </div>
    </Modal>
  );
}

/* ============ Modal pengaturan rumus buku ============ */
function BookSettingsModal({
  open,
  book,
  onClose,
  onDone,
}: {
  open: boolean;
  book: BookView;
  onClose: () => void;
  onDone: (b: BookView) => void;
}) {
  const [avgWeight, setAvgWeight] = useState(String(book.avgWeight));
  const [weights, setWeights] = useState<Record<string, string>>({});
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setAvgWeight(String(book.avgWeight));
    const w: Record<string, string> = {};
    for (const c of book.columns) {
      if (c.kind === 'ASAJ' || c.kind === 'CUSTOM') w[c.id] = String(c.weight);
    }
    setWeights(w);
  }, [open, book]);

  const weightedCols = book.columns.filter((c) => c.kind === 'ASAJ' || c.kind === 'CUSTOM');
  const avgCols = book.columns.filter((c) => c.kind === 'FORMATIF' || c.kind === 'SUMATIF_LM');

  const save = async () => {
    const aw = Number(avgWeight.replace(',', '.'));
    if (Number.isNaN(aw) || aw < 0) {
      setErr('Bobot rata-rata harus angka ≥ 0.');
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      let b = await updateBook(book.id, { avgWeight: aw });
      for (const c of weightedCols) {
        const w = Number((weights[c.id] ?? '0').replace(',', '.'));
        if (!Number.isNaN(w) && w !== c.weight) {
          b = await updateBookColumn(c.id, { weight: Math.max(0, w) });
        }
      }
      onDone(b);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Gagal menyimpan pengaturan.');
    } finally {
      setBusy(false);
    }
  };

  const wAvg = Number(avgWeight.replace(',', '.')) || 0;
  const preview = `NR = (${fmt(wAvg)}×Rata-rata harian${weightedCols
    .filter((c) => (Number((weights[c.id] ?? '0').replace(',', '.')) || 0) > 0)
    .map((c) => ` + ${fmt(Number(weights[c.id]!.replace(',', '.')) || 0)}×${c.name}`)
    .join('')}) ÷ total bobot terisi`;

  return (
    <Modal open={open} onClose={onClose} title="Rumus & Bobot Nilai Akhir" size="lg">
      <div className="space-y-4">
        {err && <p className="rounded-xl bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">{err}</p>}
        <p className="rounded-xl bg-sand-50 px-3 py-2 text-xs text-sand-600">
          Rata-rata harian dihitung dari <b>{avgCols.length} kolom Formatif + Sumatif LM</b> (sel kosong
          diabaikan). Suku yang belum terisi tidak ikut pembagi — sama hasilnya dengan rumus Excel saat
          semua nilai terisi.
        </p>
        <Field label="Bobot rata-rata harian" hint="Buku Excel bawaan: 2">
          <Input type="number" min={0} step="0.5" value={avgWeight} onChange={(e) => setAvgWeight(e.target.value)} />
        </Field>
        {weightedCols.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-bold uppercase tracking-wide text-sand-500">Bobot per kolom berbobot</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {weightedCols.map((c) => (
                <Field key={c.id} label={`${c.name} (${KIND_LABEL[c.kind]})`}>
                  <Input
                    type="number"
                    min={0}
                    step="0.5"
                    value={weights[c.id] ?? ''}
                    onChange={(e) => setWeights((w) => ({ ...w, [c.id]: e.target.value }))}
                  />
                </Field>
              ))}
            </div>
          </div>
        )}
        <p className="rounded-xl bg-primary-50 px-3 py-2 text-xs font-bold text-primary-800">{preview}</p>
        <div className="flex gap-2">
          <Button disabled={busy} onClick={() => void save()}>Simpan Rumus</Button>
          <Button variant="secondary" onClick={onClose}>Batal</Button>
        </div>
      </div>
    </Modal>
  );
}

/* ============ Matriks wali kelas ============ */
function WaliMatrix({ classes, onOpenBook }: { classes: MatrixClass[]; onOpenBook: (id: string) => void }) {
  const [classId, setClassId] = useState(classes[0]?.id ?? '');
  const [matrix, setMatrix] = useState<ClassMatrix | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!classes.length) return;
    setClassId((cur) => cur || classes[0]!.id);
  }, [classes]);

  useEffect(() => {
    if (!classId) return;
    setLoading(true);
    setErr(null);
    getClassMatrix(classId)
      .then(setMatrix)
      .catch((e) => {
        setMatrix(null);
        setErr(e instanceof ApiError ? e.message : 'Gagal memuat rekap.');
      })
      .finally(() => setLoading(false));
  }, [classId]);

  if (!classes.length)
    return (
      <Widget title="Rekap Wali Kelas">
        <p className="py-10 text-center text-xs text-sand-400">
          Anda bukan wali kelas pada tahun ajaran aktif ini.
        </p>
      </Widget>
    );

  return (
    <Widget
      title="Rekap Nilai Akhir — Wali Kelas"
      subtitle={matrix ? `Kelas ${classes.find((c) => c.id === classId)?.name} · wali: ${matrix.homeroomName ?? 'Anda'} · ${matrix.subjects.filter((s) => s.submittedAt).length}/${matrix.subjects.length} mapel sudah mengirim` : 'Pilih kelas'}
      action={
        <Select value={classId} onChange={(e) => setClassId(e.target.value)} className="w-44">
          {classes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} {c.mine ? '(kelas Anda)' : ''}
            </option>
          ))}
        </Select>
      }
    >
      {err && <p className="mb-3 rounded-xl bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">{err}</p>}
      {loading && <p className="py-10 text-center text-xs text-sand-400">Memuat…</p>}
      {matrix && !loading && (
        <div className="overflow-x-auto rounded-2xl border border-sand-200">
          <table className="w-full min-w-[560px] border-collapse text-xs">
            <thead>
              <tr className="bg-sand-100 text-left text-[11px] uppercase tracking-wide text-sand-500">
                <th className="sticky left-0 z-10 bg-sand-100 px-2 py-2 text-center">No</th>
                <th className="sticky left-8 z-10 min-w-44 bg-sand-100 px-2 py-2">Nama Siswa</th>
                {matrix.subjects.map((s) => (
                  <th key={s.bookId} className="min-w-20 px-1 py-1 text-center">
                    <div className="flex flex-col items-center gap-0.5">
                      <button
                        className="font-bold text-sand-800 underline decoration-dotted underline-offset-2 hover:text-primary-700"
                        title={`${s.name} — buka buku nilai`}
                        onClick={() => onOpenBook(s.bookId)}
                      >
                        {s.code}
                      </button>
                      {s.submittedAt ? (
                        <span className="text-[10px] font-bold text-green-700" title="Sudah dikirim guru">✓</span>
                      ) : (
                        <span className="text-[10px] text-sand-400" title="Belum dikirim">·</span>
                      )}
                    </div>
                  </th>
                ))}
                <th className="min-w-16 bg-amber-50 px-1 py-1 text-center font-bold text-amber-800">Rata²</th>
              </tr>
            </thead>
            <tbody>
              {matrix.rows.map((r, i) => (
                <tr key={r.studentId} className="border-t border-sand-100 hover:bg-sand-50/60">
                  <td className="sticky left-0 z-10 bg-white px-2 py-1 text-center text-sand-400">
                    {r.absenceNo ?? i + 1}
                  </td>
                  <td className="sticky left-8 z-10 bg-white px-2 py-1 font-semibold text-sand-800">
                    {r.name}
                    {r.nis && <span className="ml-1 font-normal text-sand-400">{r.nis}</span>}
                  </td>
                  {matrix.subjects.map((s) => (
                    <td key={s.bookId} className="px-1 py-1 text-center tabular-nums text-sand-700">
                      {fmt(r.per[s.bookId])}
                    </td>
                  ))}
                  <td className="bg-amber-50/60 px-1 py-1 text-center font-extrabold text-amber-800">
                    {fmt(r.mean)}
                  </td>
                </tr>
              ))}
              {!matrix.rows.length && (
                <tr>
                  <td colSpan={matrix.subjects.length + 3} className="py-10 text-center text-sand-400">
                    Belum ada siswa di kelas ini.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
      {matrix && !matrix.subjects.length && !loading && (
        <p className="mt-2 text-[11px] text-sand-400">
          Belum ada buku nilai untuk kelas ini — buku dibuat otomatis saat guru mapel membuka Penilaian.
        </p>
      )}
    </Widget>
  );
}
