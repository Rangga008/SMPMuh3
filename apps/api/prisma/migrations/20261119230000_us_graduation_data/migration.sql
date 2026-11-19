-- US kelas 9: no absen per enrollment, data kelulusan di student, kategori pasca-lulus.

ALTER TABLE "enrollments" ADD COLUMN "absence_no" INTEGER;

ALTER TABLE "students"
  ADD COLUMN "diploma_no" TEXT,
  ADD COLUMN "ijazah_taken_at" TIMESTAMP(3),
  ADD COLUMN "transcript_taken_at" TIMESTAMP(3),
  ADD COLUMN "continuation_id" UUID,
  ADD COLUMN "continuation_detail" TEXT;

CREATE TABLE "graduation_categories" (
  "id" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "graduation_categories_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "students"
  ADD CONSTRAINT "students_continuation_id_fkey"
  FOREIGN KEY ("continuation_id") REFERENCES "graduation_categories"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Kategori bawaan pasca-lulus (bisa diubah/dinonaktifkan dari menu).
INSERT INTO "graduation_categories" ("id", "name", "sort_order") VALUES
  (gen_random_uuid(), 'SMA', 1),
  (gen_random_uuid(), 'SMK', 2),
  (gen_random_uuid(), 'MA', 3),
  (gen_random_uuid(), 'Pesantren / Boarding', 4),
  (gen_random_uuid(), 'Bekerja', 5),
  (gen_random_uuid(), 'Wirausaha', 6),
  (gen_random_uuid(), 'Tidak Melanjutkan', 7),
  (gen_random_uuid(), 'Lainnya', 8);
