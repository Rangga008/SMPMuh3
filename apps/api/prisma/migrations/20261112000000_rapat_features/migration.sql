-- Buku induk fields on students
ALTER TABLE "students" ADD COLUMN IF NOT EXISTS "previous_school" TEXT;
ALTER TABLE "students" ADD COLUMN IF NOT EXISTS "health_notes" TEXT;
ALTER TABLE "students" ADD COLUMN IF NOT EXISTS "father_name" TEXT;
ALTER TABLE "students" ADD COLUMN IF NOT EXISTS "mother_name" TEXT;
ALTER TABLE "students" ADD COLUMN IF NOT EXISTS "parent_occupation" TEXT;
ALTER TABLE "students" ADD COLUMN IF NOT EXISTS "parent_phone" TEXT;
ALTER TABLE "students" ADD COLUMN IF NOT EXISTS "intelligence_notes" TEXT;
ALTER TABLE "students" ADD COLUMN IF NOT EXISTS "leaving_notes" TEXT;
ALTER TABLE "students" ADD COLUMN IF NOT EXISTS "other_notes" TEXT;

-- Surat mutasi upload
ALTER TABLE "student_mutations" ADD COLUMN IF NOT EXISTS "storage_key" TEXT;
ALTER TABLE "student_mutations" ADD COLUMN IF NOT EXISTS "file_name" TEXT;
ALTER TABLE "student_mutations" ADD COLUMN IF NOT EXISTS "mime_type" TEXT;

-- Enums
DO $$ BEGIN CREATE TYPE "QuestionType" AS ENUM ('MCQ','MCQ_COMPLEX','TRUE_FALSE','MATCHING'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "SubmissionStatus" AS ENUM ('PENDING','APPROVED','REJECTED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ScheduleBlock
CREATE TABLE IF NOT EXISTS "schedule_blocks" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "label" TEXT NOT NULL,
  "day_of_week" INTEGER,
  "date" DATE,
  "start_minute" INTEGER NOT NULL,
  "end_minute" INTEGER NOT NULL,
  "academic_year_id" UUID NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "schedule_blocks_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "schedule_blocks_academic_year_id_fkey" FOREIGN KEY ("academic_year_id") REFERENCES "academic_years"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "schedule_blocks_academic_year_id_day_of_week_idx" ON "schedule_blocks"("academic_year_id", "day_of_week");

-- AssessmentQuestion
CREATE TABLE IF NOT EXISTS "assessment_questions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "assessment_id" UUID NOT NULL,
  "number" INTEGER NOT NULL,
  "type" "QuestionType" NOT NULL DEFAULT 'MCQ',
  "weight" INTEGER NOT NULL DEFAULT 1,
  "key" JSONB,
  "prompt" TEXT,
  CONSTRAINT "assessment_questions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "assessment_questions_assessment_id_fkey" FOREIGN KEY ("assessment_id") REFERENCES "assessments"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "assessment_questions_assessment_id_number_key" UNIQUE ("assessment_id", "number")
);

-- StudentAnswer
CREATE TABLE IF NOT EXISTS "student_answers" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "question_id" UUID NOT NULL,
  "student_id" UUID NOT NULL,
  "answer" JSONB,
  "score" INTEGER NOT NULL DEFAULT 0,
  "is_correct" BOOLEAN,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "student_answers_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "student_answers_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "assessment_questions"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "student_answers_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "student_answers_question_id_student_id_key" UNIQUE ("question_id", "student_id")
);
CREATE INDEX IF NOT EXISTS "student_answers_student_id_idx" ON "student_answers"("student_id");

-- StaffDocument
CREATE TABLE IF NOT EXISTS "staff_documents" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "employee_id" UUID NOT NULL,
  "category" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "storage_key" TEXT NOT NULL,
  "file_name" TEXT NOT NULL,
  "mime_type" TEXT NOT NULL,
  "size_bytes" INTEGER NOT NULL,
  "uploaded_by" UUID,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "staff_documents_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "staff_documents_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "staff_documents_employee_id_category_idx" ON "staff_documents"("employee_id", "category");

-- DocCollection + items
CREATE TABLE IF NOT EXISTS "doc_collections" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "title" TEXT NOT NULL,
  "category" TEXT NOT NULL DEFAULT 'KISI_KISI',
  "description" TEXT,
  "deadline_at" TIMESTAMP(3),
  "academic_year_id" UUID,
  "created_by" UUID NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "notified_at" TIMESTAMP(3),
  CONSTRAINT "doc_collections_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "doc_collection_items" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "collection_id" UUID NOT NULL,
  "employee_id" UUID NOT NULL,
  "submitted_at" TIMESTAMP(3),
  "file_name" TEXT,
  "storage_key" TEXT,
  "mime_type" TEXT,
  "size_bytes" INTEGER,
  "note" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "doc_collection_items_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "doc_collection_items_collection_id_fkey" FOREIGN KEY ("collection_id") REFERENCES "doc_collections"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "doc_collection_items_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "doc_collection_items_collection_id_employee_id_key" UNIQUE ("collection_id", "employee_id")
);

-- ProgramSubmission
CREATE TABLE IF NOT EXISTS "program_submissions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "department" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "rab" JSONB,
  "amount_total" INTEGER NOT NULL DEFAULT 0,
  "storage_key" TEXT,
  "file_name" TEXT,
  "status" "SubmissionStatus" NOT NULL DEFAULT 'PENDING',
  "submitted_by" UUID NOT NULL,
  "reviewed_by" UUID,
  "reviewed_at" TIMESTAMP(3),
  "review_note" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "program_submissions_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "program_submissions_department_status_idx" ON "program_submissions"("department", "status");

-- Archive
CREATE TABLE IF NOT EXISTS "archive_categories" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "name" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "archive_categories_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "archive_categories_name_key" UNIQUE ("name")
);

CREATE TABLE IF NOT EXISTS "archive_items" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "category_id" UUID,
  "title" TEXT NOT NULL,
  "ref_number" TEXT,
  "date" DATE,
  "storage_key" TEXT NOT NULL,
  "file_name" TEXT NOT NULL,
  "mime_type" TEXT NOT NULL,
  "size_bytes" INTEGER NOT NULL,
  "uploaded_by" UUID,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "archive_items_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "archive_items_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "archive_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "archive_items_category_id_date_idx" ON "archive_items"("category_id", "date");

-- PolicyDocument
CREATE TABLE IF NOT EXISTS "policy_documents" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "kind" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "storage_key" TEXT NOT NULL,
  "file_name" TEXT NOT NULL,
  "mime_type" TEXT NOT NULL,
  "size_bytes" INTEGER NOT NULL,
  "uploaded_by" UUID,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "policy_documents_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "policy_documents_kind_idx" ON "policy_documents"("kind");

-- UniformSchedule
CREATE TABLE IF NOT EXISTS "uniform_schedules" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "day" INTEGER NOT NULL,
  "name" TEXT NOT NULL,
  "note" TEXT,
  CONSTRAINT "uniform_schedules_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "uniform_schedules_day_key" UNIQUE ("day")
);

-- ExamRoom + ExamSeat
CREATE TABLE IF NOT EXISTS "exam_rooms" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "name" TEXT NOT NULL,
  "period" TEXT NOT NULL,
  "academic_year_id" UUID NOT NULL,
  "capacity" INTEGER NOT NULL DEFAULT 24,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "exam_rooms_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "exam_rooms_academic_year_id_fkey" FOREIGN KEY ("academic_year_id") REFERENCES "academic_years"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "exam_rooms_name_period_academic_year_id_key" UNIQUE ("name", "period", "academic_year_id")
);

CREATE TABLE IF NOT EXISTS "exam_seats" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "room_id" UUID NOT NULL,
  "student_id" UUID NOT NULL,
  "class_id" UUID,
  "seat_no" INTEGER,
  CONSTRAINT "exam_seats_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "exam_seats_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "exam_rooms"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "exam_seats_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "exam_seats_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "classes"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "exam_seats_room_id_student_id_key" UNIQUE ("room_id", "student_id")
);
CREATE INDEX IF NOT EXISTS "exam_seats_class_id_idx" ON "exam_seats"("class_id");
