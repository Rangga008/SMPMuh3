-- Ekstrakurikuler (kesiswaan) — data ekskul + anggota siswa.
CREATE TABLE IF NOT EXISTS "extracurriculars" (
  "id"          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "name"        TEXT NOT NULL,
  "description" TEXT,
  "coach_id"    UUID REFERENCES "employees"("id") ON DELETE SET NULL,
  "schedule"    TEXT,
  "is_active"   BOOLEAN NOT NULL DEFAULT TRUE,
  "created_at"  TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at"  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "extracurricular_members" (
  "id"                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "extracurricular_id"  UUID NOT NULL REFERENCES "extracurriculars"("id") ON DELETE CASCADE,
  "student_id"          UUID NOT NULL REFERENCES "students"("id") ON DELETE CASCADE,
  "role"                TEXT,
  "joined_at"           TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "extracurricular_members_extracurricular_id_student_id_key"
    UNIQUE ("extracurricular_id", "student_id")
);

CREATE INDEX IF NOT EXISTS "idx_ekskul_members_student"
  ON "extracurricular_members" ("student_id");
