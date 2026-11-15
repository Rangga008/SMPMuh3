-- Ruang ujian many-to-many ke ujian CBT: satu ruang bisa host beberapa sesi/ujian
CREATE TABLE IF NOT EXISTS exam_room_exams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES exam_rooms(id) ON DELETE CASCADE,
  exam_id uuid NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  session_label text,
  starts_at timestamptz,
  ends_at timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS exam_room_exams_room_id_exam_id_key ON exam_room_exams(room_id, exam_id);
CREATE INDEX IF NOT EXISTS exam_room_exams_exam_id_idx ON exam_room_exams(exam_id);
ALTER TABLE exam_seats ADD COLUMN IF NOT EXISTS link_id uuid REFERENCES exam_room_exams(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS exam_seats_link_id_idx ON exam_seats(link_id);
-- Backfill: ruang yang sudah punya examId tunggal → buat link, lalu tautkan kursi lama
INSERT INTO exam_room_exams (room_id, exam_id)
SELECT id, exam_id FROM exam_rooms WHERE exam_id IS NOT NULL
ON CONFLICT DO NOTHING;
UPDATE exam_seats s SET link_id = l.id
FROM exam_room_exams l WHERE s.room_id = l.room_id AND s.link_id IS NULL;
ALTER TABLE exam_rooms ADD COLUMN IF NOT EXISTS prasarana_id uuid REFERENCES prasaranas(id) ON DELETE SET NULL;
ALTER TABLE classes ADD COLUMN IF NOT EXISTS prasarana_id uuid REFERENCES prasaranas(id) ON DELETE SET NULL;
ALTER TABLE schedule_entries ADD COLUMN IF NOT EXISTS prasarana_id uuid REFERENCES prasaranas(id) ON DELETE SET NULL;
