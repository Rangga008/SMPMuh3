// ---- OPS (hasil rapat): jadwal, asesmen, absen siswa, dokumen, koleksi, pengajuan, arsip ----
import { req, downloadFile, type AcademicYear, type ClassView } from './api';
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
  weight: number; key?: unknown; prompt?: string | null;
}
export const getAssessmentQuestions = (id: string) => req<AssessmentQuestion[]>(`/ops/assessments/${id}/questions`);
export const setAssessmentQuestions = (id: string, questions: Partial<AssessmentQuestion>[]) =>
  req(`/ops/assessments/${id}/questions`, { method: 'PUT', json: { questions } });
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
  fileName: string; category?: { id: string; name: string } | null; createdAt: string;
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
  req<{ room: ExamRoomView & { academicYear: AcademicYear }; school: { name: string; logoUrl?: string | null } | null }>(`/ops/exam-rooms/${roomId}/cards`);

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
    enrollments: { class?: { name: string; gradeLevel: number } | null; academicYear: { name: string } }[];
  }>(`/ops/students/${id}/record`);
export const updateStudentRecord = (id: string, dto: Record<string, string>) =>
  req(`/ops/students/${id}/record`, { method: 'PATCH', json: dto });

export interface ImportResult {
  total: number; ok: number; failed: number;
  results: { row: number; name: string; ok: boolean; msg: string }[];
}
export const importStudentsDapodik = (academicYearId: string, classMap: Record<string, string>, file: File) => {
  const fd = new FormData();
  fd.append('academicYearId', academicYearId);
  fd.append('classMap', JSON.stringify(classMap));
  fd.append('file', file);
  return req<ImportResult>('/ops/import/students', { method: 'POST', body: fd });
};
export const importEmployeesDapodik = (file: File) => {
  const fd = new FormData(); fd.append('file', file);
  return req<ImportResult>('/ops/import/employees', { method: 'POST', body: fd });
};
