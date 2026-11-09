-- 1. TitipanEntry: gelombang sasaran
ALTER TABLE "titipan_entries" ADD COLUMN "wave_id" UUID;
ALTER TABLE "titipan_entries" ADD CONSTRAINT "titipan_entries_wave_id_fkey"
  FOREIGN KEY ("wave_id") REFERENCES "registration_waves"("id") ON DELETE SET NULL;
CREATE INDEX "titipan_entries_wave_id_idx" ON "titipan_entries"("wave_id");

-- 2. EmployeeAttendance: akumulasi menit keterlambatan (lewat jam masuk)
ALTER TABLE "employee_attendances" ADD COLUMN "late_minutes" INTEGER NOT NULL DEFAULT 0;

-- 3. Shift kerja & penugasan ke pegawai
CREATE TABLE "work_shifts" (
  "id"              UUID NOT NULL,
  "name"            TEXT NOT NULL,
  "start_minute"    INTEGER NOT NULL,
  "end_minute"      INTEGER NOT NULL,
  "late_after"      INTEGER NOT NULL DEFAULT 10,
  "check_out_from"  INTEGER NOT NULL,
  "is_active"       BOOLEAN NOT NULL DEFAULT true,
  "created_at"      TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"      TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "work_shifts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "employee_shifts" (
  "id"          UUID NOT NULL,
  "employee_id" UUID NOT NULL,
  "shift_id"    UUID NOT NULL,
  "day_of_week" INTEGER NOT NULL DEFAULT -1, -- -1=semua hari; 0=Minggu…6=Sabtu
  CONSTRAINT "employee_shifts_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "employee_shifts_employee_id_fkey" FOREIGN KEY ("employee_id")
    REFERENCES "employees"("id") ON DELETE CASCADE,
  CONSTRAINT "employee_shifts_shift_id_fkey" FOREIGN KEY ("shift_id")
    REFERENCES "work_shifts"("id") ON DELETE CASCADE,
  CONSTRAINT "employee_shifts_employee_id_day_of_week_key" UNIQUE ("employee_id", "day_of_week")
);
CREATE INDEX "employee_shifts_shift_id_idx" ON "employee_shifts"("shift_id");

-- 4. Event kalender akademik (libur/kegiatan/ujian)
CREATE TABLE "academic_calendar_events" (
  "id"               UUID NOT NULL,
  "date"             DATE NOT NULL,
  "title"            TEXT NOT NULL,
  "type"             TEXT NOT NULL DEFAULT 'KEGIATAN',
  "note"             TEXT,
  "academic_year_id" UUID,
  "created_at"       TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "academic_calendar_events_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "academic_calendar_events_academic_year_id_fkey" FOREIGN KEY ("academic_year_id")
    REFERENCES "academic_years"("id") ON DELETE SET NULL
);
CREATE INDEX "academic_calendar_events_date_idx" ON "academic_calendar_events"("date");

-- 5. Pengaturan payroll global (potongan keterlambatan)
CREATE TABLE "payroll_settings" (
  "id"                      TEXT NOT NULL DEFAULT 'global',
  "late_deduction_per_day"  INTEGER NOT NULL DEFAULT 0,
  "late_deduction_per_min"  INTEGER NOT NULL DEFAULT 0,
  "updated_at"              TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "payroll_settings_pkey" PRIMARY KEY ("id")
);
INSERT INTO "payroll_settings" ("id", "late_deduction_per_day", "late_deduction_per_min", "updated_at")
VALUES ('global', 0, 0, CURRENT_TIMESTAMP);
