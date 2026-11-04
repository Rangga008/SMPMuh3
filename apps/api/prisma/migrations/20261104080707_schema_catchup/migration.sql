-- CreateEnum
CREATE TYPE "ExpenseStatus" AS ENUM ('POSTED', 'VOID');

-- CreateEnum
CREATE TYPE "EmpAttendanceStatus" AS ENUM ('HADIR', 'TELAT', 'IZIN', 'SAKIT', 'ALPHA');

-- CreateEnum
CREATE TYPE "HonorPeriod" AS ENUM ('MONTHLY', 'PER_SESSION', 'ONE_TIME');

-- CreateEnum
CREATE TYPE "LoanSource" AS ENUM ('KASBON', 'KOOPERASI', 'EKSTERNAL');

-- CreateEnum
CREATE TYPE "LoanStatus" AS ENUM ('ACTIVE', 'PAID_OFF', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PayrollStatus" AS ENUM ('DRAFT', 'FINALIZED', 'PAID', 'VOID');

-- CreateEnum
CREATE TYPE "PayrollLineKind" AS ENUM ('BASE', 'TRANSPORT', 'HONOR', 'DEDUCTION', 'LOAN', 'PENSION', 'BOS_HONOR');

-- AlterEnum
ALTER TYPE "InvoiceStatus" ADD VALUE 'PARTIAL';

-- AlterTable
ALTER TABLE "employees" ADD COLUMN     "hourly_rate" INTEGER,
ADD COLUMN     "is_certified" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "pay_scale_id" UUID,
ADD COLUMN     "transport_rate" INTEGER,
ADD COLUMN     "weekly_required_minutes" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "work_start_date" DATE;

-- AlterTable
ALTER TABLE "finance_categories" ADD COLUMN     "is_active" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "standard_group" TEXT;

-- AlterTable
ALTER TABLE "finance_transactions" ADD COLUMN     "expense_allocation_id" UUID,
ADD COLUMN     "payment_allocation_id" UUID,
ADD COLUMN     "payroll_item_id" UUID;

-- AlterTable
ALTER TABLE "invoices" ADD COLUMN     "academic_year_id" UUID,
ADD COLUMN     "batch_id" UUID,
ADD COLUMN     "class_id" UUID,
ADD COLUMN     "payer_label" TEXT,
ADD COLUMN     "semester_id" UUID,
ADD COLUMN     "student_id" UUID,
ALTER COLUMN "registration_id" DROP NOT NULL;

-- AlterTable
ALTER TABLE "letters" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "school_exam_records" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "student_mutations" ALTER COLUMN "id" DROP DEFAULT;

-- CreateTable
CREATE TABLE "invoice_items" (
    "id" UUID NOT NULL,
    "invoice_id" UUID NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'other',
    "label" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invoice_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_allocations" (
    "id" UUID NOT NULL,
    "payment_id" UUID NOT NULL,
    "invoice_id" UUID NOT NULL,
    "item_id" UUID,
    "amount" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "billing_batches" (
    "id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "item_label" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "academic_year_id" UUID,
    "semester_id" UUID,
    "class_id" UUID,
    "grade_level" INTEGER,
    "due_at" TIMESTAMP(3),
    "generated_count" INTEGER NOT NULL,
    "skipped_count" INTEGER NOT NULL DEFAULT 0,
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "billing_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "savings_entries" (
    "id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "direction" "CashDirection" NOT NULL,
    "amount" INTEGER NOT NULL,
    "note" TEXT,
    "cash_account_id" UUID,
    "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recorded_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "savings_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expenses" (
    "id" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "occurred_at" TIMESTAMP(3) NOT NULL,
    "vendor" TEXT,
    "description" TEXT NOT NULL,
    "category_id" UUID NOT NULL,
    "academic_year_id" UUID,
    "total_amount" INTEGER NOT NULL,
    "note" TEXT,
    "document_id" UUID,
    "status" "ExpenseStatus" NOT NULL DEFAULT 'POSTED',
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "expenses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expense_allocations" (
    "id" UUID NOT NULL,
    "expense_id" UUID NOT NULL,
    "cash_account_id" UUID NOT NULL,
    "amount" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "expense_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pay_scales" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "min_years" INTEGER NOT NULL,
    "max_years" INTEGER,
    "hourly_rate" INTEGER NOT NULL,
    "transport_rate" INTEGER NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pay_scales_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_attendances" (
    "id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "status" "EmpAttendanceStatus" NOT NULL,
    "teaching_minutes" INTEGER NOT NULL DEFAULT 0,
    "note" TEXT,
    "recorded_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employee_attendances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "honor_types" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "period" "HonorPeriod" NOT NULL,
    "default_amount" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "honor_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_honors" (
    "id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "honor_type_id" UUID NOT NULL,
    "amount" INTEGER,
    "sessions" INTEGER NOT NULL DEFAULT 1,
    "event_name" TEXT,
    "event_month" TEXT,
    "valid_from" TEXT,
    "valid_to" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "employee_honors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deduction_types" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "default_amount" INTEGER NOT NULL DEFAULT 0,
    "is_recurring" BOOLEAN NOT NULL DEFAULT true,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "deduction_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_deductions" (
    "id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "deduction_type_id" UUID NOT NULL,
    "amount" INTEGER,
    "month" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "employee_deductions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "loans" (
    "id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "source" "LoanSource" NOT NULL,
    "principal" INTEGER NOT NULL,
    "fee" INTEGER NOT NULL DEFAULT 0,
    "installments" INTEGER NOT NULL,
    "monthly_amount" INTEGER NOT NULL,
    "remaining" INTEGER NOT NULL,
    "start_month" TEXT NOT NULL,
    "status" "LoanStatus" NOT NULL DEFAULT 'ACTIVE',
    "note" TEXT,
    "cash_account_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "loans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pension_entries" (
    "id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "month" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "payroll_item_id" UUID,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pension_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_runs" (
    "id" UUID NOT NULL,
    "month" TEXT NOT NULL,
    "academic_year_id" UUID,
    "weeks" INTEGER NOT NULL DEFAULT 4,
    "status" "PayrollStatus" NOT NULL DEFAULT 'DRAFT',
    "note" TEXT,
    "cash_account_id" UUID,
    "finalized_by" UUID,
    "finalized_at" TIMESTAMP(3),
    "paid_at" TIMESTAMP(3),
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payroll_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_items" (
    "id" UUID NOT NULL,
    "run_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "worked_minutes" INTEGER NOT NULL DEFAULT 0,
    "required_minutes" INTEGER NOT NULL DEFAULT 0,
    "base_pay" INTEGER NOT NULL DEFAULT 0,
    "transport_pay" INTEGER NOT NULL DEFAULT 0,
    "gross_amount" INTEGER NOT NULL DEFAULT 0,
    "deduction_amount" INTEGER NOT NULL DEFAULT 0,
    "net_amount" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payroll_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_item_lines" (
    "id" UUID NOT NULL,
    "item_id" UUID NOT NULL,
    "kind" "PayrollLineKind" NOT NULL,
    "label" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "ref_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payroll_item_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bos_honors" (
    "id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "month" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "certified" BOOLEAN NOT NULL DEFAULT true,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bos_honors_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "invoice_items_invoice_id_idx" ON "invoice_items"("invoice_id");

-- CreateIndex
CREATE INDEX "payment_allocations_invoice_id_idx" ON "payment_allocations"("invoice_id");

-- CreateIndex
CREATE INDEX "payment_allocations_payment_id_idx" ON "payment_allocations"("payment_id");

-- CreateIndex
CREATE INDEX "billing_batches_academic_year_id_kind_idx" ON "billing_batches"("academic_year_id", "kind");

-- CreateIndex
CREATE INDEX "savings_entries_student_id_occurred_at_idx" ON "savings_entries"("student_id", "occurred_at");

-- CreateIndex
CREATE UNIQUE INDEX "expenses_number_key" ON "expenses"("number");

-- CreateIndex
CREATE INDEX "expenses_occurred_at_idx" ON "expenses"("occurred_at");

-- CreateIndex
CREATE INDEX "expenses_category_id_idx" ON "expenses"("category_id");

-- CreateIndex
CREATE INDEX "expense_allocations_expense_id_idx" ON "expense_allocations"("expense_id");

-- CreateIndex
CREATE INDEX "expense_allocations_cash_account_id_idx" ON "expense_allocations"("cash_account_id");

-- CreateIndex
CREATE INDEX "employee_attendances_date_idx" ON "employee_attendances"("date");

-- CreateIndex
CREATE UNIQUE INDEX "employee_attendances_employee_id_date_key" ON "employee_attendances"("employee_id", "date");

-- CreateIndex
CREATE UNIQUE INDEX "honor_types_key_key" ON "honor_types"("key");

-- CreateIndex
CREATE INDEX "employee_honors_employee_id_is_active_idx" ON "employee_honors"("employee_id", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "deduction_types_key_key" ON "deduction_types"("key");

-- CreateIndex
CREATE INDEX "employee_deductions_employee_id_is_active_idx" ON "employee_deductions"("employee_id", "is_active");

-- CreateIndex
CREATE INDEX "loans_employee_id_status_idx" ON "loans"("employee_id", "status");

-- CreateIndex
CREATE INDEX "pension_entries_employee_id_month_idx" ON "pension_entries"("employee_id", "month");

-- CreateIndex
CREATE UNIQUE INDEX "payroll_runs_month_key" ON "payroll_runs"("month");

-- CreateIndex
CREATE INDEX "payroll_items_employee_id_idx" ON "payroll_items"("employee_id");

-- CreateIndex
CREATE UNIQUE INDEX "payroll_items_run_id_employee_id_key" ON "payroll_items"("run_id", "employee_id");

-- CreateIndex
CREATE INDEX "payroll_item_lines_item_id_idx" ON "payroll_item_lines"("item_id");

-- CreateIndex
CREATE UNIQUE INDEX "bos_honors_employee_id_month_key" ON "bos_honors"("employee_id", "month");

-- CreateIndex
CREATE UNIQUE INDEX "finance_transactions_payment_allocation_id_key" ON "finance_transactions"("payment_allocation_id");

-- CreateIndex
CREATE UNIQUE INDEX "finance_transactions_expense_allocation_id_key" ON "finance_transactions"("expense_allocation_id");

-- CreateIndex
CREATE UNIQUE INDEX "finance_transactions_payroll_item_id_key" ON "finance_transactions"("payroll_item_id");

-- CreateIndex
CREATE INDEX "invoices_student_id_status_idx" ON "invoices"("student_id", "status");

-- CreateIndex
CREATE INDEX "invoices_academic_year_id_kind_idx" ON "invoices"("academic_year_id", "kind");

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "billing_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_academic_year_id_fkey" FOREIGN KEY ("academic_year_id") REFERENCES "academic_years"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_semester_id_fkey" FOREIGN KEY ("semester_id") REFERENCES "semesters"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "classes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "invoice_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "savings_entries" ADD CONSTRAINT "savings_entries_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "savings_entries" ADD CONSTRAINT "savings_entries_cash_account_id_fkey" FOREIGN KEY ("cash_account_id") REFERENCES "cash_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "savings_entries" ADD CONSTRAINT "savings_entries_recorded_by_id_fkey" FOREIGN KEY ("recorded_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance_transactions" ADD CONSTRAINT "finance_transactions_payment_allocation_id_fkey" FOREIGN KEY ("payment_allocation_id") REFERENCES "payment_allocations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance_transactions" ADD CONSTRAINT "finance_transactions_expense_allocation_id_fkey" FOREIGN KEY ("expense_allocation_id") REFERENCES "expense_allocations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance_transactions" ADD CONSTRAINT "finance_transactions_payroll_item_id_fkey" FOREIGN KEY ("payroll_item_id") REFERENCES "payroll_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "finance_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_academic_year_id_fkey" FOREIGN KEY ("academic_year_id") REFERENCES "academic_years"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expense_allocations" ADD CONSTRAINT "expense_allocations_expense_id_fkey" FOREIGN KEY ("expense_id") REFERENCES "expenses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expense_allocations" ADD CONSTRAINT "expense_allocations_cash_account_id_fkey" FOREIGN KEY ("cash_account_id") REFERENCES "cash_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_attendances" ADD CONSTRAINT "employee_attendances_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_honors" ADD CONSTRAINT "employee_honors_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_honors" ADD CONSTRAINT "employee_honors_honor_type_id_fkey" FOREIGN KEY ("honor_type_id") REFERENCES "honor_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_deductions" ADD CONSTRAINT "employee_deductions_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_deductions" ADD CONSTRAINT "employee_deductions_deduction_type_id_fkey" FOREIGN KEY ("deduction_type_id") REFERENCES "deduction_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loans" ADD CONSTRAINT "loans_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loans" ADD CONSTRAINT "loans_cash_account_id_fkey" FOREIGN KEY ("cash_account_id") REFERENCES "cash_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pension_entries" ADD CONSTRAINT "pension_entries_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_runs" ADD CONSTRAINT "payroll_runs_academic_year_id_fkey" FOREIGN KEY ("academic_year_id") REFERENCES "academic_years"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_runs" ADD CONSTRAINT "payroll_runs_cash_account_id_fkey" FOREIGN KEY ("cash_account_id") REFERENCES "cash_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_items" ADD CONSTRAINT "payroll_items_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "payroll_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_items" ADD CONSTRAINT "payroll_items_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_item_lines" ADD CONSTRAINT "payroll_item_lines_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "payroll_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bos_honors" ADD CONSTRAINT "bos_honors_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_pay_scale_id_fkey" FOREIGN KEY ("pay_scale_id") REFERENCES "pay_scales"("id") ON DELETE SET NULL ON UPDATE CASCADE;

