-- Satuan jam pelajaran (JP) untuk payroll:
--   gaji pokok = jam wajib (JP) × tarif — tetap, tidak dipotong absen
--   transport  = akumulasi JP harian (menit hadir ÷ menit-per-JP) × tarif transport
-- Data lama (menit) dikonversi ÷60 → angka "jam" yang sama dalam JP.

-- 1) Pengaturan: 1 jam pelajaran = N menit (default 40 — umum SMP).
ALTER TABLE payroll_settings ADD COLUMN lesson_minutes INT NOT NULL DEFAULT 40;

-- 2) Pegawai: jam wajib bulanan menit → JP.
ALTER TABLE employees RENAME COLUMN monthly_required_minutes TO required_jp;
ALTER TABLE employees ALTER COLUMN required_jp TYPE DOUBLE PRECISION USING required_jp / 60.0;
ALTER TABLE employees ALTER COLUMN required_jp SET DEFAULT 0;

-- 3) Item payroll: jam wajib & koreksi manual menit → JP; + kolom transport JP beku.
ALTER TABLE payroll_items RENAME COLUMN required_minutes TO required_jp;
ALTER TABLE payroll_items ALTER COLUMN required_jp TYPE DOUBLE PRECISION USING required_jp / 60.0;
ALTER TABLE payroll_items ALTER COLUMN required_jp SET DEFAULT 0;

ALTER TABLE payroll_items RENAME COLUMN manual_minutes TO manual_jp;
ALTER TABLE payroll_items ALTER COLUMN manual_jp TYPE DOUBLE PRECISION USING manual_jp / 60.0;
ALTER TABLE payroll_items ALTER COLUMN manual_jp SET DEFAULT 0;

ALTER TABLE payroll_items ADD COLUMN transport_jp DOUBLE PRECISION NOT NULL DEFAULT 0;
-- Backfill riwayat: total JP transport ≈ menit hadir + koreksi, ÷60 (satuan lama).
UPDATE payroll_items SET transport_jp = GREATEST(0, worked_minutes + COALESCE(manual_jp * 60.0, 0)) / 60.0;
