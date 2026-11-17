-- Tautan ruang-sesi tak lagi wajib terikat satu ujian: satu sesi ruang bisa
-- menampung rombel campuran lintas jenjang (ujian tiap siswa diturunkan dari
-- sesi CBT yang mencakup kelasnya).
ALTER TABLE "exam_room_exams" ALTER COLUMN "exam_id" DROP NOT NULL;
