-- Potongan persen + urutan, kategori izin, jam wajib bulanan
CREATE TYPE "DeductionMethod" AS ENUM ('FIXED', 'PERCENT');
CREATE TYPE "DeductionBase" AS ENUM ('GROSS', 'REST');
CREATE TYPE "LeaveCategory" AS ENUM ('SAKIT', 'DINAS', 'WORKSHOP', 'LAINNYA');

ALTER TABLE "deduction_types"
  ADD COLUMN "method" "DeductionMethod" NOT NULL DEFAULT 'FIXED',
  ADD COLUMN "percent" DOUBLE PRECISION,
  ADD COLUMN "base" "DeductionBase" NOT NULL DEFAULT 'GROSS',
  ADD COLUMN "sort_order" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "employee_deductions" ADD COLUMN "percent" DOUBLE PRECISION;
ALTER TABLE "employee_attendances" ADD COLUMN "leave_category" "LeaveCategory";

-- Jam wajib kini per bulan (bukan per minggu × 4)
ALTER TABLE "employees" RENAME COLUMN "weekly_required_minutes" TO "monthly_required_minutes";
