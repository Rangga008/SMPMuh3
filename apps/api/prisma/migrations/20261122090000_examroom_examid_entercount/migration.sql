-- AlterTable
ALTER TABLE "exam_rooms" ADD COLUMN IF NOT EXISTS "exam_id" UUID;
ALTER TABLE "exam_attempts" ADD COLUMN IF NOT EXISTS "enter_count" INTEGER NOT NULL DEFAULT 0;

-- Index + FK
CREATE INDEX IF NOT EXISTS "exam_rooms_exam_id_idx" ON "exam_rooms"("exam_id");
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'exam_rooms_exam_id_fkey') THEN
    ALTER TABLE "exam_rooms" ADD CONSTRAINT "exam_rooms_exam_id_fkey" FOREIGN KEY ("exam_id") REFERENCES "exams"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
