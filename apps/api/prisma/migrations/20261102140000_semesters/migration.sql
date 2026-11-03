CREATE TABLE "semesters" (
    "id" UUID NOT NULL,
    "academic_year_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "start_date" DATE,
    "end_date" DATE,
    "is_active" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "semesters_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "semesters_academic_year_id_fkey" FOREIGN KEY ("academic_year_id") REFERENCES "academic_years"("id") ON UPDATE CASCADE ON DELETE CASCADE
);
CREATE UNIQUE INDEX "semesters_academic_year_id_name_key" ON "semesters"("academic_year_id", "name");
CREATE INDEX "semesters_academic_year_id_idx" ON "semesters"("academic_year_id");
