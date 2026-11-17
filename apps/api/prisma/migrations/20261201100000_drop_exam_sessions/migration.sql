-- Ujian serentak: tidak ada lagi sesi. Jadwal murni dari ujian (start_at–end_at
-- + durasi); siswa punya SATU kursi tetap per periode di satu ruang.

-- Dedupe kursi: siswa yang tercatat di lebih dari satu kursi (lintas link/ruang
-- se-periode) disisakan kursi terawal mengikuti urutan ruang lalu nomor kursi.
WITH ranked AS (
  SELECT s.id,
    ROW_NUMBER() OVER (
      PARTITION BY r.academic_year_id, r.period, s.student_id
      ORDER BY r.name, s.seat_no NULLS LAST, s.id
    ) AS rn
  FROM exam_seats s JOIN exam_rooms r ON r.id = s.room_id
)
DELETE FROM exam_seats s USING ranked k WHERE s.id = k.id AND k.rn > 1;

-- Lepas kursi dari tautan sesi (kolom dihapus beserta FK & uniknya).
ALTER TABLE exam_seats DROP COLUMN link_id;
ALTER TABLE exam_seats ADD CONSTRAINT exam_seats_room_id_student_id_key UNIQUE (room_id, student_id);

-- Tautan sesi-ruang & sesi ujian dihapus seluruhnya.
DROP TABLE exam_room_exams;
DROP TABLE exam_sessions;

-- Kolom legacy tautan ujian tunggal di ruang juga dihapus.
ALTER TABLE exam_rooms DROP COLUMN exam_id;
