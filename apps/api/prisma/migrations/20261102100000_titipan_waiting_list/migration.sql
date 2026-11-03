-- CreateEnum
CREATE TYPE "TitipanStatus" AS ENUM ('PENDING', 'WAITING', 'CODE_SENT', 'REGISTERED', 'CANCELLED');

-- AlterTable
ALTER TABLE "academic_years" ADD COLUMN "quota" INTEGER,
ADD COLUMN "titipan_open" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "titipan_entries" (
    "id" UUID NOT NULL,
    "academic_year_id" UUID NOT NULL,
    "parent_id" UUID,
    "candidate_id" UUID,
    "candidate_name" TEXT NOT NULL,
    "birth_place" TEXT,
    "birth_date" DATE,
    "address" TEXT,
    "previous_school" TEXT,
    "mother_phone" TEXT,
    "father_phone" TEXT,
    "contact_phone" TEXT,
    "info_source" TEXT,
    "queue_no" INTEGER NOT NULL,
    "status" "TitipanStatus" NOT NULL DEFAULT 'PENDING',
    "form_code" TEXT,
    "code_sent_at" TIMESTAMP(3),
    "code_sent_by" UUID,
    "code_used_at" TIMESTAMP(3),
    "registration_id" UUID,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "titipan_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "titipan_entries_form_code_key" ON "titipan_entries"("form_code");

-- CreateIndex
CREATE UNIQUE INDEX "titipan_entries_academic_year_id_queue_no_key" ON "titipan_entries"("academic_year_id", "queue_no");

-- CreateIndex
CREATE INDEX "titipan_entries_academic_year_id_status_queue_no_idx" ON "titipan_entries"("academic_year_id", "status", "queue_no");

-- CreateIndex
CREATE INDEX "titipan_entries_parent_id_idx" ON "titipan_entries"("parent_id");

-- AddForeignKey
ALTER TABLE "titipan_entries" ADD CONSTRAINT "titipan_entries_academic_year_id_fkey" FOREIGN KEY ("academic_year_id") REFERENCES "academic_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "titipan_entries" ADD CONSTRAINT "titipan_entries_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "titipan_entries" ADD CONSTRAINT "titipan_entries_candidate_id_fkey" FOREIGN KEY ("candidate_id") REFERENCES "candidates"("id") ON DELETE SET NULL ON UPDATE CASCADE;
