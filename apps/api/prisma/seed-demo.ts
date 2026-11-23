/**
 * SEED DEMO — KHUSUS LOKAL. Jangan jalankan di produksi.
 *
 * Mengisi data realistis untuk keperluan screenshot modul sosialisasi:
 *   • 3 akun guru (guru_mapel) + pegawai + penugasan mengajar & jadwal JP
 *   • 4 rombel + ~12 siswa per kelas (dengan password kartu CBT)
 *   • Geofence sekolah, shift, mesin DEMO-FP-01
 *   • Absen pegawai 6 hari terakhir — sumber campur (aplikasi/web/mesin/TU)
 *   • Absen siswa hari ini (hadir + izin + sakit + alfa)
 *   • 1 ujian CBT OPEN — 10 soal (rumus, bacaan, menjodohkan, PG kompleks),
 *     credential, attempt (sebagian selesai/dikerjakan/belum), ruang+kursi
 *
 * Jalankan:  docker exec -w /app/apps/api smpmuh3-api ./node_modules/.bin/tsx prisma/seed-demo.ts
 * Idempotent: kalau akun demo sudah ada, script berhenti (hapus manual bila ingin ulang).
 */
import { PrismaClient } from '@prisma/client';
import argon2 from 'argon2';
import { config as loadDotenv } from 'dotenv';
import { resolve } from 'node:path';

loadDotenv({ path: resolve(process.cwd(), '../../.env') });
loadDotenv({ path: resolve(process.cwd(), '.env'), override: true });

const prisma = new PrismaClient();
const OFFSET = 7 * 3600_000; // WIB
const DEMO_PASSWORD = 'GuruDemo123';

/** Instant dari jam WIB "YYYY-MM-DD HH:mm[:ss]". */
const wib = (y: number, mo: number, d: number, h: number, mi: number, s = 0) =>
  new Date(Date.UTC(y, mo - 1, d, h, mi, s) - OFFSET);
/** Tanggal rekap = UTC-midnight tanggal WIB. */
const dayOf = (y: number, mo: number, d: number) => new Date(Date.UTC(y, mo - 1, d));
const todayWib = () => {
  const w = new Date(Date.now() + OFFSET);
  return { y: w.getUTCFullYear(), mo: w.getUTCMonth() + 1, d: w.getUTCDate() };
};

const pw6 = () => {
  const c = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let s = 'KP';
  for (let i = 0; i < 4; i++) s += c[Math.floor(Math.random() * c.length)];
  return s;
};

const FIRST_M = ['Ahmad', 'Bagus', 'Candra', 'Dimas', 'Eko', 'Farhan', 'Galih', 'Hafiz', 'Ilham', 'Jovan', 'Krisna', 'Luthfi', 'Naufal', 'Omar', 'Putra', 'Rafi', 'Salman', 'Yusuf'];
const FIRST_F = ['Aisyah', 'Bella', 'Citra', 'Dewi', 'Elis', 'Fitri', 'Gita', 'Hana', 'Intan', 'Kirana', 'Laila', 'Nadia', 'Putri', 'Rania', 'Salsabila', 'Zahra'];
const LAST = ['Pratama', 'Saputra', 'Ramadhan', 'Fauzan', 'Maulana', 'Nugraha', 'Salsabila', 'Kusuma', 'Hidayat', 'Wijaya', 'Anggraini', 'Permata', 'Syahputri', 'Alamsyah', 'Firmansyah'];

async function main() {
  if (await prisma.user.findUnique({ where: { email: 'guru.mtk@smpmuh3.sch.id' } })) {
    console.log('Data demo sudah ada — lewati. (Hapus manual bila ingin seed ulang.)');
    return;
  }

  const year = await prisma.academicYear.findFirst({ where: { isActive: true } });
  if (!year) throw new Error('Tidak ada tahun ajaran aktif — jalankan seed.ts dulu.');
  const role = await prisma.role.findUniqueOrThrow({ where: { key: 'guru_mapel' } });
  const hash = await argon2.hash(DEMO_PASSWORD);
  const { y: ty, mo: tmo, d: td } = todayWib();
  const today = dayOf(ty, tmo, td);

  // ---------- Mata pelajaran ----------
  const subjectOf = async (code: string, name: string) =>
    prisma.subject.upsert({ where: { code }, update: {}, create: { code, name } });
  const [mtk, bindo, ipa] = await Promise.all([
    subjectOf('MTK', 'Matematika'),
    subjectOf('BIN', 'Bahasa Indonesia'),
    subjectOf('IPA', 'Ilmu Pengetahuan Alam'),
  ]);

  // ---------- Guru + akun ----------
  const guruDefs = [
    { email: 'guru.mtk@smpmuh3.sch.id', name: 'Ahmad Fauzi, S.Pd.', nip: '19870415 201001 1 003', subject: mtk },
    { email: 'guru.bindo@smpmuh3.sch.id', name: 'Siti Rahmawati, S.Pd.', nip: '19900822 201505 2 007', subject: bindo },
    { email: 'guru.ipa@smpmuh3.sch.id', name: 'Dewi Anggraini, M.Pd.', nip: '19931130 201903 2 011', subject: ipa },
  ];
  const gurus: { id: string; userId: string; subject: typeof mtk; name: string }[] = [];
  for (const g of guruDefs) {
    const user = await prisma.user.create({
      data: { email: g.email, name: g.name, passwordHash: hash, roles: { create: { roleId: role.id } } },
    });
    const emp = await prisma.employee.create({
      data: { name: g.name, type: 'TEACHER', nip: g.nip, userId: user.id, isActive: true, department: 'KURIKULUM', fingerPin: `DEMO${gurus.length + 1}` },
    });
    gurus.push({ id: emp.id, userId: user.id, subject: g.subject, name: g.name });
  }

  // ---------- Rombel ----------
  const classDefs = [
    { name: '7A', grade: 7, wali: gurus[1]! },
    { name: '8A', grade: 8, wali: gurus[2]! },
    { name: '9A', grade: 9, wali: gurus[0]! },
    { name: '9B', grade: 9, wali: gurus[2]! },
  ];
  const classes: { id: string; name: string; grade: number }[] = [];
  for (const c of classDefs) {
    const cls = await prisma.class.upsert({
      where: { name_academicYearId: { name: c.name, academicYearId: year.id } },
      update: { homeroomId: c.wali.id },
      create: { name: c.name, gradeLevel: c.grade, academicYearId: year.id, homeroomId: c.wali.id },
    });
    classes.push({ id: cls.id, name: c.name, grade: c.grade });
  }
  const [c7a, c8a, c9a, c9b] = classes;

  // ---------- Siswa ----------
  let nisSeq = 2627001;
  const studentsOf = new Map<string, { id: string; name: string }[]>();
  for (const cls of classes) {
    const list: { id: string; name: string }[] = [];
    for (let i = 0; i < 12; i++) {
      const female = (i + cls.grade) % 2 === 0;
      const name = `${(female ? FIRST_F : FIRST_M)[(i * 3 + cls.grade) % 18]} ${LAST[(i * 5 + cls.grade) % 15]}`;
      const s = await prisma.student.create({
        data: {
          name, nis: String(nisSeq++), gender: female ? 'FEMALE' : 'MALE',
          birthPlace: 'Bandung', birthDate: new Date(Date.UTC(2011 + (9 - cls.grade), (i * 7) % 12, (i * 3) % 28 + 1)),
          fatherName: `${FIRST_M[(i * 7) % 18]} ${LAST[(i * 5 + cls.grade) % 15]}`,
          motherName: `${FIRST_F[(i * 11) % 18]} ${LAST[(i * 5 + cls.grade) % 15]}`,
          password: pw6(),
          enrollments: { create: { classId: cls.id, academicYearId: year.id, absenceNo: i + 1 } },
        },
      });
      list.push({ id: s.id, name });
    }
    studentsOf.set(cls.id, list);
  }

  // ---------- Penugasan mengajar + jadwal JP ----------
  const assign = async (empId: string, subjectId: string, classId: string) =>
    prisma.teachingAssignment.upsert({
      where: { employeeId_subjectId_classId_academicYearId: { employeeId: empId, subjectId, classId, academicYearId: year.id } },
      update: {},
      create: { employeeId: empId, subjectId, classId, academicYearId: year.id },
    });
  const jm = (h: number, m: number) => h * 60 + m;
  // MTK oleh guru[0]: Sen 07:00-08:30 (9A), Rab 09:40-11:10 (8A), Sab 07:00-08:30 (7A)
  const a1 = await assign(gurus[0]!.id, mtk.id, c9a!.id);
  const a2 = await assign(gurus[0]!.id, mtk.id, c9b!.id);
  const a3 = await assign(gurus[0]!.id, mtk.id, c8a!.id);
  // BIN oleh guru[1]: Sel 07:00-08:30 (9A), Jum 10:10-11:40 (7A)
  const a4 = await assign(gurus[1]!.id, bindo.id, c9a!.id);
  const a5 = await assign(gurus[1]!.id, bindo.id, c7a!.id);
  // IPA oleh guru[2]: Kam 07:00-08:30 (9B), Sab 08:30-10:00 (8A)
  const a6 = await assign(gurus[2]!.id, ipa.id, c9b!.id);
  const a7 = await assign(gurus[2]!.id, ipa.id, c8a!.id);
  await prisma.scheduleEntry.createMany({
    data: [
      { assignmentId: a1.id, day: 1, startMinute: jm(7, 0), endMinute: jm(8, 30) },
      { assignmentId: a2.id, day: 1, startMinute: jm(8, 30), endMinute: jm(10, 0) },
      { assignmentId: a3.id, day: 3, startMinute: jm(9, 40), endMinute: jm(11, 10) },
      { assignmentId: a3.id, day: 6, startMinute: jm(7, 0), endMinute: jm(8, 30) },
      { assignmentId: a4.id, day: 2, startMinute: jm(7, 0), endMinute: jm(8, 30) },
      { assignmentId: a5.id, day: 5, startMinute: jm(10, 10), endMinute: jm(11, 40) },
      { assignmentId: a6.id, day: 4, startMinute: jm(7, 0), endMinute: jm(8, 30) },
      { assignmentId: a7.id, day: 6, startMinute: jm(8, 30), endMinute: jm(10, 0) },
    ],
    skipDuplicates: true,
  });

  // ---------- Pengaturan absen + shift + mesin ----------
  await prisma.attendanceSetting.upsert({
    where: { id: 'global' },
    update: { workStart: '07:00', workEnd: '15:00', checkOutFrom: '12:00', lateAfter: 10, schoolLat: -6.9144, schoolLng: 107.6098, radiusM: 150 },
    create: { id: 'global', workStart: '07:00', workEnd: '15:00', checkOutFrom: '12:00', lateAfter: 10, schoolLat: -6.9144, schoolLng: 107.6098, radiusM: 150 },
  });
  const shift = await prisma.workShift.upsert({
    where: { id: '00000000-0000-4000-8000-000000000001' },
    update: {},
    create: { name: 'Pagi', startMinute: jm(7, 0), endMinute: jm(15, 0), lateAfter: 10, checkOutFrom: jm(12, 0) },
  });
  const device = await prisma.attendanceDevice.upsert({
    where: { serial: 'DEMO-FP-01' },
    update: { isActive: true },
    create: { name: 'Mesin Fingerprint Lobby', serial: 'DEMO-FP-01', mode: 'ICLOCK', isActive: true },
  });
  const employees = await prisma.employee.findMany({ where: { isActive: true }, select: { id: true, fingerPin: true, userId: true } });
  await prisma.employeeShift.createMany({
    data: employees.map((e) => ({ employeeId: e.id, shiftId: shift.id, dayOfWeek: -1 })),
    skipDuplicates: true,
  });

  // ---------- Absen pegawai — 5 hari kerja terakhir + hari ini ----------
  // Sumber bergilir: aplikasi / web / mesin / manual — biar kolom SUMBER bervariasi.
  type Src = { key: (empId: string) => string; source: 'SELFIE' | 'DEVICE' | 'MANUAL'; label: string };
  const SRCS: Src[] = [
    { key: (id) => `SELFIE-APP-${id}`, source: 'SELFIE', label: 'APP' },
    { key: (id) => `SELFIE-WEB-${id}`, source: 'SELFIE', label: 'WEB' },
    { key: () => device.serial, source: 'DEVICE', label: 'MESIN' },
    { key: () => 'MANUAL', source: 'MANUAL', label: 'TU' },
  ];
  // Kumpulan hari kerja mundur dari hari ini (lewati Minggu).
  const days: { y: number; mo: number; d: number }[] = [];
  for (let back = 0; days.length < 6; back++) {
    const w = new Date(Date.now() + OFFSET - back * 86400_000);
    if (w.getUTCDay() === 0) continue; // Minggu
    days.push({ y: w.getUTCFullYear(), mo: w.getUTCMonth() + 1, d: w.getUTCDate() });
  }
  // Pegawai[0] izin hari ke-2 lalu; pegawai[1] telat hari ini; pegawai[2] sakit kemarin.
  for (const [di, day] of days.entries()) {
    const date = dayOf(day.y, day.mo, day.d);
    for (const [ei, emp] of employees.entries()) {
      const src = SRCS[(ei + di) % SRCS.length]!;
      const isToday = di === 0;
      // Skenario izin/sakit — rekap tanpa log.
      if ((ei === 0 && di === 2) || (ei === 2 && di === 1)) {
        await prisma.employeeAttendance.upsert({
          where: { employeeId_date: { employeeId: emp.id, date } },
          update: {},
          create: {
            employeeId: emp.id, date,
            status: ei === 2 ? 'SAKIT' : 'IZIN',
            leaveCategory: ei === 2 ? 'SAKIT' : 'LAINNYA',
            note: ei === 2 ? 'Sakit — surat dokter menyusul' : 'Izin keperluan keluarga',
            source: 'SELFIE',
          },
        });
        continue;
      }
      const late = ei === 1 && di === 0 ? 35 : (ei + di * 3) % 8; // variasi telat kecil
      const inMin = 6 * 60 + 50 + ((ei * 7 + di * 11) % 10); // ~06:50-07:00
      const outMin = 15 * 60 + ((ei * 5 + di * 13) % 40); // ~15:00-15:40
      const inAt = wib(day.y, day.mo, day.d, Math.floor((inMin + late) / 60), (inMin + late) % 60, ei);
      const outAt = wib(day.y, day.mo, day.d, Math.floor(outMin / 60), outMin % 60, 30 + ei);
      const pin = emp.fingerPin ?? `selfie-${emp.id}`;
      await prisma.attendanceLog.createMany({
        data: [
          { deviceKey: src.key(emp.id), deviceId: src.source === 'DEVICE' ? device.id : null, pin, punchedAt: inAt, inOut: 0, employeeId: emp.id, source: src.source, ...(src.source === 'SELFIE' ? { latitude: -6.9144, longitude: 107.6098, photoKey: 'demo/selfie.jpg' } : {}) },
          { deviceKey: src.key(emp.id), deviceId: src.source === 'DEVICE' ? device.id : null, pin, punchedAt: outAt, inOut: 1, employeeId: emp.id, source: src.source, ...(src.source === 'SELFIE' ? { latitude: -6.9144, longitude: 107.6098, photoKey: 'demo/selfie.jpg' } : {}) },
        ],
        skipDuplicates: true,
      });
      const workStart = 7 * 60;
      const workEnd = 15 * 60;
      const lateMin = Math.max(0, inMin + late - workStart);
      const capOut = outAt.getTime() > wib(day.y, day.mo, day.d, 15, 0).getTime() ? wib(day.y, day.mo, day.d, 15, 0) : outAt;
      await prisma.employeeAttendance.upsert({
        where: { employeeId_date: { employeeId: emp.id, date } },
        update: { status: lateMin > 10 ? 'TELAT' : 'HADIR', checkInAt: inAt, checkOutAt: capOut, lateMinutes: lateMin, source: src.source, teachingJp: 4 },
        create: { employeeId: emp.id, date, status: lateMin > 10 ? 'TELAT' : 'HADIR', checkInAt: inAt, checkOutAt: capOut, lateMinutes: lateMin, source: src.source, teachingJp: 4 },
      });
      void isToday;
    }
  }

  // ---------- Absen siswa hari ini — 9A & 7A ----------
  const statuses: ('PRESENT' | 'PERMITTED' | 'SICK' | 'ABSENT')[] = ['PRESENT', 'PRESENT', 'PRESENT', 'PRESENT', 'PRESENT', 'PRESENT', 'PRESENT', 'PRESENT', 'PRESENT', 'SICK', 'PERMITTED', 'ABSENT'];
  for (const cls of [c9a!, c7a!]) {
    const kids = studentsOf.get(cls.id)!;
    const taker = employees.find((e) => e.userId)?.userId ?? null;
    for (const [i, st] of kids.entries()) {
      await prisma.attendanceRecord.upsert({
        where: { studentId_date: { studentId: st.id, date: today } },
        update: {},
        create: {
          studentId: st.id, classId: cls.id, date: today,
          status: statuses[i % statuses.length]!,
          note: i === 9 ? 'Demam — info orang tua' : i === 10 ? 'Izin acara keluarga' : i === 11 ? 'Tanpa keterangan' : null,
          takenBy: taker,
        },
      });
    }
  }

  // ---------- CBT: asesmen + ujian OPEN ----------
  const assessment = await prisma.assessment.create({
    data: { name: 'ASAS Ganjil 2026', type: 'PAS', academicYearId: year.id, maxScore: 100 },
  });
  const startAt = wib(ty, tmo, td, 7, 0);
  const endAt = new Date(Date.now() + 2 * 86400_000);
  const exam = await prisma.exam.create({
    data: {
      code: `DEMO-${pw6().slice(2)}`,
      title: 'ASAS Matematika — Kelas 9',
      assessmentId: assessment.id,
      subjectId: mtk.id,
      gradeLevel: 9,
      academicYearId: year.id,
      classIds: [c9a!.id, c9b!.id],
      instructions: 'Kerjakan dengan jujur. Dilarang membuka aplikasi lain selama ujian berlangsung.',
      startAt,
      endAt,
      durationMin: 90,
      shuffle: true,
      showScore: true,
      status: 'OPEN',
      createdBy: gurus[0]!.userId,
    },
  });

  // Bacaan + 10 soal (examId-scoped) — rumus $…$ & bacaan & menjodohkan & PG kompleks.
  await prisma.assessmentPassage.create({
    data: {
      assessmentId: assessment.id,
      code: 'B1',
      content: '<p>SMP Muhammadiyah 3 mengadakan bakti sosial. Setiap rombel mengumpulkan paket sembako. Rombel 9A mengumpulkan 24 paket, 9B sebanyak 30 paket, dan 9C sebanyak 18 paket. Paket dibagikan sama rata ke 6 dusun.</p>',
      sortOrder: 0,
    },
  });
  const qs: {
    n: number; type: 'MCQ' | 'TRUE_FALSE' | 'MCQ_COMPLEX' | 'TRUE_FALSE_COMPLEX' | 'MATCHING';
    w: number; prompt: string; passage?: string; options?: unknown; key: unknown;
  }[] = [
    { n: 1, type: 'MCQ', w: 1, prompt: '<p>Hasil dari $3^2 \\times 2^3$ adalah…</p>', options: { choices: ['<p>$36$</p>', '<p>$48$</p>', '<p>$72$</p>', '<p>$96$</p>'] }, key: 2 },
    { n: 2, type: 'MCQ', w: 1, prompt: '<p>Bentuk sederhana dari $\\frac{6x^2y}{3xy^2}$ adalah…</p>', options: { choices: ['<p>$\\frac{2x}{y}$</p>', '<p>$\\frac{2y}{x}$</p>', '<p>$2xy$</p>', '<p>$\\frac{x}{2y}$</p>'] }, key: 0 },
    { n: 3, type: 'MCQ', w: 1, prompt: '<p>Berdasarkan teks, total paket sembako yang terkumpul adalah…</p>', passage: 'B1', options: { choices: ['<p>60 paket</p>', '<p>66 paket</p>', '<p>72 paket</p>', '<p>78 paket</p>'] }, key: 2 },
    { n: 4, type: 'MCQ', w: 1, prompt: '<p>Setiap dusun menerima … paket.</p>', passage: 'B1', options: { choices: ['<p>10</p>', '<p>11</p>', '<p>12</p>', '<p>14</p>'] }, key: 2 },
    { n: 5, type: 'TRUE_FALSE', w: 1, prompt: '<p>Nilai dari $\\sqrt{144} + 3^2$ adalah 21.</p>', key: true },
    { n: 6, type: 'MCQ', w: 2, prompt: '<p>Titik $A(-4,7)$ ditranslasikan oleh $T\\begin{pmatrix}5\\\\-3\\end{pmatrix}$. Koordinat bayangan titik $A$ adalah…</p>', options: { choices: ["<p>$A'(1,4)$</p>", "<p>$A'(-9,10)$</p>", "<p>$A'(1,10)$</p>", "<p>$A'(-1,4)$</p>"] }, key: 0 },
    { n: 7, type: 'MCQ_COMPLEX', w: 2, prompt: '<p>Manakah yang merupakan bilangan prima? <i>(Pilih semua yang benar)</i></p>', options: { choices: ['<p>2</p>', '<p>9</p>', '<p>13</p>', '<p>21</p>', '<p>29</p>'] }, key: [0, 2, 4] },
    { n: 8, type: 'TRUE_FALSE_COMPLEX', w: 2, prompt: '<p>Tentukan benar/salah tiap pernyataan tentang segitiga siku-siku dengan sisi 3-4-5:</p>', options: { statements: ['<p>Merupakan tripel Pythagoras</p>', '<p>Sisi terpanjang adalah 4</p>', '<p>Luasnya 6 satuan luas</p>'] }, key: [true, false, true] },
    { n: 9, type: 'MATCHING', w: 2, prompt: '<p>Jodohkan operasi hitung dengan hasilnya:</p>', options: { pairs: [{ left: '<p>$7+8$</p>', right: '<p>15</p>' }, { left: '<p>$9\\times4$</p>', right: '<p>36</p>' }, { left: '<p>$50-17$</p>', right: '<p>33</p>' }], rights: ['<p>36</p>', '<p>33</p>', '<p>15</p>', '<p>40</p>'] }, key: [2, 0, 1] },
    { n: 10, type: 'MCQ', w: 1, prompt: '<p>Suhu badan siswa $37{,}2^\\circ\\text{C}$. Dalam Fahrenheit menjadi… <i>($F = \\frac{9}{5}C + 32$)</i></p>', options: { choices: ['<p>$96{,}96^\\circ\\text{F}$</p>', '<p>$98{,}96^\\circ\\text{F}$</p>', '<p>$99{,}0^\\circ\\text{F}$</p>', '<p>$100{,}4^\\circ\\text{F}$</p>'] }, key: 1 },
  ];
  const questionIds: string[] = [];
  for (const q of qs) {
    const row = await prisma.assessmentQuestion.create({
      data: { examId: exam.id, number: q.n, type: q.type, weight: q.w, prompt: q.prompt, options: (q.options ?? null) as never, passageCode: q.passage ?? null, key: q.key as never },
    });
    questionIds.push(row.id);
  }

  // Credential semua siswa 9A+9B (password = students.password dari kartu).
  const peserta = [...(studentsOf.get(c9a!.id)!), ...(studentsOf.get(c9b!.id)!)];
  for (const st of peserta) {
    const s = await prisma.student.findUniqueOrThrow({ where: { id: st.id }, select: { password: true } });
    await prisma.examCredential.create({
      data: { examId: exam.id, studentId: st.id, password: s.password ?? pw6() },
    });
  }

  // Attempt 9A: 8 SUBMITTED (dgn jawaban+skor), 2 MENGERJAKAN, 2 BELUM.
  const nineA = studentsOf.get(c9a!.id)!;
  const answerFor = (q: (typeof qs)[number], good: boolean): { answer: unknown; correct: boolean; score: number } => {
    const r = good;
    if (q.type === 'MCQ') return { answer: r ? q.key : (Number(q.key) + 1) % 4, correct: r, score: r ? q.w : 0 };
    if (q.type === 'TRUE_FALSE') return { answer: r ? q.key : !q.key, correct: r, score: r ? q.w : 0 };
    if (q.type === 'MCQ_COMPLEX') {
      const k = q.key as number[];
      const a = r ? k : [1, 3];
      return { answer: a, correct: r, score: r ? q.w : 0 };
    }
    if (q.type === 'TRUE_FALSE_COMPLEX') {
      const k = q.key as boolean[];
      const a = r ? k : k.map((v, i) => (i === 0 ? !v : v));
      return { answer: a, correct: r, score: r ? q.w : Math.round((q.w * (k.length - 1)) / k.length) };
    }
    // MATCHING
    const k = q.key as number[];
    const a = r ? k : k.map(() => 3);
    return { answer: a, correct: r, score: r ? q.w : 0 };
  };
  const maxScore = qs.reduce((s, q) => s + q.w, 0);
  for (const [i, st] of nineA.entries()) {
    if (i >= 10) continue; // 2 siswa BELUM mulai
    const working = i >= 8; // 2 siswa sedang mengerjakan
    const started = new Date(startAt.getTime() + 5 * 60_000);
    const deadline = new Date(Math.min(started.getTime() + 90 * 60_000, endAt.getTime()));
    const attempt = await prisma.examAttempt.create({
      data: {
        examId: exam.id, studentId: st.id, deadline,
        status: working ? 'STARTED' : 'SUBMITTED',
        startedAt: started,
        submittedAt: working ? null : new Date(started.getTime() + (55 + i * 4) * 60_000),
        enterCount: i === 8 ? 4 : 1, // satu siswa keluar-masuk → flag monitor
      },
    });
    let score = 0;
    const answered = working ? 4 : qs.length; // yang mengerjakan baru isi 4 soal
    for (const [qi, q] of qs.slice(0, answered).entries()) {
      const good = ((i * 3 + qi) % 10) < 7; // ~70% benar
      const g = answerFor(q, good);
      score += g.score;
      await prisma.examAnswer.create({
        data: { attemptId: attempt.id, questionId: questionIds[qi]!, answer: g.answer as never, isCorrect: g.correct, score: g.score },
      });
      await prisma.studentAnswer.upsert({
        where: { questionId_studentId: { questionId: questionIds[qi]!, studentId: st.id } },
        update: {},
        create: { questionId: questionIds[qi]!, studentId: st.id, answer: g.answer as never, isCorrect: g.correct, score: g.score },
      });
    }
    if (!working) {
      await prisma.examAttempt.update({ where: { id: attempt.id }, data: { score, maxScore } });
      await prisma.grade.create({
        data: { examId: exam.id, assessmentId: assessment.id, studentId: st.id, score: Math.round((score / maxScore) * 100) },
      });
    }
  }

  // ---------- Ruang & kursi ujian (cetak kartu) ----------
  const room = await prisma.examRoom.upsert({
    where: { name_period_academicYearId: { name: 'Lab Komputer 1', period: 'ASAS 2026', academicYearId: year.id } },
    update: {},
    create: { name: 'Lab Komputer 1', period: 'ASAS 2026', academicYearId: year.id, capacity: 24 },
  });
  for (const [i, st] of nineA.entries()) {
    await prisma.examSeat.upsert({
      where: { roomId_studentId: { roomId: room.id, studentId: st.id } },
      update: {},
      create: { roomId: room.id, studentId: st.id, classId: c9a!.id, seatNo: i + 1, code: `9A-${String(i + 1).padStart(2, '0')}` },
    });
  }

  console.log(`
✅ Seed demo selesai:
   • ${employees.length} pegawai (3 guru demo + yang sudah ada) — absen 6 hari, sumber campur
   • ${classes.length} rombel, ${peserta.length + (studentsOf.get(c7a!.id)!.length) + (studentsOf.get(c8a!.id)!.length)} siswa
   • Ujian "${exam.title}" — kode ${exam.code}, status OPEN, ${peserta.length} credential
   • Absen siswa hari ini terisi (9A & 7A)
   • Login guru: guru.mtk / guru.bindo / guru.ipa @smpmuh3.sch.id — sandi ${DEMO_PASSWORD}
`);
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
