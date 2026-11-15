-- Gambar kop surat utuh + nama/NIP bendahara untuk slip gaji
ALTER TABLE "schools"
  ADD COLUMN "kop_url" TEXT,
  ADD COLUMN "treasurer" TEXT,
  ADD COLUMN "treasurer_nip" TEXT;
