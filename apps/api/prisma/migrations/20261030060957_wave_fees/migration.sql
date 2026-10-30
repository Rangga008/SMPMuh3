-- CreateTable
CREATE TABLE "wave_fees" (
    "wave_id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "updated_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "wave_fees_pkey" PRIMARY KEY ("wave_id","key")
);

-- AddForeignKey
ALTER TABLE "wave_fees" ADD CONSTRAINT "wave_fees_wave_id_fkey" FOREIGN KEY ("wave_id") REFERENCES "registration_waves"("id") ON DELETE CASCADE ON UPDATE CASCADE;
