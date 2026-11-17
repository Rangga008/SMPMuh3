-- Kode tengah nomor peserta dipindah dari per-ruang ke satu kode sekolah tetap
-- (schools.exam_code, default '145'). Kode yang sudah tercetak di exam_seats.code
-- tidak berubah (tersimpan utuh) — kolom ruang hanya sumber untuk kursi baru.
ALTER TABLE schools ADD COLUMN IF NOT EXISTS exam_code varchar(10) NOT NULL DEFAULT '145';
ALTER TABLE exam_rooms DROP COLUMN IF EXISTS participant_code;
