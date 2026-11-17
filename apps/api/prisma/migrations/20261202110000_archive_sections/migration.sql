-- Arsip per bidang — tiap bidang (TU/Kurikulum/Kesiswaan/Keuangan/GTK/Sarpras/SPMB)
-- punya arsip & kategori sendiri. Data lama → TATAUSAHA (arsip TU).
ALTER TABLE archive_categories ADD COLUMN IF NOT EXISTS section varchar(20) NOT NULL DEFAULT 'TATAUSAHA';
ALTER TABLE archive_items ADD COLUMN IF NOT EXISTS section varchar(20) NOT NULL DEFAULT 'TATAUSAHA';

-- Nama kategori unik per bidang (bukan global) — "SK" bisa ada di tiap bidang.
ALTER TABLE archive_categories DROP CONSTRAINT IF EXISTS archive_categories_name_key;
DROP INDEX IF EXISTS archive_categories_name_key;
CREATE UNIQUE INDEX IF NOT EXISTS archive_categories_section_name_key
  ON archive_categories (section, name);

DROP INDEX IF EXISTS archive_items_category_id_date_idx;
CREATE INDEX IF NOT EXISTS archive_items_section_category_id_date_idx
  ON archive_items (section, category_id, date);
