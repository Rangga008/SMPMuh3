-- Proteksi ujian CBT (warn/blokir pelanggaran) + alur persetujuan izin pegawai.

-- AlterEnum — aman digabung: tidak ada UPDATE yang memakai nilai baru.
ALTER TYPE "ExamAttemptStatus" ADD VALUE 'BLOCKED';

-- CreateEnum
CREATE TYPE "LeaveRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

-- AlterTable
ALTER TABLE "exams" ADD COLUMN IF NOT EXISTS "warn_after" INTEGER NOT NULL DEFAULT 2,
ADD COLUMN IF NOT EXISTS "block_after" INTEGER NOT NULL DEFAULT 4;

-- AlterTable
ALTER TABLE "exam_attempts" ADD COLUMN IF NOT EXISTS "violations" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS "blocked_at" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "leave_requests" (
    "id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "date_from" DATE NOT NULL,
    "date_to" DATE NOT NULL,
    "category" "LeaveCategory" NOT NULL,
    "partial_from_min" INTEGER,
    "note" TEXT,
    "status" "LeaveRequestStatus" NOT NULL DEFAULT 'PENDING',
    "reviewed_by_id" UUID,
    "reviewed_at" TIMESTAMP(3),
    "review_note" TEXT,
    "applied_days" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "leave_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "leave_requests_status_date_from_idx" ON "leave_requests"("status", "date_from");

-- CreateIndex
CREATE INDEX "leave_requests_employee_id_date_from_idx" ON "leave_requests"("employee_id", "date_from");

-- AddForeignKey
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_reviewed_by_id_fkey" FOREIGN KEY ("reviewed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
