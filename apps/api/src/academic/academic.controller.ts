import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { PERMISSIONS, type AuthUser } from '@smpmuh3/types';
import { CurrentUser } from '../identity/decorators/current-user.decorator';
import { RequirePermission } from '../identity/decorators/require-permission.decorator';
import { AcademicService } from './academic.service';
import {
  AssessmentDto,
  ClassDto,
  CurriculumDto,
  EmployeeDto,
  EnrollmentDto,
  GradeDto,
  ScheduleEntryDto,
  SubjectDto,
  TeachingAssignmentDto,
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
  employees(@Query('type') type?: string, @Query('search') search?: string) {
    return this.academic.listEmployees(type, search);
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
