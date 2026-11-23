-- Buku nilai (daftar nilai) per kelas×mapel×tahun — kolom fleksibel milik guru,
-- bobot NR dapat diatur, nilai akhir dikirim ke wali kelas untuk rapor.

-- CreateEnum
CREATE TYPE "GradeColumnKind" AS ENUM ('FORMATIF', 'SUMATIF_LM', 'ASAJ', 'CUSTOM');

-- CreateTable
CREATE TABLE "grade_books" (
    "id" UUID NOT NULL,
    "academic_year_id" UUID NOT NULL,
    "class_id" UUID NOT NULL,
    "subject_id" UUID NOT NULL,
    "avg_weight" DOUBLE PRECISION NOT NULL DEFAULT 2,
    "submitted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "grade_books_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "grade_columns" (
    "id" UUID NOT NULL,
    "grade_book_id" UUID NOT NULL,
    "kind" "GradeColumnKind" NOT NULL DEFAULT 'FORMATIF',
    "name" TEXT NOT NULL,
    "weight" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "exam_id" UUID,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "grade_columns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "grade_entries" (
    "id" UUID NOT NULL,
    "column_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "updated_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "grade_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "grade_books_academic_year_id_class_id_subject_id_key" ON "grade_books"("academic_year_id", "class_id", "subject_id");
CREATE INDEX "grade_books_class_id_idx" ON "grade_books"("class_id");
CREATE INDEX "grade_columns_grade_book_id_idx" ON "grade_columns"("grade_book_id");
CREATE UNIQUE INDEX "grade_entries_column_id_student_id_key" ON "grade_entries"("column_id", "student_id");
CREATE INDEX "grade_entries_student_id_idx" ON "grade_entries"("student_id");

-- AddForeignKey
ALTER TABLE "grade_books" ADD CONSTRAINT "grade_books_academic_year_id_fkey" FOREIGN KEY ("academic_year_id") REFERENCES "academic_years"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "grade_books" ADD CONSTRAINT "grade_books_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "classes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "grade_books" ADD CONSTRAINT "grade_books_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "subjects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "grade_columns" ADD CONSTRAINT "grade_columns_grade_book_id_fkey" FOREIGN KEY ("grade_book_id") REFERENCES "grade_books"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "grade_columns" ADD CONSTRAINT "grade_columns_exam_id_fkey" FOREIGN KEY ("exam_id") REFERENCES "exams"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "grade_entries" ADD CONSTRAINT "grade_entries_column_id_fkey" FOREIGN KEY ("column_id") REFERENCES "grade_columns"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "grade_entries" ADD CONSTRAINT "grade_entries_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;
