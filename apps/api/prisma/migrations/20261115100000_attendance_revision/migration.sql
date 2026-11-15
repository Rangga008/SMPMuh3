ALTER TABLE "attendance_records" ADD COLUMN IF NOT EXISTS "revised_by" UUID;
ALTER TABLE "attendance_records" ADD COLUMN IF NOT EXISTS "revised_at" TIMESTAMP(3);
