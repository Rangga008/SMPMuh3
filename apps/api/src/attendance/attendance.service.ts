import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { AttendanceSource, DeviceMode } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../core/prisma/prisma.service';
import { StorageService } from '../core/storage/storage.service';
import type {
  AssignShiftDto,
  AttendanceSettingsDto,
  CreateDeviceDto,
  CreateShiftDto,
  ManualPunchDto,
  PinMapDto,
  UpdateDeviceDto,
  UpdateShiftDto,
} from './dto/attendance.dto';

/** Sekolah berada di WIB — waktu tap mesin (naive) diinterpretasikan UTC+7. */
const DEVICE_OFFSET_MS = 7 * 60 * 60 * 1000;

/** "YYYY-MM-DD HH:mm:ss" (naive, WIB) atau ISO → Date. */
export function parseDeviceTime(raw: string): Date | null {
  const s = raw.trim();
  if (!s) return null;
  // Sudah berisi zona waktu → pakai apa adanya.
  if (/[zZ]|[+-]\d{2}:?\d{2}$/.test(s)) {
    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const m = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(s);
  if (!m) return null;
  const [, y, mo, d, h, mi, se] = m;
  const utc = Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(se ?? 0));
  return new Date(utc - DEVICE_OFFSET_MS);
}

/** Tanggal WIB dari instant → Date UTC-midnight (konvensi EmployeeAttendance.date). */
const localDay = (d: Date) => {
  const w = new Date(d.getTime() + DEVICE_OFFSET_MS);
  return new Date(Date.UTC(w.getUTCFullYear(), w.getUTCMonth(), w.getUTCDate()));
};

/** Menit sejak tengah malam WIB untuk suatu instant. */
const localMinutes = (d: Date) => {
  const w = new Date(d.getTime() + DEVICE_OFFSET_MS);
  return w.getUTCHours() * 60 + w.getUTCMinutes();
};

const hhmmToMin = (s: string) => {
  const [h = 0, m = 0] = s.split(':').map(Number);
  return h * 60 + m;
};

/** Menit sejak 00:00 → "HH:mm". */
const minToHHMM = (m: number) =>
  `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

/** Toleransi absen masuk sebelum jam mulai — masuk lebih awal tetap sah. */
const CHECKIN_EARLY_MIN = 120;

/** Hari dalam seminggu versi lokal WIB — 0=Minggu … 6=Sabtu. */
const dowLocal = (d: Date) =>
  new Date(d.getTime() + DEVICE_OFFSET_MS).getUTCDay();

/** Batas waktu eksplisit untuk operasi jaringan ke mesin (connect/poll). */
function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${label} habis waktu (${ms / 1000} dtk)`)), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e: unknown) => {
        clearTimeout(t);
        reject(e instanceof Error ? e : new Error(String(e)));
      },
    );
  });
}

export interface PunchInput {
  pin: string;
  punchedAt: Date;
  inOut?: number;
}

@Injectable()
export class AttendanceService {
  private readonly logger = new Logger(AttendanceService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly storage: StorageService,
  ) {}

  // ---------- Perangkat ----------

  listDevices() {
    return this.prisma.attendanceDevice.findMany({
      orderBy: { createdAt: 'asc' },
      include: { _count: { select: { logs: true } } },
    });
  }

  async createDevice(dto: CreateDeviceDto, actorId: string) {
    const serial = dto.serial.trim();
    const dup = await this.prisma.attendanceDevice.findUnique({ where: { serial } });
    if (dup) throw new ConflictException('Nomor seri sudah terdaftar pada perangkat lain.');
    const device = await this.prisma.attendanceDevice.create({
      data: {
        name: dto.name.trim(),
        serial,
        mode: dto.mode ?? 'ICLOCK',
        host: dto.host ?? null,
        port: dto.port ?? 4370,
        commKey: dto.commKey ?? null,
        location: dto.location ?? null,
      },
    });
    await this.audit.log({
      actorId,
      action: 'attendance.device.create',
      entity: 'attendance_device',
      entityId: device.id,
      metadata: { serial },
    });
    return device;
  }

  async updateDevice(id: string, dto: UpdateDeviceDto, actorId: string) {
    await this.mustDevice(id);
    if (dto.serial) {
      const dup = await this.prisma.attendanceDevice.findUnique({
        where: { serial: dto.serial.trim() },
      });
      if (dup && dup.id !== id) {
        throw new ConflictException('Nomor seri sudah terdaftar pada perangkat lain.');
      }
    }
    const device = await this.prisma.attendanceDevice.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.serial !== undefined ? { serial: dto.serial.trim() } : {}),
        ...(dto.mode !== undefined ? { mode: dto.mode } : {}),
        ...(dto.host !== undefined ? { host: dto.host } : {}),
        ...(dto.port !== undefined ? { port: dto.port } : {}),
        ...(dto.commKey !== undefined ? { commKey: dto.commKey } : {}),
        ...(dto.location !== undefined ? { location: dto.location } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
    });
    await this.audit.log({
      actorId,
      action: 'attendance.device.update',
      entity: 'attendance_device',
      entityId: id,
    });
    return device;
  }

  async deleteDevice(id: string, actorId: string) {
    await this.mustDevice(id);
    // Log historis dipertahankan — deviceId menjadi null via SetNull.
    await this.prisma.attendanceDevice.delete({ where: { id } });
    await this.audit.log({
      actorId,
      action: 'attendance.device.delete',
      entity: 'attendance_device',
      entityId: id,
    });
    return { deleted: true };
  }

  private async mustDevice(id: string) {
    const d = await this.prisma.attendanceDevice.findUnique({ where: { id } });
    if (!d) throw new NotFoundException('Perangkat tidak ditemukan');
    return d;
  }

  /**
   * Handshake/push dari mesin: perbarui heartbeat. SN HARUS sudah terdaftar
   * & aktif — serial asing ditolak (siapa pun di internet jangan sampai bisa
   * "mendaftarkan" mesin palsu lalu mengirim tap atas nama pegawai).
   */
  async touchDevice(serial: string, _ip?: string) {
    const sn = serial.trim();
    if (!sn) return null;
    const device = await this.prisma.attendanceDevice.findUnique({ where: { serial: sn } });
    if (!device?.isActive) return null;
    await this.prisma.attendanceDevice.update({
      where: { id: device.id },
      data: { lastSeenAt: new Date() },
    });
    return device;
  }

  // ---------- Pengaturan jadwal ----------

  getSettings() {
    return this.prisma.attendanceSetting.upsert({
      where: { id: 'global' },
      update: {},
      create: { id: 'global' },
    });
  }

  async updateSettings(dto: AttendanceSettingsDto, actorId: string) {
    const s = await this.prisma.attendanceSetting.upsert({
      where: { id: 'global' },
      update: {
        ...(dto.workStart !== undefined ? { workStart: dto.workStart } : {}),
        ...(dto.workEnd !== undefined ? { workEnd: dto.workEnd } : {}),
        ...(dto.lateAfter !== undefined ? { lateAfter: dto.lateAfter } : {}),
        ...(dto.checkOutFrom !== undefined ? { checkOutFrom: dto.checkOutFrom } : {}),
        ...(dto.autoDerive !== undefined ? { autoDerive: dto.autoDerive } : {}),
        ...(dto.schoolLat !== undefined ? { schoolLat: dto.schoolLat } : {}),
        ...(dto.schoolLng !== undefined ? { schoolLng: dto.schoolLng } : {}),
        ...(dto.radiusM !== undefined ? { radiusM: dto.radiusM } : {}),
      },
      create: { id: 'global' },
    });
    await this.audit.log({
      actorId,
      action: 'attendance.settings.update',
      entity: 'attendance_setting',
      entityId: 'global',
      metadata: JSON.parse(JSON.stringify(dto)) as Record<string, string | number | boolean>,
    });
    return s;
  }

  // ---------- Pemetaan PIN ----------

  listPins() {
    return this.prisma.employee.findMany({
      where: { isActive: true },
      select: { id: true, nip: true, name: true, type: true, fingerPin: true },
      orderBy: { name: 'asc' },
    });
  }

  async setPin(dto: PinMapDto, actorId: string) {
    const emp = await this.prisma.employee.findUnique({ where: { id: dto.employeeId } });
    if (!emp) throw new NotFoundException('Pegawai tidak ditemukan');
    const pin = dto.pin?.trim() || null;
    if (pin) {
      const dup = await this.prisma.employee.findUnique({ where: { fingerPin: pin } });
      if (dup && dup.id !== emp.id) {
        throw new ConflictException(`PIN ${pin} sudah dipakai oleh ${dup.name}.`);
      }
    }
    const updated = await this.prisma.employee.update({
      where: { id: emp.id },
      data: { fingerPin: pin },
      select: { id: true, name: true, fingerPin: true },
    });
    // Resolve ulang log lama dengan PIN ini yang belum terpetakan.
    if (pin) await this.resolveLogEmployees();
    await this.audit.log({
      actorId,
      action: 'attendance.pin.set',
      entity: 'employee',
      entityId: emp.id,
      metadata: { pin },
    });
    return updated;
  }

  // ---------- Ingest & derivasi ----------

  /**
   * Simpan tap mentah (dedup via unique deviceKey+pin+waktu), resolve pegawai
   * dari PIN, lalu derivasikan rekap harian bila autoDerive aktif.
   * @returns jumlah baris baru yang benar-benar tersimpan.
   */
  async ingestPunches(
    punches: PunchInput[],
    opts: { deviceKey: string; deviceId?: string | null; source: AttendanceSource },
  ) {
    if (punches.length === 0) return { inserted: 0, skipped: 0, resolved: 0 };
    const rows = punches.map((p) => ({
      deviceKey: opts.deviceKey,
      deviceId: opts.deviceId ?? null,
      pin: p.pin,
      punchedAt: p.punchedAt,
      inOut: p.inOut ?? 0,
      source: opts.source,
    }));
    const res = await this.prisma.attendanceLog.createMany({
      data: rows,
      skipDuplicates: true,
    });
    const resolved = await this.resolveLogEmployees();
    const settings = await this.getSettings();
    let derived = 0;
    if (settings.autoDerive) {
      derived = await this.deriveAffected(rows.map((r) => r.punchedAt), opts.deviceKey);
    }
    return { inserted: res.count, skipped: rows.length - res.count, resolved, derived };
  }

  /** Isi employeeId pada log yang PIN-nya kini terpetakan ke pegawai. */
  private async resolveLogEmployees() {
    const map = await this.prisma.employee.findMany({
      where: { fingerPin: { not: null } },
      select: { id: true, fingerPin: true },
    });
    let resolved = 0;
    for (const e of map) {
      const r = await this.prisma.attendanceLog.updateMany({
        where: { pin: e.fingerPin as string, employeeId: null },
        data: { employeeId: e.id },
      });
      resolved += r.count;
    }
    return resolved;
  }

  /** Derivasi ulang rekap harian untuk tanggal-tanggal pada tap yang baru masuk. */
  private async deriveAffected(times: Date[], _deviceKey: string) {
    const logs = await this.prisma.attendanceLog.findMany({
      where: { punchedAt: { in: times }, employeeId: { not: null } },
      select: { employeeId: true, punchedAt: true },
    });
    const days = new Set(logs.map((l) => `${l.employeeId}:${localDay(l.punchedAt).getTime()}`));
    for (const key of days) {
      const [employeeId, ts] = key.split(':');
      await this.deriveDay(employeeId as string, new Date(Number(ts)));
    }
    return days.size;
  }

  /**
   * Parameter jam kerja untuk (pegawai, tanggal): pakai shift yang ditugaskan
   * pada hari itu bila ada (dayOfWeek spesifik menang atas -1=semua hari),
   * kalau tidak pakai pengaturan global.
   */
  private async shiftRuleFor(employeeId: string, day: Date) {
    const settings = await this.getSettings();
    const dow = dowLocal(day); // 0=Minggu…6=Sabtu
    const rows = await this.prisma.employeeShift.findMany({
      where: { employeeId, OR: [{ dayOfWeek: -1 }, { dayOfWeek: dow }] },
      include: { shift: true },
    });
    const specific = rows.find((r) => r.dayOfWeek === dow)?.shift;
    const fallback = rows.find((r) => r.dayOfWeek === -1)?.shift;
    const shift = specific ?? fallback ?? null;
    // Sinkron jadwal mengajar: guru yang jadwalnya mulai siang (mis. baru
    // mengajar JP 4) dinilai telat dari JP pertamanya, dan jam pulangnya
    // mengikuti JP terakhirnya (JP 6 vs JP 9 selesai beda-beda) — BUKAN jam
    // kerja umum/shift. Jadwal mengajar SELALU dikonsultasi, termasuk saat
    // ada shift spesifik-hari; shift tetap dipakai untuk toleransi telat dan
    // menjadi fallback penuh pada hari pegawai tidak mengajar.
    const sched = await this.dayScheduleBounds(employeeId, day);
    return {
      workStartMin: sched?.startMin ?? shift?.startMinute ?? hhmmToMin(settings.workStart),
      lateAfterMin: shift?.lateAfter ?? settings.lateAfter,
      checkOutFromMin: sched?.endMin ?? shift?.checkOutFrom ?? hhmmToMin(settings.checkOutFrom),
      // Akhir jam kerja — cap jam pulang (pulang lewat jam ini dihitung sampai sini
      // saja) dan batas akhir absen masuk. Jadwal mengajar > shift > global.
      workEndMin: sched?.endMin ?? shift?.endMinute ?? hhmmToMin(settings.workEnd),
      shiftName: sched ? 'Jadwal mengajar' : (shift?.name ?? null),
    };
  }

  /** Tahun ajaran yang memuat tanggal (fallback: yang aktif). */
  private async academicYearFor(day: Date) {
    return (
      (await this.prisma.academicYear.findFirst({
        where: { startDate: { lte: day }, endDate: { gte: day } },
        select: { id: true },
      })) ??
      (await this.prisma.academicYear.findFirst({ where: { isActive: true }, select: { id: true } }))
    );
  }

  /** Batas jam hari itu dari jadwal mengajar (ScheduleEntry) — null bila tak mengajar. */
  private async dayScheduleBounds(employeeId: string, day: Date) {
    const dow = day.getUTCDay(); // day = tengah malam UTC dari tanggal WIB; 0=Minggu
    if (dow === 0) return null;
    const year = await this.academicYearFor(day);
    if (!year) return null;
    const entries = await this.prisma.scheduleEntry.findMany({
      where: { day: dow, assignment: { employeeId, academicYearId: year.id } },
      select: { startMinute: true, endMinute: true },
    });
    if (!entries.length) return null;
    return {
      startMin: Math.min(...entries.map((e) => e.startMinute)),
      endMin: Math.max(...entries.map((e) => e.endMinute)),
    };
  }

  /**
   * Batas jam kerja per pegawai untuk satu tanggal — versi batch dari
   * shiftRuleFor (satu query shift + satu query jadwal, bukan per-pegawai).
   * Dipakai rekap harian agar terlihat dasar penilaian tiap orang.
   */
  private async workRulesForDay(day: Date, employeeIds: string[]) {
    const settings = await this.getSettings();
    const dow = dowLocal(day);
    const [shiftRows, year] = await Promise.all([
      this.prisma.employeeShift.findMany({
        where: { employeeId: { in: employeeIds }, OR: [{ dayOfWeek: -1 }, { dayOfWeek: dow }] },
        include: { shift: true },
      }),
      this.academicYearFor(day),
    ]);
    // Jadwal mengajar hari itu untuk semua pegawai sekaligus.
    const bounds = new Map<string, { startMin: number; endMin: number }>();
    if (year && dow >= 1 && dow <= 6) {
      const entries = await this.prisma.scheduleEntry.findMany({
        where: {
          day: dow,
          assignment: { employeeId: { in: employeeIds }, academicYearId: year.id },
        },
        select: { startMinute: true, endMinute: true, assignment: { select: { employeeId: true } } },
      });
      for (const e of entries) {
        const emp = e.assignment.employeeId;
        const cur = bounds.get(emp);
        bounds.set(emp, {
          startMin: cur ? Math.min(cur.startMin, e.startMinute) : e.startMinute,
          endMin: cur ? Math.max(cur.endMin, e.endMinute) : e.endMinute,
        });
      }
    }
    const byEmp = new Map<string, { specific?: (typeof shiftRows)[number]; fallback?: (typeof shiftRows)[number] }>();
    for (const r of shiftRows) {
      const g = byEmp.get(r.employeeId) ?? {};
      if (r.dayOfWeek === dow) g.specific = r; else g.fallback = r;
      byEmp.set(r.employeeId, g);
    }
    const gStart = hhmmToMin(settings.workStart);
    const gOut = hhmmToMin(settings.checkOutFrom);
    const gEnd = hhmmToMin(settings.workEnd);
    return (empId: string) => {
      const g = byEmp.get(empId);
      const shift = g?.specific?.shift ?? g?.fallback?.shift ?? null;
      const sched = bounds.get(empId) ?? null;
      return {
        workStartMin: sched?.startMin ?? shift?.startMinute ?? gStart,
        checkOutFromMin: sched?.endMin ?? shift?.checkOutFrom ?? gOut,
        workEndMin: sched?.endMin ?? shift?.endMinute ?? gEnd,
        lateAfterMin: shift?.lateAfter ?? settings.lateAfter,
        basis: sched ? 'Jadwal mengajar' : shift ? `Shift ${shift.name}` : 'Umum',
      };
    };
  }

  /**
   * Rekap satu (pegawai, tanggal) dari seluruh tap hari itu.
   * Tap ber-flag masuk (inOut=0) → jam masuk; ber-flag pulang (inOut=1) → jam pulang.
   * Mesin yang tidak mengirim flag (semua 0) jatuh ke heuristik: masuk = tap pertama,
   * pulang = tap terakhir ≥ checkOutFrom. Tanpa tap masuk, checkInAt null.
   * Status HADIR/TELAT dari jam masuk shift (atau global)+toleransi — tidak
   * menimpa IZIN/SAKIT/ALPHA manual. lateMinutes = menit lewat jam masuk.
   */
  private async deriveDay(employeeId: string, day: Date) {
    const rule = await this.shiftRuleFor(employeeId, day);
    // `day` = tengah malam UTC dari tanggal WIB — tap adalah instant, jadi jendela
    // tanggal WIB = [day-7j, day+17j) dalam UTC.
    const from = new Date(day.getTime() - DEVICE_OFFSET_MS);
    const to = new Date(day.getTime() + 24 * 3600e3 - DEVICE_OFFSET_MS);
    const logs = await this.prisma.attendanceLog.findMany({
      where: { employeeId, punchedAt: { gte: from, lt: to } },
      orderBy: { punchedAt: 'asc' },
      select: { punchedAt: true, inOut: true, source: true },
    });
    if (logs.length === 0) return;
    const inPunches = logs.filter((l) => l.inOut === 0);
    const inLog = inPunches.length ? inPunches[0]! : null;
    const checkIn = inLog?.punchedAt ?? null;
    const outPunches = logs.filter(
      (l) => l.inOut === 1 && (!checkIn || l.punchedAt > checkIn),
    );
    const outLog = outPunches.length ? outPunches[outPunches.length - 1]! : null;
    const last = logs[logs.length - 1]!.punchedAt;
    let checkOut =
      (outLog?.punchedAt ?? null) ??
      (checkIn &&
      last.getTime() !== checkIn.getTime() &&
      localMinutes(last) >= rule.checkOutFromMin
        ? last
        : null);
    const existing = await this.prisma.employeeAttendance.findUnique({
      where: { employeeId_date: { employeeId, date: day } },
    });
    const partialMin = existing?.partialLeaveFromMin ?? null;
    // Cap jam pulang: tap lewat akhir jam kerja disimpan sampai akhir jam kerja saja
    // (tap mentah tetap utuh di log) — JP tidak membengkak karena pulang malam.
    // Izin pulang awal memperketat cap lebih jauh.
    if (checkOut) {
      const endCap = new Date(day.getTime() + rule.workEndMin * 60000 - DEVICE_OFFSET_MS);
      if (checkOut > endCap) checkOut = endCap;
      if (partialMin != null) {
        const plCap = new Date(day.getTime() + partialMin * 60000 - DEVICE_OFFSET_MS);
        if (checkOut > plCap) checkOut = plCap;
      }
    }
    const lateMinutes = checkIn
      ? Math.max(0, localMinutes(checkIn) - rule.workStartMin)
      : 0;
    // Tanpa tap masuk → data tidak lengkap (tandai ALPHA agar jelas perlu dicek,
    // bukan HADIR yang menyesatkan).
    const status = checkIn
      ? lateMinutes > rule.lateAfterMin
        ? 'TELAT'
        : 'HADIR'
      : 'ALPHA';
    // Status manual (izin/sakit/alpha) tidak ditimpa — hanya jam yang dilengkapi.
    const manualKept =
      !!existing && ['IZIN', 'SAKIT', 'ALPHA'].includes(existing.status);
    const finalStatus = manualKept ? existing!.status : status;
    // Sumber rekap ikuti perangkat tap masuk aslinya (fallback tap pulang /
    // log terakhir) — jangan selalu DEVICE: tap aplikasi/web harus kebaca.
    // Rekap status manual mempertahankan sumber pencatatan manualnya.
    const source =
      manualKept && existing!.source
        ? existing!.source
        : (inLog?.source ?? outLog?.source ?? logs[logs.length - 1]!.source);
    // JP efektif hari itu — otomatis: jadwal mengajar (guru) bila ada, selain itu
    // durasi kehadiran masuk→pulang (staf). Dipakai payroll untuk JP hadir & transport.
    // Izin pulang awal: hanya menit sebelum batas izin yang dihitung.
    const lessonMin = await this.lessonMinutes();
    const teaching =
      finalStatus === 'HADIR' || finalStatus === 'TELAT'
        ? Math.round((await this.scheduledMinutes(employeeId, day, partialMin ?? undefined)) / lessonMin) ||
          (checkIn && checkOut
            ? Math.round(Math.max(0, Math.round((checkOut.getTime() - checkIn.getTime()) / 60000)) / lessonMin)
            : 0)
        : 0;
    await this.prisma.employeeAttendance.upsert({
      where: { employeeId_date: { employeeId, date: day } },
      update: {
        status: finalStatus as 'HADIR' | 'TELAT' | 'IZIN' | 'SAKIT' | 'ALPHA',
        checkInAt: checkIn,
        checkOutAt: checkOut,
        lateMinutes,
        teachingJp: teaching,
        source,
      },
      create: {
        employeeId,
        date: day,
        status: finalStatus as 'HADIR' | 'TELAT' | 'IZIN' | 'SAKIT' | 'ALPHA',
        checkInAt: checkIn,
        checkOutAt: checkOut,
        lateMinutes,
        teachingJp: teaching,
        source,
      },
    });
  }

  /** Menit per jam pelajaran dari pengaturan payroll (default 40). */
  private async lessonMinutes() {
    const s = await this.prisma.payrollSetting.findUnique({
      where: { id: 'global' },
      select: { lessonMinutes: true },
    });
    return Math.max(1, s?.lessonMinutes ?? 40);
  }

  /** Menit mengajar terjadwal seorang pegawai pada tanggal — dari jadwal pelajaran
      tahun ajaran yang memuat tanggal itu (fallback: tahun aktif).
      `cutoffMin` opsional: hanya menit sebelum batas itu yang dihitung (izin pulang awal). */
  private async scheduledMinutes(employeeId: string, day: Date, cutoffMin?: number) {
    const dow = day.getUTCDay(); // 0=Minggu … 6=Sabtu — day adalah tengah malam UTC dari tanggal WIB
    if (dow === 0) return 0;
    const year =
      (await this.prisma.academicYear.findFirst({
        where: { startDate: { lte: day }, endDate: { gte: day } },
        select: { id: true },
      })) ??
      (await this.prisma.academicYear.findFirst({ where: { isActive: true }, select: { id: true } }));
    if (!year) return 0;
    const entries = await this.prisma.scheduleEntry.findMany({
      where: { day: dow, assignment: { employeeId, academicYearId: year.id } },
      select: { startMinute: true, endMinute: true },
    });
    return entries.reduce(
      (s, e) => s + Math.max(0, Math.min(e.endMinute, cutoffMin ?? e.endMinute) - e.startMinute),
      0,
    );
  }

  /** Derivasi ulang seluruh hari yang punya log — dipanggil tombol "Hitung Ulang". */
  async rederiveAll(actorId: string) {
    const logs = await this.prisma.attendanceLog.findMany({
      where: { employeeId: { not: null } },
      select: { employeeId: true, punchedAt: true },
    });
    const days = new Set(logs.map((l) => `${l.employeeId}:${localDay(l.punchedAt).getTime()}`));
    for (const key of days) {
      const [employeeId, ts] = key.split(':');
      await this.deriveDay(employeeId as string, new Date(Number(ts)));
    }
    await this.audit.log({
      actorId,
      action: 'attendance.rederive',
      entity: 'attendance_log',
      entityId: 'all',
      metadata: { days: days.size },
    });
    return { derived: days.size };
  }

  // ---------- Log & rekap ----------

  listLogs(q: { date?: string; employeeId?: string; deviceKey?: string }) {
    const where: Record<string, unknown> = {};
    if (q.employeeId) where.employeeId = q.employeeId;
    if (q.deviceKey) where.deviceKey = q.deviceKey;
    if (q.date) {
      const t = parseDeviceTime(`${q.date} 00:00:00`);
      if (t) where.punchedAt = { gte: t, lt: new Date(t.getTime() + 24 * 3600e3) };
    }
    return this.prisma.attendanceLog.findMany({
      where,
      include: {
        employee: { select: { id: true, name: true, nip: true } },
        device: { select: { id: true, name: true, serial: true } },
      },
      orderBy: { punchedAt: 'desc' },
      take: 500,
    });
  }

  /** Rekap harian pegawai (EmployeeAttendance) + jam tap — untuk tab Harian. */
  async daily(
    date: string,
    q: { employeeId?: string | undefined; status?: string | undefined } = {},
  ) {
    const t = parseDeviceTime(`${date} 00:00:00`);
    if (!t) throw new BadRequestException('Tanggal tidak valid');
    const day = localDay(t);
    const from = new Date(day.getTime() - DEVICE_OFFSET_MS);
    const to = new Date(day.getTime() + 24 * 3600e3 - DEVICE_OFFSET_MS);
    const [recs, pins, dayLogs] = await Promise.all([
      this.prisma.employeeAttendance.findMany({
        where: { date: day },
        include: { employee: { select: { id: true, name: true, nip: true, fingerPin: true } } },
      }),
      this.prisma.employee.findMany({
        where: { isActive: true },
        select: { id: true, name: true, nip: true, fingerPin: true },
      }),
      // Log mentah hari itu — untuk mengetahui platform absen (aplikasi/web/mesin).
      this.prisma.attendanceLog.findMany({
        where: { punchedAt: { gte: from, lt: to }, employeeId: { not: null } },
        select: { employeeId: true, source: true, deviceKey: true, punchedAt: true },
        orderBy: { punchedAt: 'asc' },
      }),
    ]);
    const byEmp = new Map(recs.map((r) => [r.employeeId, r]));
    const empIds = pins.map((e) => e.id);
    const ruleOf = await this.workRulesForDay(day, empIds);
    // Platform absen per pegawai — dari log SELFIE (deviceKey 'SELFIE-<PLTF>-<id>').
    const clientOf = new Map<string, 'APP' | 'WEB' | 'SELFIE'>();
    for (const l of dayLogs) {
      if (l.source !== 'SELFIE' || !l.employeeId) continue;
      const m = /^SELFIE-(APP|WEB)-/.exec(l.deviceKey);
      // Log terakhir menang (urutan asc) — masuk & pulang bisa beda platform,
      // tampilkan yang terbaru.
      clientOf.set(l.employeeId, (m?.[1] as 'APP' | 'WEB' | undefined) ?? 'SELFIE');
    }
    return pins
      .filter((e) => !q.employeeId || e.id === q.employeeId)
      .map((e) => {
        const r = byEmp.get(e.id);
        const rule = ruleOf(e.id);
        return {
          employee: e,
          status: r?.status ?? null,
          leaveCategory: r?.leaveCategory ?? null,
          checkInAt: r?.checkInAt ?? null,
          checkOutAt: r?.checkOutAt ?? null,
          lateMinutes: r?.lateMinutes ?? null,
          partialLeaveFromMin: r?.partialLeaveFromMin ?? null,
          source: r?.source ?? null,
          note: r?.note ?? null,
          // Dasar penilaian jam kerja hari itu — jadwal mengajar > shift > umum.
          work: {
            start: minToHHMM(rule.workStartMin),
            end: minToHHMM(rule.workEndMin),
            basis: rule.basis,
          },
          // Platform absen selfie terakhir hari itu (APP=aplikasi HP, WEB=browser).
          client: clientOf.get(e.id) ?? null,
        };
      })
      .filter((r) => !q.status || r.status === q.status);
  }

  /** Rekap sebulan satu pegawai — untuk kalender absensi di detail pegawai. */
  async monthly(employeeId: string, month: string) {
    const m = /^(\d{4})-(\d{2})$/.exec(month);
    if (!m) throw new BadRequestException('Format bulan tidak valid (YYYY-MM).');
    const emp = await this.prisma.employee.findUnique({
      where: { id: employeeId },
      select: {
        id: true, name: true, nip: true, type: true, phone: true,
        email: true, isActive: true, fingerPin: true,
      },
    });
    if (!emp) throw new NotFoundException('Pegawai tidak ditemukan');
    const start = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, 1) - DEVICE_OFFSET_MS);
    const end = new Date(Date.UTC(Number(m[1]), Number(m[2]), 1) - DEVICE_OFFSET_MS);
    const recs = await this.prisma.employeeAttendance.findMany({
      where: { employeeId, date: { gte: start, lt: end } },
      orderBy: { date: 'asc' },
    });
    const shifts = await this.prisma.employeeShift.findMany({
      where: { employeeId },
      include: { shift: true },
    });
    return {
      employee: emp,
      month,
      days: recs.map((r) => ({
        date: r.date,
        status: r.status,
        leaveCategory: r.leaveCategory,
        checkInAt: r.checkInAt,
        checkOutAt: r.checkOutAt,
        lateMinutes: r.lateMinutes,
        teachingJp: r.teachingJp,
        partialLeaveFromMin: r.partialLeaveFromMin,
        source: r.source,
        note: r.note,
      })),
      shifts: shifts.map((s) => ({
        id: s.id,
        dayOfWeek: s.dayOfWeek,
        shift: s.shift,
      })),
    };
  }

  /** Tap manual oleh TU (mis. pegawai lupa absen). */
  async manualPunch(dto: ManualPunchDto, actorId: string) {
    const emp = await this.prisma.employee.findUnique({ where: { id: dto.employeeId } });
    if (!emp) throw new NotFoundException('Pegawai tidak ditemukan');
    const t = parseDeviceTime(dto.punchedAt);
    if (!t) throw new BadRequestException('Format waktu tidak valid — pakai "YYYY-MM-DD HH:mm".');
    const r = await this.ingestPunches(
      [{ pin: emp.fingerPin ?? `emp-${emp.id}`, punchedAt: t, inOut: dto.inOut ?? 0 }],
      { deviceKey: 'MANUAL', source: 'MANUAL' },
    );
    // Log manual pakai pin dummy bila pegawai belum punya PIN — pastikan tetap tertaut.
    if (!emp.fingerPin) {
      await this.prisma.attendanceLog.updateMany({
        where: { deviceKey: 'MANUAL', pin: `emp-${emp.id}`, employeeId: null },
        data: { employeeId: emp.id },
      });
      const settings = await this.getSettings();
      if (settings.autoDerive) await this.deriveDay(emp.id, localDay(t));
    }
    await this.audit.log({
      actorId,
      action: 'attendance.manual_punch',
      entity: 'attendance_log',
      entityId: emp.id,
      metadata: { punchedAt: t.toISOString(), inOut: dto.inOut ?? 0 },
    });
    return { inserted: r.inserted };
  }

  // ---------- Absen selfie (pegawai) ----------

  /** Jarak haversine (meter) antara dua koordinat. */
  private static distanceM(aLat: number, aLng: number, bLat: number, bLng: number) {
    const R = 6371000;
    const rad = (d: number) => (d * Math.PI) / 180;
    const dLat = rad(bLat - aLat);
    const dLng = rad(bLng - aLng);
    const h =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }

  /** Profil absen pegawai dari akun yang sedang login. */
  private async employeeOfUser(userId: string) {
    const emp = await this.prisma.employee.findUnique({ where: { userId } });
    if (!emp) throw new BadRequestException('Akun ini belum tertaut ke data pegawai');
    if (!emp.isActive) throw new BadRequestException('Data pegawai tidak aktif');
    return emp;
  }

  /** Absen selfie: foto + geolokasi dalam radius sekolah → tap masuk/pulang. */
  async selfiePunch(
    userId: string,
    inOut: 0 | 1,
    latitude: number,
    longitude: number,
    file: { buffer: Buffer; mimetype: string } | undefined,
    /** Platform klien — 'APP' (Flutter) atau 'WEB' (browser); tampil di kolom Sumber. */
    platform?: string,
  ) {
    const emp = await this.employeeOfUser(userId);
    if (!file?.buffer?.length) {
      throw new BadRequestException('Foto wajib dilampirkan — aktifkan kamera dan ambil selfie');
    }
    const s = await this.getSettings();
    if (s.schoolLat == null || s.schoolLng == null) {
      throw new BadRequestException('Lokasi sekolah belum diatur — minta bidang Kurikulum mengisi pengaturan lokasi');
    }
    const dist = AttendanceService.distanceM(latitude, longitude, s.schoolLat, s.schoolLng);
    if (dist > s.radiusM) {
      throw new BadRequestException(
        `Di luar jangkauan — Anda ${Math.round(dist)} m dari sekolah (maks ${s.radiusM} m). Dekati lokasi sekolah lalu coba lagi.`,
      );
    }
    const now = new Date();
    const day = localDay(now);
    const existing = await this.prisma.employeeAttendance.findUnique({
      where: { employeeId_date: { employeeId: emp.id, date: day } },
    });
    const nowMin = localMinutes(now);
    if (inOut === 0) {
      // Absen masuk: sekali per hari, dan hanya dalam jendela jam kerja.
      if (existing?.checkInAt) {
        throw new ConflictException(
          `Sudah absen masuk hari ini pukul ${minToHHMM(localMinutes(existing.checkInAt))} WIB — masuk hanya bisa sekali.`,
        );
      }
      const rule = await this.shiftRuleFor(emp.id, day);
      if (nowMin < rule.workStartMin - CHECKIN_EARLY_MIN) {
        throw new BadRequestException(
          `Belum jam kerja — absen masuk paling awal ${minToHHMM(rule.workStartMin - CHECKIN_EARLY_MIN)} WIB.`,
        );
      }
      if (nowMin > rule.workEndMin) {
        throw new BadRequestException(
          `Sudah di luar jam kerja (selesai ${minToHHMM(rule.workEndMin)} WIB) — absen masuk tidak bisa; absen pulang tetap bisa kapan saja.`,
        );
      }
    } else {
      // Absen pulang: harus sudah masuk, hanya sekali, tapi boleh jam berapa pun.
      if (!existing?.checkInAt) {
        throw new BadRequestException('Belum ada absen masuk hari ini — lakukan absen masuk lebih dulu.');
      }
      if (existing.checkOutAt) {
        throw new ConflictException(
          `Sudah absen pulang hari ini pukul ${minToHHMM(localMinutes(existing.checkOutAt))} WIB — pulang hanya bisa sekali.`,
        );
      }
    }
    const ext = file.mimetype.includes('png') ? 'png' : 'jpg';
    const photoKey = `attendance/selfie/${emp.id}/${localDay(now).toISOString().slice(0, 10)}-${inOut}-${now.getTime()}.${ext}`;
    await this.storage.putObject(photoKey, file.buffer, file.mimetype);
    // Platform ditandai di deviceKey ('SELFIE-APP-<id>' / 'SELFIE-WEB-<id>') agar
    // rekap bisa membedakan absen dari aplikasi HP vs browser — log lama
    // ('SELFIE-<id>') tetap kebaca sebagai SELFIE generik.
    const pltf = platform && /^[A-Z]{2,10}$/.test(platform) ? `${platform}-` : '';
    const log = await this.prisma.attendanceLog.create({
      data: {
        deviceKey: `SELFIE-${pltf}${emp.id}`,
        pin: `selfie-${emp.id}`,
        punchedAt: now,
        inOut,
        employeeId: emp.id,
        source: 'SELFIE',
        photoKey,
        latitude,
        longitude,
      },
    });
    await this.deriveDay(emp.id, day);
    const attendance = await this.prisma.employeeAttendance.findUnique({
      where: { employeeId_date: { employeeId: emp.id, date: day } },
    });
    await this.audit.log({
      actorId: userId,
      action: 'attendance.selfie',
      entity: 'attendance_log',
      entityId: log.id,
      metadata: { inOut, distanceM: Math.round(dist), latitude, longitude },
    });
    return {
      id: log.id,
      punchedAt: log.punchedAt,
      inOut,
      distanceM: Math.round(dist),
      attendance: attendance
        ? {
            status: attendance.status,
            checkInAt: attendance.checkInAt,
            checkOutAt: attendance.checkOutAt,
            lateMinutes: attendance.lateMinutes,
          }
        : null,
    };
  }

  /** Rekap absen milik pegawai yang login (bulan berjalan + status hari ini). */
  async myAttendance(userId: string, month?: string) {
    const emp = await this.employeeOfUser(userId);
    const now = new Date();
    const parts = (month ?? `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`)
      .split('-').map(Number);
    const y = parts[0] ?? now.getUTCFullYear();
    const m = parts[1] ?? now.getUTCMonth() + 1;
    const rows = await this.prisma.employeeAttendance.findMany({
      where: { employeeId: emp.id, date: { gte: new Date(Date.UTC(y, m - 1, 1)), lt: new Date(Date.UTC(y, m, 1)) } },
      orderBy: { date: 'asc' },
    });
    const settings = await this.getSettings();
    const today = await this.prisma.employeeAttendance.findUnique({
      where: { employeeId_date: { employeeId: emp.id, date: localDay(now) } },
    });
    const todayLogs = await this.prisma.attendanceLog.findMany({
      where: { employeeId: emp.id, source: 'SELFIE', punchedAt: { gte: new Date(localDay(now).getTime() - DEVICE_OFFSET_MS), lt: new Date(localDay(now).getTime() + 86400000 - DEVICE_OFFSET_MS) } },
      select: { id: true, punchedAt: true, inOut: true },
      orderBy: { punchedAt: 'asc' },
    });
    const shifts = await this.prisma.employeeShift.findMany({
      where: { employeeId: emp.id },
      include: { shift: true },
    });
    return {
      employee: { id: emp.id, name: emp.name, nip: emp.nip },
      geo: { schoolLat: settings.schoolLat, schoolLng: settings.schoolLng, radiusM: settings.radiusM, configured: settings.schoolLat != null && settings.schoolLng != null },
      work: { workStart: settings.workStart, workEnd: settings.workEnd, earlyMin: CHECKIN_EARLY_MIN },
      today: today
        ? {
            status: today.status,
            leaveCategory: today.leaveCategory,
            checkInAt: today.checkInAt,
            checkOutAt: today.checkOutAt,
            lateMinutes: today.lateMinutes,
            partialLeaveFromMin: today.partialLeaveFromMin,
          }
        : null,
      todayLogs,
      rows: rows.map((r) => ({
        date: r.date,
        status: r.status,
        leaveCategory: r.leaveCategory,
        checkInAt: r.checkInAt,
        checkOutAt: r.checkOutAt,
        lateMinutes: r.lateMinutes,
        teachingJp: r.teachingJp,
        partialLeaveFromMin: r.partialLeaveFromMin,
        note: r.note,
      })),
      shifts: shifts.map((s) => ({
        dayOfWeek: s.dayOfWeek,
        shift: {
          name: s.shift.name,
          startMinute: s.shift.startMinute,
          endMinute: s.shift.endMinute,
          checkOutFrom: s.shift.checkOutFrom,
          lateAfter: s.shift.lateAfter,
        },
      })),
    };
  }

  /** Pegawai setor izin sendiri (sakit/dinas/workshop/lainnya) dari Absen Saya.
      Status: SAKIT→SAKIT, lainnya→IZIN; tidak menimpa hari yang sudah HADIR/TELAT.
      `fromMinute` (menit WIB) → izin PULANG AWAL: hanya untuk yang sudah absen masuk;
      sisa hari setelah menit itu dihitung izin (JP & jam pulang di-cap ke sana). */
  async submitLeave(userId: string, dto: { date: string; category: 'SAKIT' | 'DINAS' | 'WORKSHOP' | 'LAINNYA'; note?: string; fromMinute?: number }) {
    const emp = await this.employeeOfUser(userId);
    const day = localDay(new Date(`${dto.date}T00:00:00+07:00`));
    if (Number.isNaN(day.getTime())) throw new BadRequestException('Tanggal tidak valid.');
    const existing = await this.prisma.employeeAttendance.findUnique({
      where: { employeeId_date: { employeeId: emp.id, date: day } },
    });
    const catLabel = { SAKIT: 'Sakit', DINAS: 'Dinas luar', WORKSHOP: 'Workshop/Pelatihan', LAINNYA: 'Lainnya' }[dto.category];

    // ---------- Izin pulang awal (parsial) ----------
    if (dto.fromMinute != null) {
      if (!existing?.checkInAt) {
        throw new BadRequestException('Izin pulang awal hanya untuk hari yang sudah ada absen masuk — absen dulu, atau kirim izin penuh.');
      }
      if (existing.status === 'IZIN' || existing.status === 'SAKIT') {
        throw new ConflictException(`Tanggal ${dto.date} sudah tercatat izin penuh.`);
      }
      const inMin = localMinutes(existing.checkInAt);
      if (dto.fromMinute <= inMin) {
        throw new BadRequestException(`Waktu mulai izin harus setelah jam masuk (${minToHHMM(inMin)} WIB).`);
      }
      const rec = await this.prisma.employeeAttendance.update({
        where: { id: existing.id },
        data: {
          partialLeaveFromMin: dto.fromMinute,
          leaveCategory: dto.category,
          note: dto.note ?? `${catLabel} — izin sejak ${minToHHMM(dto.fromMinute)} WIB`,
          source: 'SELFIE',
        },
      });
      // Hitung ulang rekap: jam pulang & JP di-cap ke batas izin.
      await this.deriveDay(emp.id, day);
      // Rekap manual tanpa log tak ter-derive — JP dihitung ulang di sini:
      // jadwal mengajar sampai batas izin, fallback durasi masuk→(min pulang/izin).
      const refreshed = await this.prisma.employeeAttendance.findUnique({ where: { id: rec.id } });
      if (refreshed && (refreshed.status === 'HADIR' || refreshed.status === 'TELAT') && refreshed.checkInAt) {
        const lessonMin = await this.lessonMinutes();
        let expected = Math.round(
          (await this.scheduledMinutes(emp.id, day, dto.fromMinute)) / lessonMin,
        );
        if (!expected) {
          const outMin = Math.min(
            refreshed.checkOutAt ? localMinutes(refreshed.checkOutAt) : dto.fromMinute,
            dto.fromMinute,
          );
          expected = Math.round(
            Math.max(0, outMin - localMinutes(refreshed.checkInAt)) / lessonMin,
          );
        }
        if (expected !== refreshed.teachingJp) {
          await this.prisma.employeeAttendance.update({
            where: { id: rec.id },
            data: { teachingJp: expected },
          });
        }
      }
      await this.audit.log({
        actorId: userId, action: 'attendance.leave', entity: 'employee_attendance', entityId: rec.id,
        metadata: { date: dto.date, category: dto.category, partialFrom: dto.fromMinute },
      });
      return this.prisma.employeeAttendance.findUnique({ where: { id: rec.id } });
    }

    // ---------- Izin penuh sehari ----------
    if (existing && (existing.status === 'HADIR' || existing.status === 'TELAT')) {
      throw new ConflictException(`Tanggal ${dto.date} sudah tercatat hadir — izin tidak bisa dikirim.`);
    }
    const status = dto.category === 'SAKIT' ? 'SAKIT' : 'IZIN';
    const rec = await this.prisma.employeeAttendance.upsert({
      where: { employeeId_date: { employeeId: emp.id, date: day } },
      update: { status, leaveCategory: dto.category, note: dto.note ?? `${catLabel}`, source: 'SELFIE' },
      create: {
        employeeId: emp.id, date: day, status,
        leaveCategory: dto.category, note: dto.note ?? catLabel, source: 'SELFIE',
      },
    });
    await this.audit.log({
      actorId: userId, action: 'attendance.leave', entity: 'employee_attendance', entityId: rec.id,
      metadata: { date: dto.date, category: dto.category },
    });
    return rec;
  }

  /** Admin/TU clear absen 1 hari 1 pegawai (salah absen — mis. tap padahal libur):
      hapus rekap harian + log mentahnya agar tidak ter-derivasi ulang. */
  async clearDay(employeeId: string, dateIso: string, actorId: string) {
    const day = localDay(new Date(`${dateIso}T00:00:00+07:00`));
    if (Number.isNaN(day.getTime())) throw new BadRequestException('Tanggal tidak valid.');
    const from = new Date(day.getTime() - DEVICE_OFFSET_MS);
    const to = new Date(day.getTime() + 24 * 3600e3 - DEVICE_OFFSET_MS);
    const [logs, rec] = await this.prisma.$transaction([
      this.prisma.attendanceLog.deleteMany({
        where: { employeeId, punchedAt: { gte: from, lt: to } },
      }),
      this.prisma.employeeAttendance.deleteMany({ where: { employeeId, date: day } }),
    ]);
    await this.audit.log({
      actorId, action: 'attendance.clear-day', entity: 'employee', entityId: employeeId,
      metadata: { date: dateIso, logsRemoved: logs.count, recordRemoved: rec.count },
    });
    return { logsRemoved: logs.count, recordRemoved: rec.count };
  }

  /** Foto selfie sebuah log — dibaca TU/admin. */
  async logPhoto(logId: string) {
    const log = await this.prisma.attendanceLog.findUnique({ where: { id: logId } });
    if (!log?.photoKey) throw new NotFoundException('Foto tidak ditemukan');
    const buf = await this.storage.getObjectBuffer(log.photoKey);
    return { buffer: buf, mime: log.photoKey.endsWith('.png') ? 'image/png' : 'image/jpeg' };
  }

  // ---------- Shift kerja ----------

  listShifts() {
    return this.prisma.workShift.findMany({
      orderBy: { startMinute: 'asc' },
      include: { _count: { select: { assignments: true } } },
    });
  }

  async createShift(dto: CreateShiftDto, actorId: string) {
    const shift = await this.prisma.workShift.create({
      data: {
        name: dto.name.trim(),
        startMinute: hhmmToMin(dto.startTime),
        endMinute: hhmmToMin(dto.endTime),
        lateAfter: dto.lateAfter ?? 10,
        checkOutFrom: hhmmToMin(dto.checkOutFrom),
      },
    });
    await this.audit.log({
      actorId,
      action: 'attendance.shift.create',
      entity: 'work_shift',
      entityId: shift.id,
      metadata: { name: shift.name },
    });
    return shift;
  }

  async updateShift(id: string, dto: UpdateShiftDto, actorId: string) {
    const existing = await this.prisma.workShift.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Shift tidak ditemukan');
    const shift = await this.prisma.workShift.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.startTime !== undefined ? { startMinute: hhmmToMin(dto.startTime) } : {}),
        ...(dto.endTime !== undefined ? { endMinute: hhmmToMin(dto.endTime) } : {}),
        ...(dto.lateAfter !== undefined ? { lateAfter: dto.lateAfter } : {}),
        ...(dto.checkOutFrom !== undefined
          ? { checkOutFrom: hhmmToMin(dto.checkOutFrom) }
          : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
    });
    await this.audit.log({
      actorId,
      action: 'attendance.shift.update',
      entity: 'work_shift',
      entityId: id,
    });
    return shift;
  }

  async deleteShift(id: string, actorId: string) {
    const existing = await this.prisma.workShift.findUnique({
      where: { id },
      include: { _count: { select: { assignments: true } } },
    });
    if (!existing) throw new NotFoundException('Shift tidak ditemukan');
    // Penugasan ikut terhapus (cascade) — pegawai kembali ke aturan global.
    await this.prisma.workShift.delete({ where: { id } });
    await this.audit.log({
      actorId,
      action: 'attendance.shift.delete',
      entity: 'work_shift',
      entityId: id,
      metadata: { name: existing.name, released: existing._count.assignments },
    });
    return { deleted: true };
  }

  // ---------- Penugasan shift ke pegawai ----------

  listEmployeeShifts(employeeId?: string) {
    return this.prisma.employeeShift.findMany({
      where: employeeId ? { employeeId } : {},
      include: {
        employee: { select: { id: true, name: true, nip: true } },
        shift: true,
      },
      orderBy: [{ employee: { name: 'asc' } }, { dayOfWeek: 'asc' }],
    });
  }

  /**
   * Pasang shift pegawai untuk satu hari tertentu (dayOfWeek) atau semua hari
   * (-1). Satu pegawai satu aturan per hari — memasang ulang menimpa yang lama.
   */
  async assignShift(dto: AssignShiftDto, actorId: string) {
    const emp = await this.prisma.employee.findUnique({ where: { id: dto.employeeId } });
    if (!emp) throw new NotFoundException('Pegawai tidak ditemukan');
    const shift = await this.prisma.workShift.findUnique({ where: { id: dto.shiftId } });
    if (!shift) throw new NotFoundException('Shift tidak ditemukan');
    const row = await this.prisma.employeeShift.upsert({
      where: {
        employeeId_dayOfWeek: { employeeId: dto.employeeId, dayOfWeek: dto.dayOfWeek },
      },
      update: { shiftId: dto.shiftId },
      create: {
        employeeId: dto.employeeId,
        shiftId: dto.shiftId,
        dayOfWeek: dto.dayOfWeek,
      },
      include: { shift: true },
    });
    await this.audit.log({
      actorId,
      action: 'attendance.shift.assign',
      entity: 'employee_shift',
      entityId: row.id,
      metadata: { employee: emp.name, shift: shift.name, dayOfWeek: dto.dayOfWeek },
    });
    return row;
  }

  async removeEmployeeShift(id: string, actorId: string) {
    const row = await this.prisma.employeeShift.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Penugasan tidak ditemukan');
    await this.prisma.employeeShift.delete({ where: { id } });
    await this.audit.log({
      actorId,
      action: 'attendance.shift.unassign',
      entity: 'employee_shift',
      entityId: id,
    });
    return { deleted: true };
  }

  // ---------- Impor file attlog ----------

  /**
   * Parse file ekspor mesin (.dat/.txt/.csv): tiap baris
   * `PIN<TAB/spasi/koma>YYYY-MM-DD HH:mm:ss` (kolom ekstra diabaikan).
   */
  async importFile(deviceKey: string, buffer: Buffer, actorId: string) {
    const device = await this.prisma.attendanceDevice.findUnique({
      where: { serial: deviceKey },
    });
    const text = buffer.toString('utf8');
    const punches: PunchInput[] = [];
    const bad: string[] = [];
    for (const line of text.split(/\r?\n/)) {
      const s = line.trim();
      if (!s || /^pin|^no|^tanggal|^date/i.test(s)) continue;
      const cols = s.split(/[\t;,]/).map((c) => c.trim());
      // Cari kolom yang tampak seperti tanggal-waktu.
      const pin = cols[0] ?? '';
      const dtCol = cols.slice(1).find((c) => /\d{4}[-/]\d{1,2}[-/]\d{1,2}/.test(c)) ?? '';
      const inOutCol = cols.slice(2).find((c) => /^[01]$/.test(c));
      const t = dtCol ? parseDeviceTime(dtCol) : null;
      if (!pin || !t) {
        if (s) bad.push(s.slice(0, 80));
        continue;
      }
      punches.push({ pin, punchedAt: t, inOut: inOutCol ? Number(inOutCol) : 0 });
    }
    if (punches.length === 0) {
      throw new BadRequestException(
        bad.length
          ? 'Format file tidak dikenali — harap ekspor .dat/.csv dengan kolom PIN dan tanggal-waktu.'
          : 'File kosong.',
      );
    }
    const r = await this.ingestPunches(punches, {
      deviceKey,
      deviceId: device?.id ?? null,
      source: 'IMPORT',
    });
    await this.audit.log({
      actorId,
      action: 'attendance.import',
      entity: 'attendance_log',
      entityId: deviceKey,
      metadata: { parsed: punches.length, inserted: r.inserted, badLines: bad.length },
    });
    return { ...r, badLines: bad.length };
  }

  // ---------- Tarik langsung dari mesin (mode PULL) ----------

  async pullFromDevice(id: string, actorId: string) {
    const device = await this.mustDevice(id);
    if (!device.host) {
      throw new BadRequestException('Isi alamat IP mesin terlebih dahulu (mode PULL).');
    }
    let ZKLib: unknown;
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      ZKLib = (require('node-zklib') as { default?: unknown }).default ?? require('node-zklib');
    } catch {
      throw new BadRequestException(
        'Paket node-zklib belum terpasang — gunakan mode iClock atau impor file.',
      );
    }
    const zk = new (ZKLib as new (ip: string, port: number, timeout: number, inport: number) => {
      createSocket(): Promise<void>;
      getAttendances(): Promise<{ data?: unknown[] }>;
      disconnect(): Promise<void>;
    })(device.host, device.port, 10000, 5200);
    let raw: unknown[] = [];
    try {
      await withTimeout(zk.createSocket(), 8000, 'koneksi socket');
      const res = await withTimeout(
        zk.getAttendances(),
        10000,
        'pengambilan data absensi',
      );
      raw = Array.isArray(res?.data) ? res.data : [];
    } catch (e) {
      throw new BadRequestException(
        `Gagal terhubung ke mesin ${device.host}:${device.port} — ${e instanceof Error ? e.message : 'cek jaringan & comm key'}.`,
      );
    } finally {
      try {
        await zk.disconnect();
      } catch {
        /* abaikan */
      }
    }
    const punches: PunchInput[] = [];
    for (const rec of raw as Record<string, unknown>[]) {
      const pin = String(rec.userId ?? rec.deviceUserId ?? rec.uid ?? '');
      const tRaw = rec.recordTime ?? rec.time;
      const t =
        tRaw instanceof Date ? tRaw : typeof tRaw === 'string' ? parseDeviceTime(tRaw) : null;
      if (pin && t) punches.push({ pin, punchedAt: t, inOut: Number(rec.state ?? 0) || 0 });
    }
    const r = await this.ingestPunches(punches, {
      deviceKey: device.serial,
      deviceId: device.id,
      source: 'DEVICE',
    });
    await this.prisma.attendanceDevice.update({
      where: { id: device.id },
      data: { lastSeenAt: new Date() },
    });
    await this.audit.log({
      actorId,
      action: 'attendance.pull',
      entity: 'attendance_device',
      entityId: device.id,
      metadata: { pulled: punches.length, inserted: r.inserted },
    });
    return { pulled: punches.length, ...r };
  }
}
