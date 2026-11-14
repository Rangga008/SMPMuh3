import {
  Body,
  Controller,
  Delete,
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
import {
  BosHonorDto,
  BulkAttendanceDto,
  CreateLoanDto,
  CreatePayrollRunDto,
  DeductionTypeDto,
  EmployeeDeductionDto,
  EmployeeHonorDto,
  EmployeePayrollSettingsDto,
  HonorTypeDto,
  PayRunDto,
  PayScaleDto,
  PayrollSettingsDto,
  UpdateLoanDto,
  UpdatePayrollItemDto,
  UpdatePayScaleDto,
} from './dto/payroll.dto';
import { PayrollService } from './payroll.service';

@Controller('admin/payroll')
export class PayrollController {
  constructor(private readonly payroll: PayrollService) {}

  // ---------- Pay scale ----------

  @Get('pay-scales')
  @RequirePermission(PERMISSIONS.PAYROLL_READ)
  payScales() {
    return this.payroll.listPayScales();
  }

  @Post('pay-scales')
  @RequirePermission(PERMISSIONS.PAYROLL_MANAGE)
  createPayScale(@Body() dto: PayScaleDto, @CurrentUser() user: AuthUser) {
    return this.payroll.createPayScale(dto, user.id);
  }

  @Patch('pay-scales/:id')
  @RequirePermission(PERMISSIONS.PAYROLL_MANAGE)
  updatePayScale(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePayScaleDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.payroll.updatePayScale(id, dto, user.id);
  }

  @Delete('pay-scales/:id')
  @RequirePermission(PERMISSIONS.PAYROLL_MANAGE)
  deletePayScale(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.payroll.deletePayScale(id, user.id);
  }

  // ---------- Pegawai ----------

  @Get('employees')
  @RequirePermission(PERMISSIONS.PAYROLL_READ)
  employees() {
    return this.payroll.listEmployeePayroll();
  }

  @Patch('employees/:id/settings')
  @RequirePermission(PERMISSIONS.PAYROLL_MANAGE)
  employeeSettings(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: EmployeePayrollSettingsDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.payroll.updateEmployeeSettings(id, dto, user.id);
  }

  // ---------- Absensi ----------

  @Get('attendance')
  @RequirePermission(PERMISSIONS.PAYROLL_READ)
  attendance(@Query('month') month: string, @Query('employeeId') employeeId?: string) {
    return this.payroll.listAttendance(month, employeeId || undefined);
  }

  @Post('attendance')
  @RequirePermission(PERMISSIONS.PAYROLL_MANAGE)
  saveAttendance(@Body() dto: BulkAttendanceDto, @CurrentUser() user: AuthUser) {
    return this.payroll.upsertAttendance(dto.date, dto.entries, user.id);
  }

  // ---------- Pengaturan global ----------

  @Get('settings')
  @RequirePermission(PERMISSIONS.PAYROLL_READ)
  settings() {
    return this.payroll.getPayrollSettings();
  }

  @Patch('settings')
  @RequirePermission(PERMISSIONS.PAYROLL_MANAGE)
  updateSettings(
    @Body() dto: PayrollSettingsDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.payroll.updatePayrollSettings(dto, user.id);
  }

  // ---------- Honor ----------

  @Get('honor-types')
  @RequirePermission(PERMISSIONS.PAYROLL_READ)
  honorTypes() {
    return this.payroll.listHonorTypes();
  }

  @Post('honor-types')
  @RequirePermission(PERMISSIONS.PAYROLL_MANAGE)
  createHonorType(@Body() dto: HonorTypeDto, @CurrentUser() user: AuthUser) {
    return this.payroll.createHonorType(dto, user.id);
  }

  @Patch('honor-types/:id')
  @RequirePermission(PERMISSIONS.PAYROLL_MANAGE)
  updateHonorType(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: Partial<HonorTypeDto> & { isActive?: boolean },
    @CurrentUser() user: AuthUser,
  ) {
    return this.payroll.updateHonorType(id, dto, user.id);
  }

  @Delete('honor-types/:id')
  @RequirePermission(PERMISSIONS.PAYROLL_MANAGE)
  deleteHonorType(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.payroll.deleteHonorType(id, user.id);
  }

  @Get('employee-honors')
  @RequirePermission(PERMISSIONS.PAYROLL_READ)
  employeeHonors(@Query('employeeId') employeeId?: string) {
    return this.payroll.listEmployeeHonors(employeeId || undefined);
  }

  @Post('employee-honors')
  @RequirePermission(PERMISSIONS.PAYROLL_MANAGE)
  createEmployeeHonor(@Body() dto: EmployeeHonorDto, @CurrentUser() user: AuthUser) {
    return this.payroll.createEmployeeHonor(dto, user.id);
  }

  @Patch('employee-honors/:id')
  @RequirePermission(PERMISSIONS.PAYROLL_MANAGE)
  updateEmployeeHonor(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: Partial<EmployeeHonorDto>,
    @CurrentUser() user: AuthUser,
  ) {
    return this.payroll.updateEmployeeHonor(id, dto, user.id);
  }

  @Delete('employee-honors/:id')
  @RequirePermission(PERMISSIONS.PAYROLL_MANAGE)
  deleteEmployeeHonor(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.payroll.deleteEmployeeHonor(id, user.id);
  }

  // ---------- Potongan ----------

  @Get('deduction-types')
  @RequirePermission(PERMISSIONS.PAYROLL_READ)
  deductionTypes() {
    return this.payroll.listDeductionTypes();
  }

  @Post('deduction-types')
  @RequirePermission(PERMISSIONS.PAYROLL_MANAGE)
  createDeductionType(@Body() dto: DeductionTypeDto, @CurrentUser() user: AuthUser) {
    return this.payroll.createDeductionType(dto, user.id);
  }

  @Patch('deduction-types/:id')
  @RequirePermission(PERMISSIONS.PAYROLL_MANAGE)
  updateDeductionType(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: Partial<DeductionTypeDto> & { isActive?: boolean },
    @CurrentUser() user: AuthUser,
  ) {
    return this.payroll.updateDeductionType(id, dto, user.id);
  }

  @Get('employee-deductions')
  @RequirePermission(PERMISSIONS.PAYROLL_READ)
  employeeDeductions(@Query('employeeId') employeeId?: string) {
    return this.payroll.listEmployeeDeductions(employeeId || undefined);
  }

  @Post('employee-deductions')
  @RequirePermission(PERMISSIONS.PAYROLL_MANAGE)
  createEmployeeDeduction(@Body() dto: EmployeeDeductionDto, @CurrentUser() user: AuthUser) {
    return this.payroll.createEmployeeDeduction(dto, user.id);
  }

  @Patch('employee-deductions/:id')
  @RequirePermission(PERMISSIONS.PAYROLL_MANAGE)
  updateEmployeeDeduction(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: Partial<EmployeeDeductionDto>,
    @CurrentUser() user: AuthUser,
  ) {
    return this.payroll.updateEmployeeDeduction(id, dto, user.id);
  }

  @Delete('employee-deductions/:id')
  @RequirePermission(PERMISSIONS.PAYROLL_MANAGE)
  deleteEmployeeDeduction(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.payroll.deleteEmployeeDeduction(id, user.id);
  }

  // ---------- Pinjaman / koperasi ----------

  @Get('loans')
  @RequirePermission(PERMISSIONS.PAYROLL_READ)
  loans(@Query('employeeId') employeeId?: string, @Query('status') status?: string) {
    return this.payroll.listLoans(employeeId || undefined, status || undefined);
  }

  @Post('loans')
  @RequirePermission(PERMISSIONS.PAYROLL_MANAGE)
  createLoan(@Body() dto: CreateLoanDto, @CurrentUser() user: AuthUser) {
    return this.payroll.createLoan(dto, user.id);
  }

  @Patch('loans/:id')
  @RequirePermission(PERMISSIONS.PAYROLL_MANAGE)
  updateLoan(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateLoanDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.payroll.updateLoan(id, dto, user.id);
  }

  // ---------- Dana pensiun ----------

  @Get('pension')
  @RequirePermission(PERMISSIONS.PAYROLL_READ)
  pensionSummary() {
    return this.payroll.pensionSummary();
  }

  @Get('pension/:employeeId')
  @RequirePermission(PERMISSIONS.PAYROLL_READ)
  pensionLedger(@Param('employeeId', ParseUUIDPipe) employeeId: string) {
    return this.payroll.pensionLedger(employeeId);
  }

  // ---------- Honor BOS ----------

  @Get('bos-honors')
  @RequirePermission(PERMISSIONS.PAYROLL_READ)
  bosHonors(@Query('month') month?: string, @Query('employeeId') employeeId?: string) {
    return this.payroll.listBosHonors(month || undefined, employeeId || undefined);
  }

  @Post('bos-honors')
  @RequirePermission(PERMISSIONS.PAYROLL_MANAGE)
  upsertBosHonor(@Body() dto: BosHonorDto, @CurrentUser() user: AuthUser) {
    return this.payroll.upsertBosHonor(dto, user.id);
  }

  @Delete('bos-honors/:id')
  @RequirePermission(PERMISSIONS.PAYROLL_MANAGE)
  deleteBosHonor(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.payroll.deleteBosHonor(id, user.id);
  }

  // ---------- Payroll run ----------

  @Get('runs')
  @RequirePermission(PERMISSIONS.PAYROLL_READ)
  runs() {
    return this.payroll.listRuns();
  }

  @Get('runs/:id')
  @RequirePermission(PERMISSIONS.PAYROLL_READ)
  run(@Param('id', ParseUUIDPipe) id: string) {
    return this.payroll.getRun(id);
  }

  @Post('runs')
  @RequirePermission(PERMISSIONS.PAYROLL_MANAGE)
  createRun(@Body() dto: CreatePayrollRunDto, @CurrentUser() user: AuthUser) {
    return this.payroll.createRun(dto, user.id);
  }

  @Post('runs/:id/recompute')
  @RequirePermission(PERMISSIONS.PAYROLL_MANAGE)
  recompute(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.payroll.recomputeRun(id, user.id);
  }

  /** Koreksi manual satu item (jam wajib / tambahan menit transport) — run harus DRAFT. */
  @Patch('items/:id')
  @RequirePermission(PERMISSIONS.PAYROLL_MANAGE)
  updateItem(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePayrollItemDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.payroll.updatePayrollItem(id, dto, user.id);
  }

  @Post('runs/:id/finalize')
  @RequirePermission(PERMISSIONS.PAYROLL_MANAGE)
  finalize(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.payroll.finalizeRun(id, user.id);
  }

  @Post('runs/:id/pay')
  @RequirePermission(PERMISSIONS.PAYROLL_MANAGE)
  pay(@Param('id', ParseUUIDPipe) id: string, @Body() dto: PayRunDto, @CurrentUser() user: AuthUser) {
    return this.payroll.payRun(id, dto.cashAccountId, user.id);
  }

  @Post('runs/:id/void')
  @RequirePermission(PERMISSIONS.PAYROLL_MANAGE)
  voidRun(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.payroll.voidRun(id, user.id);
  }

  @Delete('runs/:id')
  @RequirePermission(PERMISSIONS.PAYROLL_MANAGE)
  deleteRun(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.payroll.deleteRun(id, user.id);
  }
}
