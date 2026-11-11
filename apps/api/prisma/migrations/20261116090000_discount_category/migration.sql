ALTER TABLE "discount_rules" ADD COLUMN "category" TEXT NOT NULL DEFAULT 'non_akademik';
UPDATE "discount_rules" SET "category"='akademik' WHERE "subType"='akademik';
UPDATE "discount_rules" SET "category"='alumni_sdm' WHERE "subType"='alumni_sdm';
