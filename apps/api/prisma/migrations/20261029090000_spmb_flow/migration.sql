-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "RegistrationStatus" ADD VALUE 'AWAITING_PAYMENT';
ALTER TYPE "RegistrationStatus" ADD VALUE 'PAYMENT_REVIEW';
ALTER TYPE "RegistrationStatus" ADD VALUE 'FORM_FILLING';
ALTER TYPE "RegistrationStatus" ADD VALUE 'AWAITING_FINAL_PAYMENT';
ALTER TYPE "RegistrationStatus" ADD VALUE 'FINAL_PAYMENT_REVIEW';

-- AlterTable
ALTER TABLE "invoices" ADD COLUMN     "base_amount" INTEGER,
ADD COLUMN     "discount_percent" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "installment_no" INTEGER,
ADD COLUMN     "kind" TEXT NOT NULL DEFAULT 'other',
ADD COLUMN     "note" TEXT,
ADD COLUMN     "plan_id" UUID;

-- AlterTable
ALTER TABLE "payments" ADD COLUMN     "proof_document_id" UUID,
ADD COLUMN     "verified_at" TIMESTAMP(3),
ADD COLUMN     "verified_by" UUID,
ADD COLUMN     "verify_note" TEXT;

-- AlterTable
ALTER TABLE "registrations" ADD COLUMN     "decision_note" TEXT,
ADD COLUMN     "discount_percent" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "form_answers" JSONB,
ADD COLUMN     "pathway_detail" TEXT,
ADD COLUMN     "psikotes_at" TIMESTAMP(3),
ADD COLUMN     "psikotes_note" TEXT,
ADD COLUMN     "wave_id" UUID;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "phone" TEXT,
ALTER COLUMN "email" DROP NOT NULL;

-- CreateTable
CREATE TABLE "registration_waves" (
    "id" UUID NOT NULL,
    "academic_year_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 1,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "registration_waves_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "spmb_fees" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "updated_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "spmb_fees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "discount_rules" (
    "id" UUID NOT NULL,
    "subType" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "percent" INTEGER NOT NULL DEFAULT 0,
    "min_score" INTEGER,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "discount_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "form_questions" (
    "id" UUID NOT NULL,
    "academic_year_id" UUID,
    "label" TEXT NOT NULL,
    "help_text" TEXT,
    "field_type" TEXT NOT NULL DEFAULT 'text',
    "options" JSONB,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "form_questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "installment_plans" (
    "id" UUID NOT NULL,
    "registration_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "total_amount" INTEGER NOT NULL,
    "count" INTEGER NOT NULL,
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "installment_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "receipts" (
    "id" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "payment_id" UUID NOT NULL,
    "channel" TEXT NOT NULL DEFAULT 'whatsapp',
    "recipient" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "sent_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "receipts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "registration_waves_academic_year_id_is_active_idx" ON "registration_waves"("academic_year_id", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "registration_waves_academic_year_id_name_key" ON "registration_waves"("academic_year_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "spmb_fees_key_key" ON "spmb_fees"("key");

-- CreateIndex
CREATE UNIQUE INDEX "discount_rules_subType_key" ON "discount_rules"("subType");

-- CreateIndex
CREATE INDEX "form_questions_is_active_order_idx" ON "form_questions"("is_active", "order");

-- CreateIndex
CREATE INDEX "installment_plans_registration_id_idx" ON "installment_plans"("registration_id");

-- CreateIndex
CREATE UNIQUE INDEX "receipts_number_key" ON "receipts"("number");

-- CreateIndex
CREATE INDEX "receipts_payment_id_idx" ON "receipts"("payment_id");

-- CreateIndex
CREATE INDEX "registrations_wave_id_idx" ON "registrations"("wave_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_phone_key" ON "users"("phone");

-- AddForeignKey
ALTER TABLE "registration_waves" ADD CONSTRAINT "registration_waves_academic_year_id_fkey" FOREIGN KEY ("academic_year_id") REFERENCES "academic_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "form_questions" ADD CONSTRAINT "form_questions_academic_year_id_fkey" FOREIGN KEY ("academic_year_id") REFERENCES "academic_years"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "registrations" ADD CONSTRAINT "registrations_wave_id_fkey" FOREIGN KEY ("wave_id") REFERENCES "registration_waves"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "installment_plans" ADD CONSTRAINT "installment_plans_registration_id_fkey" FOREIGN KEY ("registration_id") REFERENCES "registrations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "installment_plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_proof_document_id_fkey" FOREIGN KEY ("proof_document_id") REFERENCES "documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

