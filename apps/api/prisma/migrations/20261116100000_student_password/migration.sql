-- Password login CBT per siswa — tercetak di kartu ujian.
-- Siswa lama (NULL) diisi malas saat kartu dicetak / login pertama.
ALTER TABLE "students" ADD COLUMN "password" TEXT;
