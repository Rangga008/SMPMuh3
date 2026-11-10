import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseFilePipeBuilder,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Res,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import * as XLSX from 'xlsx';
import { PERMISSIONS, type AuthUser } from '@smpmuh3/types';
import { CurrentUser } from '../identity/decorators/current-user.decorator';
import { RequirePermission } from '../identity/decorators/require-permission.decorator';
import { AcademicService } from './academic.service';
import {
  AssessmentDto,
  CalendarEventDto,
  ClassDto,
  CurriculumDto,
  EmployeeDto,
  EnrollmentDto,
  GradeDto,
  ScheduleEntryDto,
  SemesterDto,
  SubjectDto,
  TeachingAssignmentDto,
  UpdateClassDto,
  UpdateCurriculumDto,
  UpdateSemesterDto,
  UpdateSubjectDto,
} from './dto/academic.dto';
import { ArrayNotEmpty, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

class GradesBody {
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => GradeDto)
  grades!: GradeDto[];
}

const R = PERMISSIONS.ACADEMIC_READ;
const M = PERMISSIONS.ACADEMIC_MANAGE;
const ER = PERMISSIONS.EMPLOYEE_READ;
const EM = PERMISSIONS.EMPLOYEE_MANAGE;

@Controller({ version: '1' })
export class AcademicController {
  constructor(private readonly academic: AcademicService) {}

  // ---------- Employees ----------
  @Get('employees')
  @RequirePermission(ER)
  employees(
    @Query('type') type?: string,
    @Query('search') search?: string,
    @Query('department') department?: string,
  ) {
    return this.academic.listEmployees(type, search, department);
  }

  /** Anggota bidang milik pegawai yang login — untuk kepala bidang. */
  @Get('employees/my-department')
  myDepartment(@CurrentUser() u: AuthUser) {
    return this.academic.myDepartment(u.id);
  }

  @Post('employees')
  @RequirePermission(EM)
  createEmployee(@CurrentUser() u: AuthUser, @Body() dto: EmployeeDto) {
    return this.academic.createEmployee(dto, u.id);
  }

  @Patch('employees/:id')
  @RequirePermission(EM)
  updateEmployee(
    @CurrentUser() u: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: EmployeeDto,
  ) {
    return this.academic.updateEmployee(id, dto, u.id);
  }

  /** Template Excel import pegawai — header sesuai kolom yang dibaca import. */
  @Get('employees/import-template')
  @RequirePermission(ER)
  importTemplate(@Res({ passthrough: true }) res: Response) {
    const ws = XLSX.utils.aoa_to_sheet([
      ['name', 'nip', 'type', 'email', 'phone', 'password', 'department', 'is_dept_head'],
    ]);
    ws['!cols'] = [{ wch: 28 }, { wch: 16 }, { wch: 10 }, { wch: 26 }, { wch: 16 }, { wch: 14 }, { wch: 14 }, { wch: 12 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Pegawai');
    const guide = XLSX.utils.json_to_sheet([
      { kolom: 'name', wajib: 'YA', keterangan: 'Nama lengkap pegawai — contoh: Ahmad Hidayat, S.Pd.' },
      { kolom: 'nip', wajib: 'tidak', keterangan: 'NIP/NUPTK — dipakai untuk dedup; jangan dobel — contoh: 19750101001' },
      { kolom: 'type', wajib: 'tidak', keterangan: 'TEACHER (guru) atau STAFF — default TEACHER' },
      { kolom: 'email', wajib: 'tidak*', keterangan: 'Email — dipakai login akun; harus unik antar akun — contoh: ahmad@sekolah.sch.id' },
      { kolom: 'phone', wajib: 'tidak*', keterangan: 'No. HP — dipakai login akun; harus unik — contoh: 081234567890' },
      { kolom: 'password', wajib: 'tidak', keterangan: 'Password akun — diisi = dipakai apa adanya; KOSONG = digenerate acak & tampil di hasil import — contoh: guru123' },
      { kolom: 'department', wajib: 'tidak', keterangan: 'KURIKULUM / KESISWAAN / TATA_USAHA / KEUANGAN / HUMAS / LAINNYA' },
      { kolom: 'is_dept_head', wajib: 'tidak', keterangan: 'Isi "ya" bila kepala bidang (wakasek/kepala TU)' },
      { kolom: '*akun', wajib: '-', keterangan: 'Akun login dibuat bila email/HP diisi & opsi "buat akun" dicentang — password dari kolom password atau acak, tampil di hasil import' },
    ]);
    guide['!cols'] = [{ wch: 14 }, { wch: 8 }, { wch: 80 }];
    XLSX.utils.book_append_sheet(wb, guide, 'Petunjuk');
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
    res.set({
      'Content-Type':
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="template-pegawai.xlsx"',
    });
    return new StreamableFile(buf);
  }

  /**
   * Import pegawai dari Excel/CSV — anti-redundan: NIP/email/HP yang sudah
   * ada di-update, bukan dibuat ulang. Kolom: name, nip, type, email,
   * phone, department, is_dept_head.
   */
  @Post('employees/import')
  @RequirePermission(EM)
  @UseInterceptors(FileInterceptor('file'))
  async importEmployees(
    @CurrentUser() u: AuthUser,
    @UploadedFile(
      new ParseFilePipeBuilder()
        .addMaxSizeValidator({ maxSize: 5 * 1024 * 1024 })
        .build({ fileIsRequired: true }),
    )
    file: Express.Multer.File,
    @Query('dry') dry?: string,
    @Query('accounts') accounts?: string,
  ) {
    const name = file.originalname.toLowerCase();
    if (!name.endsWith('.xlsx') && !name.endsWith('.xls') && !name.endsWith('.csv')) {
      throw new BadRequestException('Hanya file Excel (.xlsx/.xls) atau CSV');
    }
    let wb: XLSX.WorkBook;
    try {
      wb = XLSX.read(file.buffer, { type: 'buffer' });
    } catch {
      throw new BadRequestException('File tidak dapat dibaca');
    }
    const rows: Parameters<AcademicService['importEmployees']>[0] = [];
    for (const sn of wb.SheetNames) {
      if (sn.toLowerCase() === 'petunjuk') continue;
      const sheet = wb.Sheets[sn];
      if (!sheet) continue;
      for (const r of XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' })) {
        const g = (...keys: string[]) => {
          for (const k of keys) {
            const v = r[k];
            if (v !== undefined && v !== null && String(v).trim() !== '') return String(v).trim();
          }
          return '';
        };
        rows.push({
          name: g('name', 'nama', 'Nama'),
          nip: g('nip', 'NIP', 'nuptk', 'NUPTK', 'nip_nuptk', 'nip/nuptk') || undefined,
          type: g('type', 'jenis', 'Jenis').toUpperCase() || undefined,
          email: g('email', 'Email') || undefined,
          phone: g('phone', 'hp', 'telepon', 'Telepon', 'HP') || undefined,
          password: g('password', 'sandi', 'kata_sandi', 'Password') || undefined,
          department: g('department', 'bidang', 'Bidang').toUpperCase() || undefined,
          isDeptHead: ['1', 'true', 'ya', 'yes', 'y'].includes(g('is_dept_head', 'kepala_bidang').toLowerCase()) || undefined,
        });
      }
    }
    if (!rows.length) throw new BadRequestException('File tidak berisi baris data.');
    return this.academic.importEmployees(rows, u.id, {
      dryRun: dry === '1' || dry === 'true',
      createAccounts: accounts === '1' || accounts === 'true',
    });
  }

  /**
   * Hapus pegawai — yang sudah punya relasi (penugasan/absensi/payroll)
   * dinonaktifkan; yang bersih dihapus beserta akun loginnya.
   */
  @Delete('employees/:id')
  @RequirePermission(EM)
  deleteEmployee(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() u: AuthUser) {
    return this.academic.deleteEmployee(id, u.id);
  }

  /** Profil lengkap pegawai — data + penugasan mengajar (detail guru). */
  @Get('employees/:id')
  @RequirePermission(ER)
  employeeDetail(@Param('id', ParseUUIDPipe) id: string) {
    return this.academic.employeeDetail(id);
  }

  // ---------- Kalender akademik ----------

  /** Kalender sebulan — siapa mengajar per tanggal + event libur/kegiatan. Terbuka untuk semua bidang yang login. */
  @Get('academic-calendar')
  academicCalendar(@Query('month') month: string) {
    if (!month) throw new BadRequestException('Parameter month wajib (YYYY-MM).');
    return this.academic.academicCalendar(month);
  }

  @Get('academic-calendar/events')
  calendarEvents(@Query('from') from?: string, @Query('to') to?: string) {
    return this.academic.listCalendarEvents(from || undefined, to || undefined);
  }

  @Post('academic-calendar/events')
  @RequirePermission(EM)
  createCalendarEvent(@Body() dto: CalendarEventDto, @CurrentUser() u: AuthUser) {
    return this.academic.createCalendarEvent(dto, u.id);
  }

  @Patch('academic-calendar/events/:id')
  @RequirePermission(EM)
  updateCalendarEvent(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CalendarEventDto,
    @CurrentUser() u: AuthUser,
  ) {
    return this.academic.updateCalendarEvent(id, dto, u.id);
  }

  @Delete('academic-calendar/events/:id')
  @RequirePermission(EM)
  deleteCalendarEvent(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() u: AuthUser) {
    return this.academic.deleteCalendarEvent(id, u.id);
  }

  // ---------- Curriculum & subjects ----------
  @Get('curricula')
  @RequirePermission(R)
  curricula() {
    return this.academic.listCurricula();
  }

  @Post('curricula')
  @RequirePermission(M)
  createCurriculum(@CurrentUser() u: AuthUser, @Body() dto: CurriculumDto) {
    return this.academic.createCurriculum(dto, u.id);
  }

  @Patch('curricula/:id')
  @RequirePermission(M)
  updateCurriculum(
    @CurrentUser() u: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCurriculumDto,
  ) {
    return this.academic.updateCurriculum(id, dto, u.id);
  }

  @Delete('curricula/:id')
  @RequirePermission(M)
  removeCurriculum(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.academic.removeCurriculum(id, u.id);
  }

  @Get('subjects')
  @RequirePermission(R)
  subjects(@Query('curriculumId') curriculumId?: string) {
    return this.academic.listSubjects(curriculumId);
  }

  @Post('subjects')
  @RequirePermission(M)
  createSubject(@CurrentUser() u: AuthUser, @Body() dto: SubjectDto) {
    return this.academic.createSubject(dto, u.id);
  }

  @Patch('subjects/:id')
  @RequirePermission(M)
  updateSubject(
    @CurrentUser() u: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSubjectDto,
  ) {
    return this.academic.updateSubject(id, dto, u.id);
  }

  @Delete('subjects/:id')
  @RequirePermission(M)
  removeSubject(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.academic.removeSubject(id, u.id);
  }

  @Get('semesters')
  @RequirePermission(R)
  semesters(@Query('academicYearId') academicYearId?: string) {
    return this.academic.listSemesters(academicYearId);
  }

  @Post('semesters')
  @RequirePermission(M)
  createSemester(@CurrentUser() u: AuthUser, @Body() dto: SemesterDto) {
    return this.academic.createSemester(dto, u.id);
  }

  @Patch('semesters/:id')
  @RequirePermission(M)
  updateSemester(
    @CurrentUser() u: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSemesterDto,
  ) {
    return this.academic.updateSemester(id, dto, u.id);
  }

  @Delete('semesters/:id')
  @RequirePermission(M)
  removeSemester(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.academic.removeSemester(id, u.id);
  }

  // ---------- Classes & enrollment ----------
  @Get('classes')
  @RequirePermission(R)
  classes(@Query('academicYearId') academicYearId?: string) {
    return this.academic.listClasses(academicYearId);
  }

  @Post('classes')
  @RequirePermission(M)
  createClass(@CurrentUser() u: AuthUser, @Body() dto: ClassDto) {
    return this.academic.createClass(dto, u.id);
  }

  @Patch('classes/:id')
  @RequirePermission(M)
  updateClass(
    @CurrentUser() u: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateClassDto,
  ) {
    return this.academic.updateClass(id, dto, u.id);
  }

  @Get('classes/:id/students')
  @RequirePermission(R)
  classStudents(@Param('id', ParseUUIDPipe) id: string) {
    return this.academic.listEnrollments(id);
  }

  @Post('enrollments')
  @RequirePermission(M)
  enroll(@CurrentUser() u: AuthUser, @Body() dto: EnrollmentDto) {
    return this.academic.enroll(dto, u.id);
  }

  // ---------- Assignments & schedules ----------
  @Get('assignments')
  @RequirePermission(R)
  assignments(@Query('academicYearId') academicYearId?: string) {
    return this.academic.listAssignments(academicYearId);
  }

  @Post('assignments')
  @RequirePermission(M)
  createAssignment(
    @CurrentUser() u: AuthUser,
    @Body() dto: TeachingAssignmentDto,
  ) {
    return this.academic.createAssignment(dto, u.id);
  }

  @Post('schedules')
  @RequirePermission(M)
  createSchedule(@CurrentUser() u: AuthUser, @Body() dto: ScheduleEntryDto) {
    return this.academic.createScheduleEntry(dto, u.id);
  }

  @Get('schedules')
  @RequirePermission(R)
  schedules(
    @Query('classId') classId?: string,
    @Query('academicYearId') academicYearId?: string,
  ) {
    return this.academic.listSchedules(classId, academicYearId);
  }

  @Delete('schedules/:id')
  @RequirePermission(M)
  deleteSchedule(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.academic.deleteScheduleEntry(id, u.id);
  }

  // ---------- Assessments & grades ----------
  @Get('assessments')
  @RequirePermission(R)
  assessments(
    @Query('academicYearId') academicYearId?: string,
    @Query('classId') classId?: string,
  ) {
    return this.academic.listAssessments(academicYearId, classId);
  }

  @Post('assessments')
  @RequirePermission(M)
  createAssessment(@CurrentUser() u: AuthUser, @Body() dto: AssessmentDto) {
    return this.academic.createAssessment(dto, u.id);
  }

  @Post('assessments/:id/grades')
  @RequirePermission(M)
  setGrades(
    @CurrentUser() u: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: GradesBody,
  ) {
    return this.academic.setGrades(id, body.grades, u.id);
  }

  @Get('assessments/:id/grades')
  @RequirePermission(R)
  listGrades(@Param('id', ParseUUIDPipe) id: string) {
    return this.academic.listGrades(id);
  }
}
