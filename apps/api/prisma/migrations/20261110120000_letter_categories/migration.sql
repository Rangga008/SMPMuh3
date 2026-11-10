-- Kategori untuk agenda surat & mutasi (TU bisa menambah sendiri).
CREATE TABLE IF NOT EXISTS "letter_categories" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "kind" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "letter_categories_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "letter_categories_kind_name_key" ON "letter_categories"("kind", "name");

ALTER TABLE "letters" ADD COLUMN IF NOT EXISTS "category_id" UUID;
ALTER TABLE "student_mutations" ADD COLUMN IF NOT EXISTS "category_id" UUID;

ALTER TABLE "letters" ADD CONSTRAINT "letters_category_id_fkey"
    FOREIGN KEY ("category_id") REFERENCES "letter_categories"("id") ON DELETE SET NULL;
ALTER TABLE "student_mutations" ADD CONSTRAINT "student_mutations_category_id_fkey"
    FOREIGN KEY ("category_id") REFERENCES "letter_categories"("id") ON DELETE SET NULL;
