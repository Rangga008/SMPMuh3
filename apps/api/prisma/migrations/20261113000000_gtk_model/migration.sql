-- GTK model ala Dapodik: Jenis = GURU/TENDIK, tendik punya staff_kind
-- (jabatan: TU/LAYSUS/SATPAM/KEPALA_SEKOLAH), keduanya bisa punya
-- additional_duty (WAKASEK_*/KEPALA_TU/BENDAHARA_*/dst).
-- NOTE: enum value baru tidak boleh dipakai dalam transaksi yang sama —
-- UPDATE data dipisah ke 20261113000001_gtk_model_data.

ALTER TYPE "EmployeeType" ADD VALUE IF NOT EXISTS 'TENDIK';

ALTER TABLE "employees"
  ADD COLUMN IF NOT EXISTS "staff_kind" TEXT,
  ADD COLUMN IF NOT EXISTS "additional_duty" TEXT;
