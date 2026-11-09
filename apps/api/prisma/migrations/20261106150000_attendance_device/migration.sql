-- Absensi mesin fingerprint/face: perangkat, log tap mentah, pengaturan derivasi.

CREATE TYPE "AttendanceSource" AS ENUM ('DEVICE', 'IMPORT', 'MANUAL');
CREATE TYPE "DeviceMode" AS ENUM ('ICLOCK', 'PULL', 'MANUAL');

CREATE TABLE "attendance_devices" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "serial" TEXT NOT NULL,
    "mode" "DeviceMode" NOT NULL DEFAULT 'ICLOCK',
    "host" TEXT,
    "port" INTEGER NOT NULL DEFAULT 4370,
    "comm_key" TEXT,
    "location" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_seen_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "attendance_devices_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "attendance_logs" (
    "id" UUID NOT NULL,
    "device_key" TEXT NOT NULL,
    "device_id" UUID,
    "pin" TEXT NOT NULL,
    "punched_at" TIMESTAMP(3) NOT NULL,
    "in_out" INTEGER NOT NULL DEFAULT 0,
    "employee_id" UUID,
    "source" "AttendanceSource" NOT NULL DEFAULT 'DEVICE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "attendance_logs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "attendance_settings" (
    "id" TEXT NOT NULL DEFAULT 'global',
    "work_start" TEXT NOT NULL DEFAULT '07:00',
    "late_after" INTEGER NOT NULL DEFAULT 10,
    "check_out_from" TEXT NOT NULL DEFAULT '12:00',
    "auto_derive" BOOLEAN NOT NULL DEFAULT true,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "attendance_settings_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "employee_attendances"
    ADD COLUMN "check_in_at" TIMESTAMP(3),
    ADD COLUMN "check_out_at" TIMESTAMP(3),
    ADD COLUMN "source" "AttendanceSource" NOT NULL DEFAULT 'MANUAL';

ALTER TABLE "employees"
    ADD COLUMN "finger_pin" TEXT;

CREATE UNIQUE INDEX "attendance_devices_serial_key" ON "attendance_devices"("serial");
CREATE UNIQUE INDEX "attendance_logs_device_key_pin_punched_at_key" ON "attendance_logs"("device_key", "pin", "punched_at");
CREATE INDEX "attendance_logs_employee_id_punched_at_idx" ON "attendance_logs"("employee_id", "punched_at");
CREATE INDEX "attendance_logs_punched_at_idx" ON "attendance_logs"("punched_at");
CREATE UNIQUE INDEX "employees_finger_pin_key" ON "employees"("finger_pin");

ALTER TABLE "attendance_logs"
    ADD CONSTRAINT "attendance_logs_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "attendance_devices"("id") ON DELETE SET NULL ON UPDATE CASCADE,
    ADD CONSTRAINT "attendance_logs_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "attendance_settings" ("id") VALUES ('global') ON CONFLICT DO NOTHING;
