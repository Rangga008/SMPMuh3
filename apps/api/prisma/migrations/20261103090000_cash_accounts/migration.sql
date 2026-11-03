CREATE TYPE "CashAccountType" AS ENUM ('CASH', 'BANK');
CREATE TYPE "CashDirection" AS ENUM ('IN', 'OUT');

CREATE TABLE "cash_accounts" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "CashAccountType" NOT NULL DEFAULT 'CASH',
    "opening_balance" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "cash_accounts_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "cash_accounts_key_key" ON "cash_accounts"("key");

CREATE TABLE "cash_movements" (
    "id" UUID NOT NULL,
    "cash_account_id" UUID NOT NULL,
    "direction" "CashDirection" NOT NULL,
    "amount" INTEGER NOT NULL,
    "ref_type" TEXT NOT NULL DEFAULT 'manual',
    "ref_id" UUID,
    "description" TEXT,
    "occurred_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "cash_movements_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "cash_movements_cash_account_id_fkey" FOREIGN KEY ("cash_account_id") REFERENCES "cash_accounts"("id") ON UPDATE CASCADE ON DELETE CASCADE
);
CREATE INDEX "cash_movements_cash_account_id_occurred_at_idx" ON "cash_movements"("cash_account_id", "occurred_at");
CREATE INDEX "cash_movements_ref_type_ref_id_idx" ON "cash_movements"("ref_type", "ref_id");

CREATE TABLE "bank_incomes" (
    "id" UUID NOT NULL,
    "cash_account_id" UUID NOT NULL,
    "category_id" UUID NOT NULL,
    "sender_name" TEXT NOT NULL,
    "purpose" TEXT,
    "amount" INTEGER NOT NULL,
    "received_at" TIMESTAMP(3) NOT NULL,
    "tx_id" UUID,
    "recorded_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "bank_incomes_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "bank_incomes_cash_account_id_fkey" FOREIGN KEY ("cash_account_id") REFERENCES "cash_accounts"("id") ON UPDATE CASCADE ON DELETE CASCADE,
    CONSTRAINT "bank_incomes_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "finance_categories"("id") ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT "bank_incomes_recorded_by_id_fkey" FOREIGN KEY ("recorded_by_id") REFERENCES "users"("id") ON UPDATE CASCADE ON DELETE SET NULL
);
CREATE INDEX "bank_incomes_cash_account_id_received_at_idx" ON "bank_incomes"("cash_account_id", "received_at");

ALTER TABLE "finance_transactions" ADD COLUMN "cash_account_id" UUID;
ALTER TABLE "finance_transactions" ADD CONSTRAINT "finance_transactions_cash_account_id_fkey" FOREIGN KEY ("cash_account_id") REFERENCES "cash_accounts"("id") ON UPDATE CASCADE ON DELETE SET NULL;

ALTER TABLE "payments" ADD COLUMN "cash_account_id" UUID;
ALTER TABLE "payments" ADD CONSTRAINT "payments_cash_account_id_fkey" FOREIGN KEY ("cash_account_id") REFERENCES "cash_accounts"("id") ON UPDATE CASCADE ON DELETE SET NULL;
