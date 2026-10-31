-- Tata Usaha: surat menyurat, mutasi siswa, rekap Ujian Sekolah
CREATE TYPE "LetterDirection" AS ENUM ('IN', 'OUT');
CREATE TYPE "MutationDirection" AS ENUM ('IN', 'OUT');
CREATE TYPE "MutationStatus" AS ENUM ('PROCESS', 'DONE', 'CANCELLED');
CREATE TYPE "ExamPeriod" AS ENUM ('US1', 'US2');
CREATE TYPE "ExamResult" AS ENUM ('PENDING', 'PASSED', 'FAILED');

CREATE TABLE "letters" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "direction" "LetterDirection" NOT NULL,
  "number" TEXT NOT NULL,
  "date" DATE NOT NULL,
  "subject" TEXT NOT NULL,
  "party" TEXT,
  "description" TEXT,
  "storage_key" TEXT,
  "file_name" TEXT,
  "mime_type" TEXT,
  "created_by" UUID,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "letters_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "letters_direction_number_key" ON "letters"("direction", "number");
CREATE INDEX "letters_direction_date_idx" ON "letters"("direction", "date");

CREATE TABLE "student_mutations" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "direction" "MutationDirection" NOT NULL,
  "student_name" TEXT NOT NULL,
  "nisn" TEXT,
  "date" DATE NOT NULL,
  "school" TEXT,
  "letter_number" TEXT,
  "status" "MutationStatus" NOT NULL DEFAULT 'PROCESS',
  "notes" TEXT,
  "created_by" UUID,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "student_mutations_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "student_mutations_direction_date_idx" ON "student_mutations"("direction", "date");

CREATE TABLE "school_exam_records" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "period" "ExamPeriod" NOT NULL,
  "academic_year_id" UUID NOT NULL,
  "student_name" TEXT NOT NULL,
  "nisn" TEXT,
  "score" INTEGER,
  "result" "ExamResult" NOT NULL DEFAULT 'PENDING',
  "notes" TEXT,
  "created_by" UUID,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "school_exam_records_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "school_exam_records_academic_year_id_fkey" FOREIGN KEY ("academic_year_id") REFERENCES "academic_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "school_exam_records_period_academic_year_id_idx" ON "school_exam_records"("period", "academic_year_id");
