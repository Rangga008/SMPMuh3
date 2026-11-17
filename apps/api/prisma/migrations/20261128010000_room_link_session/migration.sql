-- Ruang ujian tertaut ke ExamSession — label & jendela sesi sinkron
-- otomatis dari sesi ujian (bukan lagi teks manual).

-- Unik lama bisa tersimpan sebagai constraint ATAU index tergantung riwayat migrasi.
ALTER TABLE "exam_room_exams" DROP CONSTRAINT IF EXISTS "exam_room_exams_room_id_exam_id_key";
DROP INDEX IF EXISTS "exam_room_exams_room_id_exam_id_key";
ALTER TABLE "exam_room_exams" ADD COLUMN "session_id" UUID;

ALTER TABLE "exam_room_exams"
  ADD CONSTRAINT "exam_room_exams_session_id_fkey"
  FOREIGN KEY ("session_id") REFERENCES "exam_sessions"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Satu sesi ujian yang sama hanya boleh tertaut satu kali per ruang;
-- link tanpa sesi (session_id NULL) tetap dicek duplikasinya di aplikasi.
CREATE UNIQUE INDEX "exam_room_exams_room_id_exam_id_session_id_key"
  ON "exam_room_exams"("room_id", "exam_id", "session_id");
