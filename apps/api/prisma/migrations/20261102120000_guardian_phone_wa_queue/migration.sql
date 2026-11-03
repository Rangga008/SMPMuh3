-- Satu nomor HP ortu/wali pada titipan + antrean pesan WhatsApp anti-spam.

-- 1. TitipanEntry: gabung phone menjadi guardian_phone
ALTER TABLE "titipan_entries" ADD COLUMN "guardian_phone" TEXT;
UPDATE "titipan_entries"
SET "guardian_phone" = COALESCE("contact_phone", "mother_phone", "father_phone");
ALTER TABLE "titipan_entries"
  DROP COLUMN "mother_phone",
  DROP COLUMN "father_phone",
  DROP COLUMN "contact_phone";

-- 2. WhatsApp gateway setting + antrean pesan
CREATE TYPE "WhatsappMessageStatus" AS ENUM ('QUEUED', 'SENDING', 'SENT', 'FAILED', 'CANCELLED');

CREATE TABLE "whatsapp_settings" (
    "id" TEXT NOT NULL DEFAULT 'whatsapp',
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "gateway_url" TEXT NOT NULL,
    "gateway_token" TEXT,
    "interval_seconds" INTEGER NOT NULL DEFAULT 8,
    "daily_limit" INTEGER NOT NULL DEFAULT 200,
    "updated_by" UUID,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "whatsapp_settings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "whatsapp_messages" (
    "id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "status" "WhatsappMessageStatus" NOT NULL DEFAULT 'QUEUED',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "sent_at" TIMESTAMP(3),
    "ref_type" TEXT,
    "ref_id" UUID,
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "whatsapp_messages_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "whatsapp_messages_status_created_at_idx" ON "whatsapp_messages"("status", "created_at");
CREATE INDEX "whatsapp_messages_type_status_idx" ON "whatsapp_messages"("type", "status");
