-- CreateTable
CREATE TABLE IF NOT EXISTS "exam_credentials" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "exam_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "password" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "exam_credentials_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "exam_credentials_exam_id_student_id_key" ON "exam_credentials"("exam_id", "student_id");
CREATE INDEX IF NOT EXISTS "exam_credentials_exam_id_idx" ON "exam_credentials"("exam_id");
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'exam_credentials_exam_id_fkey') THEN
    ALTER TABLE "exam_credentials" ADD CONSTRAINT "exam_credentials_exam_id_fkey" FOREIGN KEY ("exam_id") REFERENCES "exams"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'exam_credentials_student_id_fkey') THEN
    ALTER TABLE "exam_credentials" ADD CONSTRAINT "exam_credentials_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
