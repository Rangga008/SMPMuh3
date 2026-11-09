ALTER TYPE "AttendanceSource" ADD VALUE 'SELFIE';

ALTER TABLE "attendance_logs"
  ADD COLUMN "photo_key" TEXT,
  ADD COLUMN "latitude" DOUBLE PRECISION,
  ADD COLUMN "longitude" DOUBLE PRECISION;

ALTER TABLE "attendance_settings"
  ADD COLUMN "school_lat" DOUBLE PRECISION,
  ADD COLUMN "school_lng" DOUBLE PRECISION,
  ADD COLUMN "radius_m" INTEGER NOT NULL DEFAULT 200;

ALTER TABLE "employees"
  ADD COLUMN "department" TEXT,
  ADD COLUMN "is_dept_head" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "receipts"
  ALTER COLUMN "payment_id" DROP NOT NULL,
  ADD COLUMN "ref_type" TEXT,
  ADD COLUMN "ref_id" UUID,
  ADD COLUMN "issued_by" UUID;
