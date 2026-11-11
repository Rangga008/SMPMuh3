-- Migrasi tipe lama → model GTK (dijalankan setelah enum 'TENDIK' di-commit
-- di 20261113000000_gtk_model).
-- Wakasek = guru dengan tugas tambahan (sesuai arahan: guru menjabat wakasek
-- diberi "tugas tambahan", bukan jenis tersendiri).
UPDATE "employees" SET "type"='TEACHER', "additional_duty"='WAKASEK_KURIKULUM'
  WHERE "type"='KURIKULUM';
UPDATE "employees" SET "type"='TEACHER', "additional_duty"='WAKASEK_KESISWAAN'
  WHERE "type"='KESISWAAN';
-- Tendik lama → jabatan tendik
UPDATE "employees" SET "type"='TENDIK', "staff_kind"='TU'
  WHERE "type" IN ('TU','STAFF');
UPDATE "employees" SET "type"='TENDIK', "staff_kind"='TU', "additional_duty"='BENDAHARA_BOS'
  WHERE "type"='KEUANGAN';
UPDATE "employees" SET "type"='TENDIK', "staff_kind"='LAYSUS'
  WHERE "type" IN ('LAYSUS','SARPRAS');
UPDATE "employees" SET "type"='TENDIK', "staff_kind"='KEPALA_SEKOLAH'
  WHERE "type"='PRINCIPAL';

-- Kepala bidang otomatis dari tugas tambahan kepala.
UPDATE "employees" SET "is_dept_head"=true
  WHERE "additional_duty" IN ('WAKASEK_KURIKULUM','WAKASEK_KESISWAAN','WAKASEK_SARPRAS','KEPALA_TU');
