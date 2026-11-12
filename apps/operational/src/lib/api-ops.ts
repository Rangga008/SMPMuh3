// ---- OPS (hasil rapat): jadwal, asesmen, absen siswa, dokumen, koleksi, pengajuan, arsip ----
import { API, req, downloadFile, type AcademicYear, type ClassView } from './api';
import type { StudentDto } from '@smpmuh3/types';

const qs = (q: Record<string, string | undefined>) => {
  const p = new URLSearchParams();
  Object.entries(q).forEach(([k, v]) => { if (v) p.set(k, v); });
  const s = p.toString();
  return s ? `?${s}` : '';
};

export interface ScheduleBlock {
  id: string; label: string; day?: number | null; date?: string | null;
  startMinute: number; endMinute: number; academicYearId: string;
}
export const listScheduleBlocks = (academicYearId: string) =>
  req<ScheduleBlock[]>(`/ops/schedule-blocks?academicYearId=${academicYearId}`);
export const createScheduleBlock = (dto: { label: string; day?: number | null | undefined; date?: string | null | undefined; startMinute: number; endMinute: number; academicYearId?: string }) =>
  req<ScheduleBlock>('/ops/schedule-blocks', { method: 'POST', json: dto });
export const deleteScheduleBlock = (id: string) =>
  req(`/ops/schedule-blocks/${id}`, { method: 'DELETE' });

export interface TimetableSlot {
  type: 'lesson' | 'block'; start: number; end: number;
  label: string; code?: string; teacher?: string; room?: string;
}
export const getTimetable = (classId: string) =>
  req<{ class: ClassView; days: Record<number, TimetableSlot[]> }>(`/ops/timetable?classId=${classId}`);
export const downloadTimetableXlsx = (academicYearId: string, classId?: string) =>
  downloadFile(`/ops/timetable.xlsx?academicYearId=${academicYearId}${classId ? `&classId=${classId}` : ''}`, 'jadwal-kelas.xlsx');

export interface AssessmentQuestion {
  id: string; number: number; type: 'MCQ' | 'MCQ_COMPLEX' | 'TRUE_FALSE' | 'MATCHING';
  weight: number; key?: unknown; prompt?: string | null; options?: unknown;
}
export const getAssessmentQuestions = (id: string) => req<AssessmentQuestion[]>(`/ops/assessments/${id}/questions`);
export const setAssessmentQuestions = (id: string, questions: Partial<AssessmentQuestion>[]) =>
  req(`/ops/assessments/${id}/questions`, { method: 'PUT', json: { questions } });
export const downloadQuestionTemplate = (id: string) =>
  downloadFile(`/ops/assessments/${id}/questions/template`, 'template-soal.xlsx');
export const importQuestions = (id: string, file: File) => {
  const fd = new FormData();
  fd.append('file', file);
  return req<{ count: number }>(`/ops/assessments/${id}/questions/import`, { method: 'POST', body: fd });
};
export const saveQuestionAnswers = (questionId: string, rows: { studentId: string; score: number; isCorrect?: boolean | null; answer?: unknown }[]) =>
  req(`/ops/questions/${questionId}/answers`, { method: 'POST', json: { rows } });
export const getQuestionAnalysis = (id: string) =>
  req<{ questions: (AssessmentQuestion & { answered: number; correct: number; correctPct: number | null; avgScore: number; difficulty: string | null })[] }>(`/ops/assessments/${id}/analysis`);
export const getAnswerMatrix = (id: string) =>
  req<{
    assessment: { id: string; name: string; subject: string; class?: string };
    questions: AssessmentQuestion[];
    students: { id: string; name: string; nis?: string | null; cells: ({ score: number; isCorrect?: boolean | null; answer?: unknown } | null)[]; total: number }[];
  }>(`/ops/assessments/${id}/answers`);

export const getGradeLedger = (classId: string, academicYearId: string) =>
  req<{ class: ClassView; subjects: { id: string; name: string; code: string }[]; students: { id: string; name: string; nis?: string | null; scores: (number | null)[] }[] }>(
    `/ops/ledger?classId=${classId}&academicYearId=${academicYearId}`);
export const getClassSubjectStats = (classId: string, academicYearId: string) =>
  req<{ subject: { id: string; name: string; code: string }; count: number; avg: number | null; min: number | null; max: number | null }[]>(
    `/ops/stats?classId=${classId}&academicYearId=${academicYearId}`);

export interface TeacherSession {
  assignmentId: string; class: ClassView; subject: { id: string; name: string; code: string };
  startMinute: number; endMinute: number; room?: string | null;
}
export const getMyTeachingToday = (date?: string) =>
  req<{ date: string; dayOfWeek: number; sessions: TeacherSession[] }>(`/ops/attendance/my-today${date ? `?date=${date}` : ''}`);
export interface ClassAttendanceRow {
  id: string; name: string; nis?: string | null; status: string; note?: string | null;
}
export const getClassAttendance = (classId: string, date: string) =>
  req<{ class: ClassView; date: string; taken: boolean; students: ClassAttendanceRow[] }>(
    `/ops/attendance/class?classId=${classId}&date=${date}`);
export const saveClassAttendance = (dto: { classId: string; date: string; rows: { studentId: string; status: string; note?: string }[] }) =>
  req('/ops/attendance', { method: 'POST', json: dto });
export const getAttendanceRecap = (classId: string, from: string, to: string) =>
  req<{ class: ClassView; daysTaken: number; students: { id: string; name: string; nis?: string | null; present: number; sick: number; permit: number; absent: number; total: number; presentPct: number | null }[] }>(
    `/ops/attendance/recap?classId=${classId}&from=${from}&to=${to}`);

export interface StaffDoc {
  id: string; employeeId: string; category: string; title: string;
  fileName: string; mimeType: string; sizeBytes: number; createdAt: string;
  employee: { id: string; name: string; nip?: string | null };
}
export const listStaffDocs = (q: { employeeId?: string | undefined; category?: string | undefined; q?: string | undefined }) =>
  req<StaffDoc[]>(`/ops/staff-docs${qs(q)}`);
export const uploadStaffDoc = (employeeId: string, category: string, title: string, file: File) => {
  const fd = new FormData();
  fd.append('employeeId', employeeId); fd.append('category', category); fd.append('title', title); fd.append('file', file);
  return req<StaffDoc>('/ops/staff-docs', { method: 'POST', body: fd });
};
export const deleteStaffDoc = (id: string) => req(`/ops/staff-docs/${id}`, { method: 'DELETE' });
export const staffDocUrl = (id: string) => `/api/v1/ops/staff-docs/${id}/file`;

export interface DocCollectionView {
  id: string; title: string; category: string; description?: string | null;
  deadlineAt?: string | null; notifiedAt?: string | null;
  items: { id: string; employeeId: string; submittedAt?: string | null; fileName?: string | null; employee: { id: string; name: string; phone?: string | null } }[];
}
export const listCollections = (academicYearId?: string) =>
  req<DocCollectionView[]>(`/ops/collections${academicYearId ? `?academicYearId=${academicYearId}` : ''}`);
export const getCollection = (id: string) => req<DocCollectionView>(`/ops/collections/${id}`);
export const createCollection = (dto: { title: string; category?: string | undefined; description?: string | undefined; deadlineAt?: string | undefined; academicYearId?: string | undefined; employeeIds: string[] }) =>
  req<DocCollectionView>('/ops/collections', { method: 'POST', json: dto });
export const submitCollectionFile = (collectionId: string, file: File, note?: string) => {
  const fd = new FormData(); fd.append('file', file); if (note) fd.append('note', note);
  return req(`/ops/collections/${collectionId}/submit`, { method: 'POST', body: fd });
};
export const collectionItemUrl = (itemId: string) => `/api/v1/ops/collection-items/${itemId}/file`;

export interface ProgramSubmissionView {
  id: string; department: string; kind: string; title: string; description?: string | null;
  rab?: { name: string; qty: number; unit: string; price: number; amount: number }[] | null;
  amountTotal: number; status: 'PENDING' | 'APPROVED' | 'REJECTED';
  fileName?: string | null; reviewNote?: string | null; createdAt: string;
}
export const listSubmissions = (q: { department?: string | undefined; status?: string | undefined }) =>
  req<ProgramSubmissionView[]>(`/ops/submissions${qs(q)}`);
export const createSubmission = (dto: { department: string; kind: string; title: string; description?: string | undefined; rab?: unknown[] | undefined; amountTotal?: number | undefined }, file?: File) => {
  const fd = new FormData();
  Object.entries(dto).forEach(([k, v]) => {
    if (v === undefined || v === null) return;
    fd.append(k, k === 'rab' ? JSON.stringify(v) : String(v));
  });
  if (file) fd.append('file', file);
  return req<ProgramSubmissionView>('/ops/submissions', { method: 'POST', body: fd });
};
export const reviewSubmission = (id: string, action: 'APPROVED' | 'REJECTED', note?: string) =>
  req(`/ops/submissions/${id}/review`, { method: 'PATCH', json: { action, note } });
export const submissionFileUrl = (id: string) => `/api/v1/ops/submissions/${id}/file`;

export interface ArchiveItemView {
  id: string; title: string; refNumber?: string | null; date?: string | null;
  fileName: string; categoryId?: string | null; category?: { id: string; name: string } | null; createdAt: string;
}
export const listArchiveCategories = () => req<{ id: string; name: string; _count: { items: number } }[]>('/ops/archives/categories');
export const createArchiveCategory = (name: string) =>
  req('/ops/archives/categories', { method: 'POST', json: { name } });
export const listArchives = (q: { categoryId?: string | undefined; q?: string | undefined }) =>
  req<ArchiveItemView[]>(`/ops/archives${qs(q)}`);
export const uploadArchive = (dto: { title: string; categoryId?: string | undefined; refNumber?: string | undefined; date?: string | undefined }, file: File) => {
  const fd = new FormData();
  Object.entries(dto).forEach(([k, v]) => { if (v) fd.append(k, v); });
  fd.append('file', file);
  return req('/ops/archives', { method: 'POST', body: fd });
};
export const archiveFileUrl = (id: string) => `/api/v1/ops/archives/${id}/file`;

export interface PolicyDoc {
  id: string; kind: string; title: string; fileName: string; createdAt: string;
}
export const listPolicies = (kind?: string) => req<PolicyDoc[]>(`/ops/policies${kind ? `?kind=${kind}` : ''}`);
export const uploadPolicy = (kind: string, title: string, file: File) => {
  const fd = new FormData(); fd.append('kind', kind); fd.append('title', title); fd.append('file', file);
  return req<PolicyDoc>('/ops/policies', { method: 'POST', body: fd });
};
export const policyFileUrl = (id: string) => `/api/v1/ops/policies/${id}/file`;

export const listUniforms = () => req<{ id: string; day: number; name: string; note?: string | null }[]>('/ops/uniforms');
export const upsertUniform = (dto: { day: number; name: string; note?: string }) =>
  req('/ops/uniforms', { method: 'PUT', json: dto });

export interface ExamRoomView {
  id: string; name: string; period: string; capacity: number;
  seats: { id: string; seatNo?: number | null; student: { id: string; name: string; nis?: string | null }; class?: { id: string; name: string } | null }[];
  _count: { seats: number };
}
export const listExamRooms = (academicYearId: string, period?: string) =>
  req<ExamRoomView[]>(`/ops/exam-rooms?academicYearId=${academicYearId}${period ? `&period=${period}` : ''}`);
export const createExamRoom = (dto: { name: string; period: string; academicYearId: string; capacity?: number }) =>
  req('/ops/exam-rooms', { method: 'POST', json: dto });
export const assignClassToRoom = (roomId: string, classId: string) =>
  req<{ added: number; skipped: number }>(`/ops/exam-rooms/${roomId}/assign-class`, { method: 'POST', json: { classId } });
export const getExamCards = (roomId: string) =>
  req<{ room: ExamRoomView & { academicYear: AcademicYear }; school: { name: string; logoUrl?: string | null; npsn?: string | null } | null }>(`/ops/exam-rooms/${roomId}/cards`);

export const uploadMutationLetter = (mutationId: string, file: File) => {
  const fd = new FormData(); fd.append('file', file);
  return req(`/ops/mutations/${mutationId}/letter`, { method: 'POST', body: fd });
};
export const mutationLetterUrl = (id: string) => `/api/v1/ops/mutations/${id}/letter`;

export const getStudentRecord = (id: string) =>
  req<StudentDto & {
    previousSchool?: string | null; healthNotes?: string | null;
    fatherName?: string | null; motherName?: string | null;
    parentOccupation?: string | null; parentPhone?: string | null;
    intelligenceNotes?: string | null; leavingNotes?: string | null; otherNotes?: string | null;
    recordDetails?: Record<string, string | undefined> | null;
    address?: string | null; gender?: string | null;
    parent?: { name: string; phone?: string | null; email?: string | null } | null;
    candidate?: { previousSchool?: string | null; address?: string | null; birthPlace?: string | null; birthDate?: string | null } | null;
    enrollments: { class?: { name: string; gradeLevel: number } | null; academicYear: { name: string } }[];
    achievements?: { id: string; title: string; level?: string | null; year?: number | null }[];
    ekskulMemberships?: { id: string; role?: string | null; extracurricular: { name: string; isActive: boolean } }[];
    photoKey?: string | null;
  }>(`/ops/students/${id}/record`);
export const updateStudentRecord = (id: string, dto: Record<string, unknown>) =>
  req(`/ops/students/${id}/record`, { method: 'PATCH', json: dto });

export const uploadStudentPhoto = (id: string, file: File) => {
  const fd = new FormData();
  fd.set('file', file);
  return req<{ photoKey: string }>(`/ops/students/${id}/photo`, { method: 'POST', body: fd });
};
export const studentPhotoUrl = (id: string) => `${API}/ops/students/${id}/photo`;

export interface ImportResult {
  total: number; ok: number; failed: number;
  results: { row: number; name: string; ok: boolean; msg: string; nis?: string | null; nisn?: string | null; kelas?: string | null; hp?: string | null }[];
}
/** Template Excel import siswa — sheet Data + Petunjuk + daftar rombel tahun ajaran aktif. */
export const downloadStudentTemplate = (academicYearId: string) =>
  downloadFile(`/ops/import/students-template?academicYearId=${academicYearId}`, 'template-import-siswa.xlsx');
export const importStudentsDapodik = (academicYearId: string, classMap: Record<string, string>, file: File, dry = false, classId?: string) => {
  const fd = new FormData();
  fd.append('academicYearId', academicYearId);
  fd.append('classMap', JSON.stringify(classMap));
  if (dry) fd.append('dry', '1');
  if (classId) fd.append('classId', classId);
  fd.append('file', file);
  return req<ImportResult>('/ops/import/students', { method: 'POST', body: fd });
};
// import pegawai memakai importEmployees (/employees/import) di api.ts — punya preview + pembuatan akun.

// ---- Matriks jadwal & cetak ----
export interface TimetableMatrix {
  classes: { id: string; name: string }[];
  teachers: { no: number; id: string; name: string; subject: string; dayCounts: Record<number, number>; total: number }[];
  days: {
    day: number;
    rows: {
      start: number; end: number;
      block: { id: string; label: string } | null;
      cells: ({ entryId: string; teacherNo: number; subject: string; teacher: string } | null)[];
    }[];
  }[];
}
export const getTimetableMatrix = (academicYearId: string) =>
  req<TimetableMatrix>(`/ops/timetable-matrix?academicYearId=${encodeURIComponent(academicYearId)}`);
export const attendanceRecapXlsxUrl = (academicYearId: string, year: number, month: number) =>
  `/api/v1/ops/attendance/recap.xlsx?academicYearId=${academicYearId}&year=${year}&month=${month}`;

// ---- Arsip edit/hapus ----
export const updateArchive = (id: string, dto: { title?: string; categoryId?: string; refNumber?: string; date?: string }, file?: File) => {
  const fd = new FormData();
  Object.entries(dto).forEach(([k, v]) => { if (v !== undefined) fd.append(k, v); });
  if (file) fd.append('file', file);
  return req<ArchiveItemView>(`/ops/archives/${id}`, { method: 'PATCH', body: fd });
};
export const deleteArchive = (id: string) => req(`/ops/archives/${id}`, { method: 'DELETE' });

// ---- Sarpras: jenis sarana, sarana, prasarana ----
export interface SaranaType {
  id: string; code: string; label: string;
  isActive: boolean; sortOrder: number;
  _count?: { items: number };
}
export interface SaranaItem {
  id: string; typeId: string; location?: string | null;
  ownership?: string | null; spec?: string | null;
  qty: number; good: number; bad: number; isActive: boolean;
  type: SaranaType;
}
export interface Prasarana {
  id: string; name: string; note?: string | null;
  length?: number | null; width?: number | null;
  ownership?: string | null; isActive: boolean;
}

export const listSaranaTypes = () => req<SaranaType[]>('/ops/sarana-types');
export const createSaranaType = (dto: { code?: string | undefined; label: string; sortOrder?: number | undefined }) =>
  req<SaranaType>('/ops/sarana-types', { method: 'POST', json: dto });
export const updateSaranaType = (id: string, dto: { label?: string | undefined; sortOrder?: number | undefined; isActive?: boolean | undefined }) =>
  req<SaranaType>(`/ops/sarana-types/${id}`, { method: 'PATCH', json: dto });
export const deleteSaranaType = (id: string) =>
  req(`/ops/sarana-types/${id}`, { method: 'DELETE' });

export const listSaranas = () => req<SaranaItem[]>('/ops/saranas');
export const createSarana = (dto: { typeId: string; location?: string | undefined; ownership?: string | undefined; spec?: string | undefined; qty?: number | undefined; good?: number | undefined; bad?: number | undefined }) =>
  req<SaranaItem>('/ops/saranas', { method: 'POST', json: dto });
export const updateSarana = (id: string, dto: Partial<{ typeId: string; location: string | null | undefined; ownership: string | null | undefined; spec: string | null | undefined; qty: number; good: number; bad: number; isActive: boolean }>) =>
  req<SaranaItem>(`/ops/saranas/${id}`, { method: 'PATCH', json: dto });
export const deleteSarana = (id: string) => req(`/ops/saranas/${id}`, { method: 'DELETE' });
export const saranaXlsxUrl = '/api/v1/ops/saranas.xlsx';

export const listPrasaranas = () => req<Prasarana[]>('/ops/prasaranas');
export const createPrasarana = (dto: { name: string; note?: string | undefined; length?: number | undefined; width?: number | undefined; ownership?: string | undefined }) =>
  req<Prasarana>('/ops/prasaranas', { method: 'POST', json: dto });
export const updatePrasarana = (id: string, dto: Partial<{ name: string; note: string | null | undefined; length: number | null | undefined; width: number | null | undefined; ownership: string | null | undefined; isActive: boolean }>) =>
  req<Prasarana>(`/ops/prasaranas/${id}`, { method: 'PATCH', json: dto });
export const deletePrasarana = (id: string) => req(`/ops/prasaranas/${id}`, { method: 'DELETE' });
export const prasaranaXlsxUrl = '/api/v1/ops/prasaranas.xlsx';

// ---- CBT: ujian online siswa ----
export interface ExamView {
  id: string; code: string; title: string; instructions?: string | null;
  academicYearId: string;
  status: 'DRAFT' | 'OPEN' | 'CLOSED';
  classIds: string[]; classNames?: string[];
  startAt: string; endAt: string; durationMin: number;
  shuffle: boolean; showScore: boolean; createdAt: string;
  assessment: {
    id: string; name: string; type: string;
    subject: { name: string; code: string };
    _count?: { questions: number };
    questions?: AssessmentQuestion[];
  };
  _count?: { attempts: number };
  attempts?: {
    id: string; status: string; startedAt: string; submittedAt?: string | null;
    deadline: string; score?: number | null; maxScore?: number | null;
    student: { id: string; name: string; nis?: string | null; className?: string };
  }[];
}
export const listExams = (academicYearId?: string) =>
  req<ExamView[]>(`/cbt/exams${academicYearId ? `?academicYearId=${academicYearId}` : ''}`);
export const createExam = (dto: {
  assessmentId: string; classIds: string[]; startAt: string; endAt: string;
  durationMin: number; title?: string | undefined; instructions?: string | undefined;
  shuffle?: boolean | undefined; showScore?: boolean | undefined;
}) => req<ExamView>('/cbt/exams', { method: 'POST', json: dto });
export const getExam = (id: string) => req<ExamView>(`/cbt/exams/${id}`);
export const updateExam = (id: string, dto: Partial<{
  title: string; instructions: string | null; startAt: string; endAt: string;
  durationMin: number; classIds: string[]; shuffle: boolean; showScore: boolean;
  status: 'DRAFT' | 'OPEN' | 'CLOSED';
}>) => req<ExamView>(`/cbt/exams/${id}`, { method: 'PATCH', json: dto });
export const regenerateExamCode = (id: string) =>
  req<{ id: string; code: string }>(`/cbt/exams/${id}/regenerate-code`, { method: 'POST' });
export const deleteExam = (id: string) => req(`/cbt/exams/${id}`, { method: 'DELETE' });
