ALTER TABLE "payroll_items" ADD COLUMN IF NOT EXISTS "manual_minutes" integer NOT NULL DEFAULT 0;
ALTER TABLE "payroll_items" ADD COLUMN IF NOT EXISTS "manual_note" text;
