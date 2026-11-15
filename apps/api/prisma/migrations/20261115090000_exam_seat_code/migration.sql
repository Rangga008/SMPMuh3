-- Kode peserta ujian per kursi — tercetak di kartu, sinkron dengan login CBT (NIS + kode)
ALTER TABLE "exam_seats" ADD COLUMN "code" TEXT;
CREATE UNIQUE INDEX "exam_seats_code_key" ON "exam_seats"("code") WHERE "code" IS NOT NULL;
