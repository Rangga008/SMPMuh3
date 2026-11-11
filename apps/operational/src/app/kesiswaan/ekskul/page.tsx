'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Badge, Button, Field, Input, Modal, Select } from '@smpmuh3/ui';
import { PERMISSIONS } from '@smpmuh3/types';
import type { StudentDto } from '@smpmuh3/types';
import { Shell } from '@/components/shell';
import { DataTable } from '@/components/data-table';
import { PageTitle } from '@/components/widgets';
import { RowBtn } from '@/components/row-btn';
import { useConfirm } from '@/components/confirm-dialog';
import { StudentPicker } from '@/components/student-picker';
import {
  addEkskulMember,
  createEkskul,
  deleteEkskul,
  listEkskul,
  listEkskulMembers,
  listEmployees,
  me,
  removeEkskulMember,
  updateEkskul,
  type EkskulDto,
  type EkskulMember,
  type EmployeeDto,
} from '@/lib/api';

export default function EkskulPage() {
  const { confirm, dialog } = useConfirm();
  const [rows, setRows] = useState<EkskulDto[]>([]);
  const [employees, setEmployees] = useState<EmployeeDto[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [canManage, setCanManage] = useState(false);
  const [busy, setBusy] = useState(false);
  const [modal, setModal] = useState<'tambah' | 'edit' | null>(null);
  const [editing, setEditing] = useState<EkskulDto | null>(null);
  // Modal anggota — ekskul yang sedang dibuka + daftar anggotanya.
  const [memberOf, setMemberOf] = useState<EkskulDto | null>(null);
  const [members, setMembers] = useState<EkskulMember[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [picked, setPicked] = useState<StudentDto | null>(null);
  const firstRun = useRef(true);

  const load = useCallback((q: string) => {
    setLoading(true);
    listEkskul(q || undefined)
      .then((r) => {
        setRows(r);
        setLoadError(null);
      })
      .catch(() => setLoadError('Gagal memuat data ekskul.'))
      .finally(() => setLoading(false));
  }, []);

  const loadMembers = useCallback((ekskulId: string) => {
    setMembersLoading(true);
    listEkskulMembers(ekskulId)
      .then(setMembers)
      .catch(() => setError('Gagal memuat anggota.'))
      .finally(() => setMembersLoading(false));
  }, []);

  useEffect(() => {
    me()
      .then((u) => setCanManage(u.permissions.includes(PERMISSIONS.STUDENT_MANAGE)))
      .catch(() => setCanManage(false));
    listEmployees().then(setEmployees).catch(() => setEmployees([]));
  }, []);

  useEffect(() => {
    const t = setTimeout(() => load(search), firstRun.current ? 0 : 300);
    firstRun.current = false;
    return () => clearTimeout(t);
  }, [search, load]);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const val = (k: string) => String(f.get(k) ?? '').trim() || undefined;
    const dto = {
      name: val('name'),
      description: val('description'),
      coachId: val('coachId'),
      schedule: val('schedule'),
      isActive: f.get('isActive') === 'on',
    };
    setBusy(true);
    setError(null);
    try {
      if (modal === 'edit' && editing) {
        await updateEkskul(editing.id, dto);
        setNotice('Ekskul diperbarui.');
      } else {
        await createEkskul(dto);
        setNotice('Ekskul ditambahkan.');
      }
      setModal(null);
      setEditing(null);
      load(search);
      if (memberOf && editing && memberOf.id === editing.id) {
        setMemberOf({ ...memberOf, name: dto.name ?? memberOf.name });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menyimpan.');
    } finally {
      setBusy(false);
    }
  }

  async function onAddMember(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!memberOf || !picked) return;
    const role = String(new FormData(e.currentTarget).get('role') ?? '').trim() || undefined;
    setBusy(true);
    setError(null);
    try {
      await addEkskulMember(memberOf.id, picked.id, role);
      setPicked(null);
      e.currentTarget.reset();
      loadMembers(memberOf.id);
      load(search);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menambah anggota.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Shell>
      <PageTitle
        title="Ekstrakurikuler"
        subtitle="Data ekskul sekolah — pembina, jadwal, dan anggota siswa"
        actions={
          canManage ? (
            <Button
              size="sm"
              onClick={() => {
                setEditing(null);
                setModal('tambah');
              }}
            >
              + Tambah Ekskul
            </Button>
          ) : undefined
        }
      />
      {error ? (
        <p role="alert" className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{error}</p>
      ) : null}
      {notice ? (
        <p role="status" className="mb-4 rounded-xl bg-primary-50 px-4 py-3 text-sm font-medium text-primary-800">{notice}</p>
      ) : null}

      <div className="mb-5 rounded-2xl border border-sand-200 bg-white p-4 shadow-card">
        <Input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Cari nama ekskul…"
          aria-label="Cari ekskul"
        />
      </div>

      <DataTable
        head={['Nama Ekskul', 'Pembina', 'Jadwal', 'Anggota', 'Status', '']}
        loading={loading}
        error={loadError}
        empty={rows.length === 0 ? 'Belum ada ekskul terdaftar.' : undefined}
      >
        {rows.map((x) => (
          <tr key={x.id} className={x.isActive ? '' : 'opacity-55'}>
            <td className="px-5 py-3">
              <span className="font-semibold text-sand-900">{x.name}</span>
              {x.description ? (
                <span className="block max-w-xs truncate text-xs text-sand-400">{x.description}</span>
              ) : null}
            </td>
            <td className="px-5 py-3 text-sand-600">{x.coach?.name ?? '—'}</td>
            <td className="px-5 py-3 text-sand-600">{x.schedule ?? '—'}</td>
            <td className="px-5 py-3">
              <Badge tone="primary">{x._count.members} siswa</Badge>
            </td>
            <td className="px-5 py-3">
              <Badge tone={x.isActive ? 'accent' : 'neutral'}>{x.isActive ? 'Aktif' : 'Nonaktif'}</Badge>
            </td>
            <td className="px-5 py-3 text-right">
              <span className="flex justify-end gap-2">
                <RowBtn
                  type="button"
                  tone="neutral"
                  onClick={() => {
                    setMemberOf(x);
                    setPicked(null);
                    loadMembers(x.id);
                  }}
                >
                  Anggota
                </RowBtn>
                {canManage ? (
                  <>
                    <RowBtn
                      type="button"
                      tone="neutral"
                      onClick={() => {
                        setEditing(x);
                        setModal('edit');
                      }}
                    >
                      Ubah
                    </RowBtn>
                    <RowBtn
                      type="button"
                      tone="danger"
                      onClick={async () => {
                        if (!(await confirm(`Hapus ekskul "${x.name}"? Seluruh data anggotanya ikut terhapus.`))) return;
                        try {
                          await deleteEkskul(x.id);
                          setNotice('Ekskul dihapus.');
                          if (memberOf?.id === x.id) setMemberOf(null);
                          load(search);
                        } catch (err) {
                          setError(err instanceof Error ? err.message : 'Gagal menghapus.');
                        }
                      }}
                    >
                      Hapus
                    </RowBtn>
                  </>
                ) : null}
              </span>
            </td>
          </tr>
        ))}
      </DataTable>

      <Modal
        open={modal !== null}
        onClose={() => {
          setModal(null);
          setEditing(null);
        }}
        title={modal === 'edit' ? 'Ubah Ekskul' : 'Tambah Ekskul'}
        size="xl"
      >
        <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2">
          <Field label="Nama Ekskul" className="sm:col-span-2" hint="Mis. Pramuka, PMR, Futsal, Hadroh">
            <Input name="name" required minLength={2} defaultValue={editing?.name ?? ''} />
          </Field>
          <Field label="Pembina" hint="Pegawai pembina ekskul — opsional">
            <Select name="coachId" defaultValue={editing?.coach?.id ?? ''}>
              <option value="">— Belum ditentukan —</option>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>{e.name}</option>
              ))}
            </Select>
          </Field>
          <Field label="Jadwal" hint="Mis. Jumat 15.30–17.00">
            <Input name="schedule" defaultValue={editing?.schedule ?? ''} />
          </Field>
          <Field label="Keterangan" className="sm:col-span-2">
            <Input name="description" defaultValue={editing?.description ?? ''} />
          </Field>
          <label className="sm:col-span-2 flex items-center gap-2 text-sm font-semibold text-sand-800">
            <input type="checkbox" name="isActive" defaultChecked={editing?.isActive ?? true} className="size-4 accent-primary-700" />
            Ekskul aktif
          </label>
          <div className="sm:col-span-2 flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setModal(null)}>Batal</Button>
            <Button type="submit" disabled={busy}>{busy ? 'Menyimpan…' : 'Simpan'}</Button>
          </div>
        </form>
      </Modal>

      <Modal
        open={memberOf !== null}
        onClose={() => setMemberOf(null)}
        title={`Anggota — ${memberOf?.name ?? ''}`}
        description={`Pembina: ${memberOf?.coach?.name ?? '—'} · Jadwal: ${memberOf?.schedule ?? '—'}`}
        size="xl"
      >
        {canManage ? (
          <form onSubmit={onAddMember} className="mb-4 flex flex-wrap items-end gap-3 rounded-xl border border-sand-200 bg-sand-50/60 p-3">
            <div className="min-w-56 flex-1">
              <span className="mb-1 block text-xs font-bold uppercase tracking-wider text-sand-500">Tambah Siswa</span>
              <StudentPicker value={picked} onChange={setPicked} excludeIds={members.map((m) => m.student.id)} />
            </div>
            <label className="flex w-40 flex-col gap-1">
              <span className="text-xs font-bold uppercase tracking-wider text-sand-500">Peran</span>
              <Input name="role" placeholder="Anggota" />
            </label>
            <Button type="submit" size="sm" disabled={busy || !picked}>
              {busy ? '…' : '+ Tambah'}
            </Button>
          </form>
        ) : null}

        <div className="max-h-96 overflow-auto rounded-xl border border-sand-200">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-sand-50 text-left text-xs uppercase tracking-wider text-sand-500">
              <tr>
                <th className="px-4 py-2">Siswa</th>
                <th className="px-4 py-2">Rombel</th>
                <th className="px-4 py-2">Peran</th>
                <th className="px-4 py-2">Sejak</th>
                {canManage ? <th className="px-4 py-2" /> : null}
              </tr>
            </thead>
            <tbody>
              {membersLoading ? (
                <tr><td colSpan={5} className="px-4 py-6 text-center text-sand-400">Memuat…</td></tr>
              ) : members.length === 0 ? (
                <tr><td colSpan={5} className="px-4 py-6 text-center text-sand-400">Belum ada anggota.</td></tr>
              ) : (
                members.map((m) => (
                  <tr key={m.id} className="border-t border-sand-100">
                    <td className="px-4 py-2.5">
                      <span className="font-semibold text-sand-900">{m.student.name}</span>
                      {m.student.nis ? <span className="block text-xs text-sand-400">NIS {m.student.nis}</span> : null}
                    </td>
                    <td className="px-4 py-2.5 text-sand-600">{m.student.enrollments[0]?.class.name ?? '—'}</td>
                    <td className="px-4 py-2.5 text-sand-600">{m.role ?? 'Anggota'}</td>
                    <td className="px-4 py-2.5 text-sand-600">
                      {new Date(m.joinedAt).toLocaleDateString('id-ID')}
                    </td>
                    {canManage ? (
                      <td className="px-4 py-2.5 text-right">
                        <RowBtn
                          type="button"
                          tone="danger"
                          onClick={async () => {
                            if (!(await confirm(`Keluarkan ${m.student.name} dari ${memberOf?.name}?`))) return;
                            try {
                              await removeEkskulMember(m.id);
                              loadMembers(memberOf!.id);
                              load(search);
                            } catch (err) {
                              setError(err instanceof Error ? err.message : 'Gagal mengeluarkan anggota.');
                            }
                          }}
                        >
                          Keluarkan
                        </RowBtn>
                      </td>
                    ) : null}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Modal>
      {dialog}
    </Shell>
  );
}
