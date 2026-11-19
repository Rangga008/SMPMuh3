-- Periode payroll per tanggal (mis. 21 bulan lalu → 19 bulan ini) + izin parsial (pulang awal mulai JP ke-N).

ALTER TABLE "payroll_runs"
  ADD COLUMN "period_start" DATE,
  ADD COLUMN "period_end" DATE;

ALTER TABLE "payroll_settings"
  ADD COLUMN "period_start_day" INTEGER NOT NULL DEFAULT 21,
  ADD COLUMN "period_end_day" INTEGER NOT NULL DEFAULT 19;

ALTER TABLE "employee_attendances"
  ADD COLUMN "partial_leave_from_min" INTEGER;

ALTER TABLE "attendance_settings"
  ADD COLUMN "work_end" TEXT NOT NULL DEFAULT '15:00';

COMMENT ON COLUMN "employee_attendances"."partial_leave_from_min" IS 'Izin pulang awal — menit sejak 00:00 WIB mulai izin; sisa hari dihitung izin';
COMMENT ON COLUMN "payroll_runs"."period_start" IS 'Awal rentang absen untuk run ini — NULL = pakai rentang bulan kalender';
COMMENT ON COLUMN "payroll_runs"."period_end" IS 'Akhir rentang absen (inklusif) — NULL = pakai rentang bulan kalender';
