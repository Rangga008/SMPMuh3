-- Sesi ujian per kelompok rombel + tipe soal benar/salah kompleks.
ALTER TYPE "QuestionType" ADD VALUE IF NOT EXISTS 'TRUE_FALSE_COMPLEX';

CREATE TABLE "exam_sessions" (
    "id" UUID NOT NULL,
    "exam_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "class_ids" JSONB NOT NULL,
    "start_at" TIMESTAMP(3) NOT NULL,
    "end_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "exam_sessions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "exam_sessions_exam_id_idx" ON "exam_sessions"("exam_id");

ALTER TABLE "exam_sessions" ADD CONSTRAINT "exam_sessions_exam_id_fkey" FOREIGN KEY ("exam_id") REFERENCES "exams"("id") ON DELETE CASCADE ON UPDATE CASCADE;
