-- AlterTable
ALTER TABLE "achievements" ADD COLUMN "evidence_document_id" UUID;

-- AlterTable
ALTER TABLE "violations" ADD COLUMN "evidence_document_id" UUID;

-- AddForeignKey
ALTER TABLE "achievements" ADD CONSTRAINT "achievements_evidence_document_id_fkey" FOREIGN KEY ("evidence_document_id") REFERENCES "documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "violations" ADD CONSTRAINT "violations_evidence_document_id_fkey" FOREIGN KEY ("evidence_document_id") REFERENCES "documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;
