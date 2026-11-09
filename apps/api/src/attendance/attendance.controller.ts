import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { PERMISSIONS, type AuthUser } from '@smpmuh3/types';
import { CurrentUser } from '../identity/decorators/current-user.decorator';
import { RequirePermission } from '../identity/decorators/require-permission.decorator';
import { AttendanceService } from './attendance.service';
import {
  AssignShiftDto,
  AttendanceSettingsDto,
  CreateDeviceDto,
  CreateShiftDto,
  ManualPunchDto,
  PinMapDto,
  UpdateDeviceDto,
  UpdateShiftDto,
} from './dto/attendance.dto';

const R = PERMISSIONS.TATAUSAHA_READ;
const M = PERMISSIONS.TATAUSAHA_MANAGE;

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

  // ---------- Pengaturan jadwal ----------

  @Get('settings')
  @RequirePermission(R)
  settings() {
    return this.attendance.getSettings();
  }

  @Patch('settings')
  @RequirePermission(M)
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

  // ---------- Shift kerja ----------

  @Get('shifts')
  @RequirePermission(R)
  shifts() {
    return this.attendance.listShifts();
  }

  @Post('shifts')
  @RequirePermission(M)
  createShift(@Body() dto: CreateShiftDto, @CurrentUser() u: AuthUser) {
    return this.attendance.createShift(dto, u.id);
  }

  @Patch('shifts/:id')
  @RequirePermission(M)
  updateShift(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateShiftDto,
    @CurrentUser() u: AuthUser,
  ) {
    return this.attendance.updateShift(id, dto, u.id);
  }

  @Delete('shifts/:id')
  @RequirePermission(M)
  deleteShift(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() u: AuthUser) {
    return this.attendance.deleteShift(id, u.id);
  }

  // ---------- Penugasan shift ----------

  @Get('employee-shifts')
  @RequirePermission(R)
  employeeShifts(@Query('employeeId') employeeId?: string) {
    return this.attendance.listEmployeeShifts(employeeId || undefined);
  }

  @Post('employee-shifts')
  @RequirePermission(M)
  assignShift(@Body() dto: AssignShiftDto, @CurrentUser() u: AuthUser) {
    return this.attendance.assignShift(dto, u.id);
  }

  @Delete('employee-shifts/:id')
  @RequirePermission(M)
  removeEmployeeShift(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() u: AuthUser) {
    return this.attendance.removeEmployeeShift(id, u.id);
  }
}
