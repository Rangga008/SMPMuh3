-- Kop surat resmi sekolah: NSS/NDS/akreditasi + 2 baris yayasan (mis. PCM & Majelis Dikdasmen)
ALTER TABLE "schools"
  ADD COLUMN "nss" TEXT,
  ADD COLUMN "nds" TEXT,
  ADD COLUMN "accreditation" TEXT,
  ADD COLUMN "kop_line1" TEXT,
  ADD COLUMN "kop_line2" TEXT;
