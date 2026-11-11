ALTER TABLE "students" ADD COLUMN "nik" TEXT;
ALTER TABLE "candidates" ADD COLUMN "nik" TEXT;

CREATE TABLE "sarana_types" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "code" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "sarana_types_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "sarana_types_code_key" ON "sarana_types"("code");

CREATE TABLE "sarana_items" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "type_id" UUID NOT NULL,
  "location" TEXT,
  "ownership" TEXT,
  "spec" TEXT,
  "qty" INTEGER NOT NULL DEFAULT 0,
  "good" INTEGER NOT NULL DEFAULT 0,
  "bad" INTEGER NOT NULL DEFAULT 0,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "sarana_items_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "sarana_items_type_id_fkey" FOREIGN KEY ("type_id") REFERENCES "sarana_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "sarana_items_type_id_idx" ON "sarana_items"("type_id");

CREATE TABLE "prasaranas" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "name" TEXT NOT NULL,
  "note" TEXT,
  "length" DOUBLE PRECISION,
  "width" DOUBLE PRECISION,
  "ownership" TEXT,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "prasaranas_pkey" PRIMARY KEY ("id")
);
