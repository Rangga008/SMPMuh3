import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
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
import { PERMISSIONS, type AuthUser } from '@smpmuh3/types';
import { CurrentUser } from '../identity/decorators/current-user.decorator';
import { RequirePermission } from '../identity/decorators/require-permission.decorator';
import { AttendanceService } from './attendance.service';
import {
  AssignShiftDto,
  AttendanceSettingsDto,
  CreateDeviceDto,
  CreateShiftDto,
  LeaveDto,
  ManualPunchDto,
  PinMapDto,
  SelfiePunchDto,
  UpdateDeviceDto,
  UpdateShiftDto,
} from './dto/attendance.dto';

const R = PERMISSIONS.TATAUSAHA_READ;
const M = PERMISSIONS.TATAUSAHA_MANAGE;
/** Shift kerja, jadwal & lokasi absen — dikelola bidang Kurikulum. */
const AR = PERMISSIONS.ACADEMIC_READ;
const AM = PERMISSIONS.ACADEMIC_MANAGE;

/** Administrasi absensi pegawai — dikelola Tata Usaha. */
@Controller({ path: 'admin/attendance', version: '1' })
export class AttendanceController {
  constructor(private readonly attendance: AttendanceService) {}

  // ---------- Perangkat ----------

  @Get('devices')
  @RequirePermission(R)
  devices() {
    return this.attendance.listDevices();
  }

  @Post('devices')
  @RequirePermission(M)
  createDevice(@Body() dto: CreateDeviceDto, @CurrentUser() u: AuthUser) {
    return this.attendance.createDevice(dto, u.id);
  }

  @Patch('devices/:id')
  @RequirePermission(M)
  updateDevice(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateDeviceDto,
    @CurrentUser() u: AuthUser,
  ) {
    return this.attendance.updateDevice(id, dto, u.id);
  }

  @Delete('devices/:id')
  @RequirePermission(M)
  deleteDevice(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() u: AuthUser) {
    return this.attendance.deleteDevice(id, u.id);
  }

  /** Tarik log langsung dari mesin (mode PULL via TCP 4370). */
  @Post('devices/:id/pull')
  @RequirePermission(M)
  pull(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() u: AuthUser) {
    return this.attendance.pullFromDevice(id, u.id);
  }

  // ---------- Pengaturan jadwal & lokasi (Kurikulum) ----------

  @Get('settings')
  @RequirePermission(AR)
  settings() {
    return this.attendance.getSettings();
  }

  @Patch('settings')
  @RequirePermission(AM)
  updateSettings(@Body() dto: AttendanceSettingsDto, @CurrentUser() u: AuthUser) {
    return this.attendance.updateSettings(dto, u.id);
  }

  // ---------- Pemetaan PIN ----------

  @Get('pins')
  @RequirePermission(R)
  pins() {
    return this.attendance.listPins();
  }

  @Post('pins')
  @RequirePermission(M)
  setPin(@Body() dto: PinMapDto, @CurrentUser() u: AuthUser) {
    return this.attendance.setPin(dto, u.id);
  }

  // ---------- Log & rekap ----------

  @Get('logs')
  @RequirePermission(R)
  logs(
    @Query('date') date?: string,
    @Query('employeeId') employeeId?: string,
    @Query('deviceKey') deviceKey?: string,
  ) {
    return this.attendance.listLogs({
      ...(date ? { date } : {}),
      ...(employeeId ? { employeeId } : {}),
      ...(deviceKey ? { deviceKey } : {}),
    });
  }

  @Get('daily')
  @RequirePermission(R)
  daily(
    @Query('date') date: string,
    @Query('employeeId') employeeId?: string,
    @Query('status') status?: string,
  ) {
    if (!date) throw new BadRequestException('Parameter date wajib (YYYY-MM-DD).');
    return this.attendance.daily(date, {
      ...(employeeId ? { employeeId } : {}),
      ...(status ? { status } : {}),
    });
  }

  /** Rekap sebulan satu pegawai — kalender absensi di detail pegawai. */
  @Get('monthly')
  @RequirePermission(R)
  monthly(@Query('employeeId') employeeId: string, @Query('month') month: string) {
    if (!employeeId || !month) {
      throw new BadRequestException('Parameter employeeId & month wajib.');
    }
    return this.attendance.monthly(employeeId, month);
  }

  /** Catat tap manual oleh TU — pegawai lupa absen / mesin mati. */
  @Post('manual')
  @RequirePermission(M)
  manual(@Body() dto: ManualPunchDto, @CurrentUser() u: AuthUser) {
    return this.attendance.manualPunch(dto, u.id);
  }

  /** Derivasi ulang semua rekap harian dari log mentah. */
  @Post('rederive')
  @RequirePermission(M)
  rederive(@CurrentUser() u: AuthUser) {
    return this.attendance.rederiveAll(u.id);
  }

  /** Impor file attlog ekspor mesin (.dat/.txt/.csv). */
  @Post('import')
  @RequirePermission(M)
  @UseInterceptors(FileInterceptor('file'))
  import(
    @Body('deviceKey') deviceKey: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @CurrentUser() u: AuthUser,
  ) {
    if (!file) throw new BadRequestException('File wajib diunggah.');
    if (!deviceKey) throw new BadRequestException('Pilih perangkat asal file.');
    return this.attendance.importFile(deviceKey.trim(), file.buffer, u.id);
  }

  // ---------- Shift kerja (Kurikulum) ----------

  @Get('shifts')
  @RequirePermission(AR)
  shifts() {
    return this.attendance.listShifts();
  }

  @Post('shifts')
  @RequirePermission(AM)
  createShift(@Body() dto: CreateShiftDto, @CurrentUser() u: AuthUser) {
    return this.attendance.createShift(dto, u.id);
  }

  @Patch('shifts/:id')
  @RequirePermission(AM)
  updateShift(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateShiftDto,
    @CurrentUser() u: AuthUser,
  ) {
    return this.attendance.updateShift(id, dto, u.id);
  }

  @Delete('shifts/:id')
  @RequirePermission(AM)
  deleteShift(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() u: AuthUser) {
    return this.attendance.deleteShift(id, u.id);
  }

  // ---------- Penugasan shift ----------

  @Get('employee-shifts')
  @RequirePermission(AR)
  employeeShifts(@Query('employeeId') employeeId?: string) {
    return this.attendance.listEmployeeShifts(employeeId || undefined);
  }

  @Post('employee-shifts')
  @RequirePermission(AM)
  assignShift(@Body() dto: AssignShiftDto, @CurrentUser() u: AuthUser) {
    return this.attendance.assignShift(dto, u.id);
  }

  @Delete('employee-shifts/:id')
  @RequirePermission(AM)
  removeEmployeeShift(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() u: AuthUser) {
    return this.attendance.removeEmployeeShift(id, u.id);
  }

  // ---------- Absen selfie — semua pegawai yang login ----------

  @Get('my')
  myAttendance(@CurrentUser() u: AuthUser, @Query('month') month?: string) {
    return this.attendance.myAttendance(u.id, month || undefined);
  }

  /** Pegawai setor PENGAJUAN izin (sakit/dinas/workshop/lainnya) — menunggu
      persetujuan piket/kurikulum/TU. Mendukung rentang tanggal & pulang awal. */
  @Post('my/leave')
  submitLeave(@Body() dto: LeaveDto, @CurrentUser() u: AuthUser) {
    return this.attendance.submitLeave(u.id, dto);
  }

  /** Riwayat pengajuan izin milik pegawai yang login. */
  @Get('my/leave')
  myLeaveRequests(@CurrentUser() u: AuthUser) {
    return this.attendance.myLeaveRequests(u.id);
  }

  /** Batalkan pengajuan sendiri yang masih PENDING. */
  @Delete('my/leave/:id')
  cancelLeave(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() u: AuthUser) {
    return this.attendance.cancelLeave(u.id, id);
  }

  /** Approver izin: piket/kurikulum (academic.manage) atau TU (tatausaha.manage).
      ATTENDANCE_MANAGE sengaja TIDAK dipakai — itu izin absen-siswa milik semua guru. */
  private assertLeaveApprover(u: AuthUser) {
    const ok = u.permissions.includes(PERMISSIONS.ACADEMIC_MANAGE)
      || u.permissions.includes(PERMISSIONS.TATAUSAHA_MANAGE);
    if (!ok) throw new ForbiddenException('Hanya piket/kurikulum/TU yang bisa memproses pengajuan izin.');
  }

  /** Daftar pengajuan izin untuk approver (piket/kurikulum/TU). */
  @Get('leave-requests')
  listLeaveRequests(@Query('status') status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED' | undefined, @CurrentUser() u: AuthUser) {
    this.assertLeaveApprover(u);
    return this.attendance.listLeaveRequests(status);
  }

  /** Setujui pengajuan → status tertulis ke rekap harian. */
  @Post('leave-requests/:id/approve')
  approveLeave(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() u: AuthUser) {
    this.assertLeaveApprover(u);
    return this.attendance.approveLeave(id, u.id);
  }

  /** Tolak pengajuan (catatan opsional di body.note). */
  @Post('leave-requests/:id/reject')
  rejectLeave(@Param('id', ParseUUIDPipe) id: string, @Body() body: { note?: string }, @CurrentUser() u: AuthUser) {
    this.assertLeaveApprover(u);
    return this.attendance.rejectLeave(id, u.id, body?.note);
  }

  /** Admin/TU clear absen 1 hari 1 pegawai — hapus rekap + log mentahnya. */
  @Delete('day')
  @RequirePermission(M)
  clearDay(@Query('employeeId') employeeId: string, @Query('date') date: string, @CurrentUser() u: AuthUser) {
    if (!employeeId || !date) throw new BadRequestException('Parameter employeeId & date wajib.');
    return this.attendance.clearDay(employeeId, date, u.id);
  }

  @Post('selfie')
  @UseInterceptors(FileInterceptor('photo'))
  selfie(
    @Body() dto: SelfiePunchDto,
    @UploadedFile() file: Express.Multer.File | undefined,
    @CurrentUser() u: AuthUser,
  ) {
    return this.attendance.selfiePunch(
      u.id,
      Number(dto.inOut) as 0 | 1,
      Number(dto.latitude),
      Number(dto.longitude),
      file,
      dto.platform?.toUpperCase(),
    );
  }

  @Get('logs/:id/photo')
  @RequirePermission(R)
  async logPhoto(@Param('id', ParseUUIDPipe) id: string, @Res({ passthrough: true }) res: Response) {
    const { buffer, mime } = await this.attendance.logPhoto(id);
    res.set({ 'Content-Type': mime, 'Cache-Control': 'private, max-age=60' });
    return new StreamableFile(buffer);
  }
}
