-- Mime lampiran pengajuan (ProgramSubmission) — agar berkas bisa dipratinjau
-- inline (PDF/gambar) alih-alih selalu terunduh sebagai application/octet-stream.
ALTER TABLE "program_submissions" ADD COLUMN "mime_type" TEXT;

-- Backfill untuk lampiran yang sudah ada, tebak dari ekstensi nama berkas.
UPDATE "program_submissions" SET "mime_type" = CASE
  WHEN lower("file_name") LIKE '%.pdf' THEN 'application/pdf'
  WHEN lower("file_name") LIKE '%.png' THEN 'image/png'
  WHEN lower("file_name") LIKE '%.jpg' OR lower("file_name") LIKE '%.jpeg' THEN 'image/jpeg'
  WHEN lower("file_name") LIKE '%.webp' THEN 'image/webp'
  WHEN lower("file_name") LIKE '%.gif' THEN 'image/gif'
  WHEN lower("file_name") LIKE '%.docx' THEN 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  WHEN lower("file_name") LIKE '%.doc' THEN 'application/msword'
  WHEN lower("file_name") LIKE '%.xlsx' THEN 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  WHEN lower("file_name") LIKE '%.xls' THEN 'application/vnd.ms-excel'
END
WHERE "mime_type" IS NULL AND "file_name" IS NOT NULL;
