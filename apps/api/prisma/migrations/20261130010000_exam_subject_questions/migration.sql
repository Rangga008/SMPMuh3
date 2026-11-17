-- Refactor besar ujian:
--  * Asesmen → payung periode (nama saja): subject_id jadi opsional.
--  * Exam → punya subject_id + grade_level sendiri (per-mapel per-jenjang).
--  * Soal → bisa menempel ke ujian (exam_id) — kolom lama assessment_id tetap.
--  * Grade → bisa menunjuk ujian (exam_id).
--  * ExamSeat → checklist hadir pengawas (present).

ALTER TABLE "assessments" ALTER COLUMN "subject_id" DROP NOT NULL;
ALTER TABLE "assessment_questions" ALTER COLUMN "assessment_id" DROP NOT NULL;
ALTER TABLE "grades" ALTER COLUMN "assessment_id" DROP NOT NULL;

ALTER TABLE "exams" ADD COLUMN "subject_id" UUID, ADD COLUMN "grade_level" INTEGER;
ALTER TABLE "assessment_questions" ADD COLUMN "exam_id" UUID;
ALTER TABLE "grades" ADD COLUMN "exam_id" UUID;
ALTER TABLE "exam_seats" ADD COLUMN "present" BOOLEAN;

ALTER TABLE "exams" ADD CONSTRAINT "exams_subject_id_fkey"
  FOREIGN KEY ("subject_id") REFERENCES "subjects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "assessment_questions" ADD CONSTRAINT "assessment_questions_exam_id_fkey"
  FOREIGN KEY ("exam_id") REFERENCES "exams"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "grades" ADD CONSTRAINT "grades_exam_id_fkey"
  FOREIGN KEY ("exam_id") REFERENCES "exams"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE UNIQUE INDEX "assessment_questions_exam_id_number_key"
  ON "assessment_questions"("exam_id", "number");
CREATE UNIQUE INDEX "grades_exam_id_student_id_key"
  ON "grades"("exam_id", "student_id");

-- ===== Migrasi data =====
-- 1) Mapel ujian diambil dari asesmen induknya.
UPDATE "exams" e SET "subject_id" = a."subject_id"
FROM "assessments" a WHERE a."id" = e."assessment_id" AND a."subject_id" IS NOT NULL;

-- 2) Jenjang ujian: diisi hanya bila semua rombelnya satu jenjang.
UPDATE "exams" SET "grade_level" = sub.gl FROM (
  SELECT e2."id" AS exam_id, MIN(c."grade_level") AS gl
  FROM "exams" e2
  JOIN "classes" c ON c."id"::text IN (SELECT jsonb_array_elements_text(e2."classIds"))
  GROUP BY e2."id"
  HAVING COUNT(DISTINCT c."grade_level") = 1
) sub WHERE "exams"."id" = sub.exam_id;

-- 3) Soal diduplikasi ke tiap ujian yang tertaut ke asesmennya
--    (satu asesmen bisa dipakai beberapa ujian → tiap ujian dapat salinannya).
INSERT INTO "assessment_questions"
  ("id", "assessment_id", "exam_id", "number", "type", "weight", "key", "prompt", "options", "passage_code", "media")
SELECT gen_random_uuid(), NULL, e."id", q."number", q."type", q."weight", q."key", q."prompt", q."options", q."passage_code", q."media"
FROM "assessment_questions" q
JOIN "exams" e ON e."assessment_id" = q."assessment_id";

-- 4) Nilai diarahkan ke ujian dari asesmennya (bila asesmen dipakai >1 ujian,
--    diambil ujian pertama — mayoritas 1:1).
UPDATE "grades" g SET "exam_id" = x.exam_id FROM (
  SELECT DISTINCT ON ("assessment_id") "assessment_id", "id" AS exam_id
  FROM "exams" ORDER BY "assessment_id", "created_at", "id"
) x WHERE x."assessment_id" = g."assessment_id";
