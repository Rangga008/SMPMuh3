-- CreateTable
CREATE TABLE IF NOT EXISTS "assessment_passages" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "assessment_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "media" JSONB,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "assessment_passages_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "assessment_passages_assessment_id_code_key" ON "assessment_passages"("assessment_id", "code");
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'assessment_passages_assessment_id_fkey') THEN
    ALTER TABLE "assessment_passages" ADD CONSTRAINT "assessment_passages_assessment_id_fkey" FOREIGN KEY ("assessment_id") REFERENCES "assessments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- AlterTable
ALTER TABLE "assessment_questions" ADD COLUMN IF NOT EXISTS "passage_code" TEXT;
ALTER TABLE "assessment_questions" ADD COLUMN IF NOT EXISTS "media" JSONB;
