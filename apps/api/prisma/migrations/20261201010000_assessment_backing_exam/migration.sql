-- Asesmen = ujian: setiap asesmen wajib punya ujian pendamping CBT (1:1).
-- Asesmen lama yang belum punya ujian dibuatkan otomatis (status DRAFT,
-- jendela placeholder — diatur ulang lewat tab Ujian di detail asesmen).
INSERT INTO exams (
  id, code, title, assessment_id, subject_id, grade_level, academic_year_id,
  "classIds", instructions, start_at, end_at, duration_min, shuffle,
  show_score, status, created_by, created_at, updated_at
)
SELECT
  gen_random_uuid(),
  upper(substr(md5(random()::text || a.id::text), 1, 4)) || '-' ||
    upper(substr(md5(random()::text || a.id::text || 'b'), 1, 4)),
  a.name,
  a.id,
  a.subject_id,
  (SELECT c.grade_level FROM classes c WHERE c.id = a.class_id),
  a.academic_year_id,
  CASE
    WHEN a.class_id IS NOT NULL THEN jsonb_build_array(a.class_id)
    ELSE COALESCE(
      (SELECT jsonb_agg(c.id) FROM classes c WHERE c.academic_year_id = a.academic_year_id),
      '[]'::jsonb
    )
  END,
  NULL,
  now(),
  now() + interval '1 day',
  90,
  false,
  true,
  'DRAFT',
  NULL,
  now(),
  now()
FROM assessments a
WHERE NOT EXISTS (SELECT 1 FROM exams e WHERE e.assessment_id = a.id);

-- Soal legacy milik asesmen (exam_id NULL) dipindahkan ke ujian pendamping,
-- kecuali nomor yang sudah ada di sana (hasil penyalinan migrasi sebelumnya).
UPDATE assessment_questions q
SET exam_id = e.id
FROM exams e
WHERE e.assessment_id = q.assessment_id
  AND q.exam_id IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM assessment_questions x
    WHERE x.exam_id = e.id AND x.number = q.number
  );
