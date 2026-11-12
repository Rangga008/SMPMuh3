-- CBT: sesi ujian daring + jawaban siswa; kolom teks pilihan di butir soal.

-- CreateEnum
CREATE TYPE "ExamStatus" AS ENUM ('DRAFT', 'OPEN', 'CLOSED');
CREATE TYPE "ExamAttemptStatus" AS ENUM ('STARTED', 'SUBMITTED');

-- AlterTable
ALTER TABLE "assessment_questions" ADD COLUMN "options" JSONB;

-- CreateTable
CREATE TABLE "exams" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "assessment_id" UUID NOT NULL,
    "academic_year_id" UUID NOT NULL,
    "classIds" JSONB NOT NULL,
    "instructions" TEXT,
    "start_at" TIMESTAMP(3) NOT NULL,
    "end_at" TIMESTAMP(3) NOT NULL,
    "duration_min" INTEGER NOT NULL,
    "shuffle" BOOLEAN NOT NULL DEFAULT false,
    "show_score" BOOLEAN NOT NULL DEFAULT true,
    "status" "ExamStatus" NOT NULL DEFAULT 'DRAFT',
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "exams_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "exam_attempts" (
    "id" UUID NOT NULL,
    "exam_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "token" TEXT NOT NULL,
    "status" "ExamAttemptStatus" NOT NULL DEFAULT 'STARTED',
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deadline" TIMESTAMP(3) NOT NULL,
    "submitted_at" TIMESTAMP(3),
    "score" INTEGER,
    "max_score" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "exam_attempts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "exam_answers" (
    "id" UUID NOT NULL,
    "attempt_id" UUID NOT NULL,
    "question_id" UUID NOT NULL,
    "answer" JSONB,
    "is_correct" BOOLEAN,
    "score" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "exam_answers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "exams_code_key" ON "exams"("code");
CREATE INDEX "exams_academic_year_id_status_idx" ON "exams"("academic_year_id", "status");
CREATE UNIQUE INDEX "exam_attempts_token_key" ON "exam_attempts"("token");
CREATE INDEX "exam_attempts_student_id_idx" ON "exam_attempts"("student_id");
CREATE UNIQUE INDEX "exam_attempts_exam_id_student_id_key" ON "exam_attempts"("exam_id", "student_id");
CREATE UNIQUE INDEX "exam_answers_attempt_id_question_id_key" ON "exam_answers"("attempt_id", "question_id");

-- AddForeignKey
ALTER TABLE "exams" ADD CONSTRAINT "exams_assessment_id_fkey" FOREIGN KEY ("assessment_id") REFERENCES "assessments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "exam_attempts" ADD CONSTRAINT "exam_attempts_exam_id_fkey" FOREIGN KEY ("exam_id") REFERENCES "exams"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "exam_attempts" ADD CONSTRAINT "exam_attempts_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "exam_answers" ADD CONSTRAINT "exam_answers_attempt_id_fkey" FOREIGN KEY ("attempt_id") REFERENCES "exam_attempts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "exam_answers" ADD CONSTRAINT "exam_answers_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "assessment_questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
