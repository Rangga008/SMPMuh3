-- Nomor peserta ujian model baru: {jenjang:2d}-{kode tengah}-{urut:3d}
-- contoh "07-145-001" — jenjang dari rombel, kode tengah per ruang (default
-- '145'), urut berlanjut lintas ruang dalam satu periode.
ALTER TABLE exam_rooms ADD COLUMN participant_code TEXT NOT NULL DEFAULT '145';

-- Penomoran ulang kursi yang ada ke format baru. Urut global mengikuti
-- (tahun ajaran, periode, nama ruang, no kursi) sehingga tiap periode
-- tetap mendapat rentang berurutan tanpa bentrok antar periode.
WITH numbered AS (
  SELECT s.id,
    ROW_NUMBER() OVER (
      ORDER BY r.academic_year_id, r.period, r.name, s.seat_no NULLS LAST, s.id
    ) AS seq,
    COALESCE(cl.grade_level, 0) AS grade,
    r.participant_code AS mid
  FROM exam_seats s
  JOIN exam_rooms r ON r.id = s.room_id
  LEFT JOIN classes cl ON cl.id = s.class_id
)
UPDATE exam_seats s
SET code = lpad(n.grade::text, 2, '0') || '-' || n.mid || '-' || lpad(n.seq::text, 3, '0')
FROM numbered n
WHERE s.id = n.id;
