-- Absensi harian sinkron ke satuan Jam Pelajaran:
-- kolom menit ngajar → JP (dibagi menit-per-JP dari pengaturan payroll).
ALTER TABLE employee_attendances RENAME COLUMN teaching_minutes TO teaching_jp;
ALTER TABLE employee_attendances ALTER COLUMN teaching_jp TYPE DOUBLE PRECISION USING teaching_jp::DOUBLE PRECISION;
DO $$
DECLARE lm INT;
BEGIN
  SELECT lesson_minutes INTO lm FROM payroll_settings WHERE id = 'global';
  UPDATE employee_attendances SET teaching_jp = teaching_jp / COALESCE(NULLIF(lm, 0), 40);
END $$;
ALTER TABLE employee_attendances ALTER COLUMN teaching_jp SET DEFAULT 0;
