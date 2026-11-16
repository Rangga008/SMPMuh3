-- Mutasi keluar tertaut ke siswa nyata agar status sinkron
ALTER TABLE "student_mutations" ADD COLUMN "student_id" UUID;

ALTER TABLE "student_mutations" ADD CONSTRAINT "student_mutations_student_id_fkey"
  FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "student_mutations_student_id_idx" ON "student_mutations"("student_id");
