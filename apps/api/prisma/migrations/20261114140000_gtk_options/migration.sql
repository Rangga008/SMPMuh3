-- Opsi GTK yang bisa dikelola — jabatan tendik (STAFF_KIND) & tugas tambahan (DUTY).
CREATE TABLE IF NOT EXISTS "gtk_options" (
  "id"          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "group"       TEXT NOT NULL,               -- STAFF_KIND | DUTY
  "code"        TEXT NOT NULL,               -- disimpan di employees.staff_kind/additional_duty
  "label"       TEXT NOT NULL,
  "department"  TEXT,                        -- bidang turunan (null = ikuti jabatan/jenis)
  "is_head"     BOOLEAN NOT NULL DEFAULT FALSE,
  "role_key"    TEXT,                        -- role akun bila dibuatkan login
  "sort_order"  INT NOT NULL DEFAULT 0,
  "is_active"   BOOLEAN NOT NULL DEFAULT TRUE,
  "created_at"  TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at"  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "gtk_options_group_code_key" UNIQUE ("group", "code")
);

-- Seed bawaan — sama dengan konstanta lama agar perilaku tak berubah.
INSERT INTO "gtk_options" ("group","code","label","department","is_head","role_key","sort_order") VALUES
  ('STAFF_KIND','TU','Tata Usaha (TU)','TATA_USAHA',FALSE,'staff_tu',10),
  ('STAFF_KIND','LAYSUS','Layanan Khusus (Laysus)','LAYSUS',FALSE,'staff_kesiswaan',20),
  ('STAFF_KIND','SATPAM','Satpam / Keamanan','LAYSUS',FALSE,'staff_tu',30),
  ('STAFF_KIND','KEPALA_SEKOLAH','Kepala Sekolah',NULL,TRUE,'kepala_sekolah',40),
  ('DUTY','WAKASEK_KURIKULUM','Wakasek Kurikulum','KURIKULUM',TRUE,'staff_kurikulum',10),
  ('DUTY','WAKASEK_KESISWAAN','Wakasek Kesiswaan','KESISWAAN',TRUE,'staff_kesiswaan',20),
  ('DUTY','WAKASEK_SARPRAS','Wakasek Sarpras','SARPRAS',TRUE,'staff_tu',30),
  ('DUTY','KEPALA_TU','Kepala Tata Usaha','TATA_USAHA',TRUE,'kepala_tu',40),
  ('DUTY','BENDAHARA_SEKOLAH','Bendahara Sekolah','KEUANGAN',FALSE,'bendahara',50),
  ('DUTY','BENDAHARA_BOS','Bendahara BOS','KEUANGAN',FALSE,'bendahara',60),
  ('DUTY','BENDAHARA_RMP','Bendahara RMP','KEUANGAN',FALSE,'bendahara',70),
  ('DUTY','OPERATOR_DAPODIK','Operator Dapodik','TATA_USAHA',FALSE,'staff_tu',80),
  ('DUTY','KONTEN_KREATOR','Konten Kreator','TATA_USAHA',FALSE,'staff_tu',90),
  ('DUTY','KEPALA_PERPUSTAKAAN','Kepala Perpustakaan','TATA_USAHA',FALSE,'staff_tu',100),
  ('DUTY','STAF_PERPUSTAKAAN','Staf Perpustakaan','TATA_USAHA',FALSE,'staff_tu',110),
  ('DUTY','PETUGAS_KEBERSIHAN_L1','Petugas Kebersihan Lantai 1','LAYSUS',FALSE,'staff_kesiswaan',120),
  ('DUTY','PETUGAS_KEBERSIHAN_L2','Petugas Kebersihan Lantai 2','LAYSUS',FALSE,'staff_kesiswaan',130),
  ('DUTY','PETUGAS_KEBERSIHAN_L3','Petugas Kebersihan Lantai 3','LAYSUS',FALSE,'staff_kesiswaan',140),
  ('DUTY','PETUGAS_KEBERSIHAN_L4','Petugas Kebersihan Lantai 4','LAYSUS',FALSE,'staff_kesiswaan',150),
  ('DUTY','SATPAM','Satpam','LAYSUS',FALSE,'staff_tu',160)
ON CONFLICT ("group","code") DO NOTHING;
