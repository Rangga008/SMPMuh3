import { Transform, Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

const emptyToUndefined = () =>
  Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' && value.trim() === '' ? undefined : value,
  );

export class CreateFinanceTransactionDto {
  @IsIn(['INCOME', 'EXPENSE'])
  type!: 'INCOME' | 'EXPENSE';

  @IsUUID()
  categoryId!: string;

  @IsInt()
  @Min(1)
  amount!: number;

  @emptyToUndefined()
  @IsOptional()
  @IsDateString()
  occurredAt?: string;

  @emptyToUndefined()
  @IsOptional()
  @IsString()
  @MaxLength(300)
  description?: string;

  @emptyToUndefined()
  @IsOptional()
  @IsUUID()
  academicYearId?: string;

  /** Kas penerima/sumber dana — kosong = tanpa gerakan kas (pencatatan saja). */
  @emptyToUndefined()
  @IsOptional()
  @IsUUID()
  cashAccountId?: string;
}

export class UpdateFinanceTransactionDto {
  @emptyToUndefined()
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @emptyToUndefined()
  @IsOptional()
  @IsInt()
  @Min(1)
  amount?: number;

  @emptyToUndefined()
  @IsOptional()
  @IsDateString()
  occurredAt?: string;

  @emptyToUndefined()
  @IsOptional()
  @IsString()
  @MaxLength(300)
  description?: string;

  /** Ubah/lepas kas — kirim null untuk melepas. */
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' && value.trim() === '' ? null : value,
  )
  @IsUUID()
  cashAccountId?: string | null;
}

export class CreateFinanceCategoryDto {
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name!: string;

  @IsIn(['INCOME', 'EXPENSE'])
  type!: 'INCOME' | 'EXPENSE';

  @emptyToUndefined()
  @IsOptional()
  @IsString()
  @MaxLength(60)
  key?: string;

  @emptyToUndefined()
  @IsOptional()
  @IsIn([
    'ISI',
    'PROSES',
    'KELULUSAN',
    'TENAGA',
    'SARANA',
    'PENGELOLAAN',
    'PEMBIAYAAN',
    'PENILAIAN',
  ])
  standardGroup?: string;
}

export class UpsertFinanceBudgetDto {
  @IsUUID()
  academicYearId!: string;

  @IsUUID()
  categoryId!: string;

  @IsInt()
  @Min(0)
  amount!: number;

  @emptyToUndefined()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  note?: string;
}

// ---------- Kas & buku bank ----------

export class CreateCashAccountDto {
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name!: string;

  @emptyToUndefined()
  @IsOptional()
  @IsString()
  @MaxLength(40)
  key?: string;

  @emptyToUndefined()
  @IsOptional()
  @IsIn(['CASH', 'BANK'])
  type?: 'CASH' | 'BANK';

  @emptyToUndefined()
  @IsOptional()
  @IsInt()
  @Min(0)
  openingBalance?: number;
}

export class UpdateCashAccountDto {
  @emptyToUndefined()
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name?: string;

  @emptyToUndefined()
  @IsOptional()
  @IsInt()
  @Min(0)
  openingBalance?: number;

  @emptyToUndefined()
  @IsOptional()
  @IsIn(['CASH', 'BANK'])
  type?: 'CASH' | 'BANK';

  @emptyToUndefined()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class CreateBankIncomeDto {
  @IsUUID()
  cashAccountId!: string;

  @IsUUID()
  categoryId!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(120)
  senderName!: string;

  @emptyToUndefined()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  purpose?: string;

  @IsInt()
  @Min(1)
  amount!: number;

  @emptyToUndefined()
  @IsOptional()
  @IsDateString()
  receivedAt?: string;
}

// ---------- Tagihan siswa (billing) ----------

export class InvoiceItemInput {
  @IsString()
  @MinLength(1)
  @MaxLength(40)
  kind!: string; // spp | dsp | seragam | kat | daftar_ulang | other

  @IsString()
  @MinLength(1)
  @MaxLength(160)
  label!: string;

  @IsInt()
  @Min(1)
  amount!: number;
}

export class CreateInvoiceDto {
  @IsUUID()
  studentId!: string;

  @emptyToUndefined()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  payerLabel?: string;

  @IsString()
  @MinLength(2)
  @MaxLength(160)
  title!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(40)
  kind!: string;

  @emptyToUndefined()
  @IsOptional()
  @IsUUID()
  academicYearId?: string;

  @emptyToUndefined()
  @IsOptional()
  @IsUUID()
  semesterId?: string;

  @emptyToUndefined()
  @IsOptional()
  @IsDateString()
  dueAt?: string;

  @emptyToUndefined()
  @IsOptional()
  @IsString()
  @MaxLength(300)
  note?: string;

  /** Kirim pengingat WA ke ortu setelah tagihan dibuat (default: ya). */
  @emptyToUndefined()
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  notifyParent?: boolean;

  @ValidateNested({ each: true })
  @Type(() => InvoiceItemInput)
  @IsArray()
  @ArrayMinSize(1)
  items!: InvoiceItemInput[];
}

export class UpdateInvoiceDto {
  @emptyToUndefined()
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  title?: string;

  @emptyToUndefined()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  payerLabel?: string;

  @emptyToUndefined()
  @IsOptional()
  @IsDateString()
  dueAt?: string;

  @emptyToUndefined()
  @IsOptional()
  @IsString()
  @MaxLength(300)
  note?: string;

  @emptyToUndefined()
  @IsOptional()
  @IsIn(['CANCELLED'])
  status?: 'CANCELLED';
}

export class GenerateBillingDto {
  @IsUUID()
  academicYearId!: string; // TA tagihan

  @emptyToUndefined()
  @IsOptional()
  @IsUUID()
  sourceAcademicYearId?: string; // TA acuan rombel (default = academicYearId)

  @emptyToUndefined()
  @IsOptional()
  @IsUUID()
  semesterId?: string;

  @emptyToUndefined()
  @IsOptional()
  @IsUUID()
  classId?: string;

  @emptyToUndefined()
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(3)
  gradeLevel?: number;

  @IsString()
  @MinLength(1)
  @MaxLength(40)
  kind!: string; // spp | daftar_ulang | kat | seragam | other

  @IsString()
  @MinLength(2)
  @MaxLength(160)
  title!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(160)
  itemLabel!: string;

  @IsInt()
  @Min(1)
  amount!: number; // nominal per siswa

  @emptyToUndefined()
  @IsOptional()
  @IsDateString()
  dueAt?: string;

  /** Kirim pengingat WA ke ortu tiap siswa (default: ya). */
  @emptyToUndefined()
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  notifyParents?: boolean;
}

export class PaymentAllocationInput {
  @IsUUID()
  invoiceId!: string;

  @emptyToUndefined()
  @IsOptional()
  @IsUUID()
  itemId?: string;

  @IsInt()
  @Min(1)
  amount!: number;
}

export class RecordBillingPaymentDto {
  @IsUUID()
  invoiceId!: string; // invoice utama (untuk tautan balik + nomor)

  @emptyToUndefined()
  @IsOptional()
  @IsUUID()
  cashAccountId?: string;

  @emptyToUndefined()
  @IsOptional()
  @IsString()
  @MaxLength(30)
  method?: string; // cash | transfer

  @emptyToUndefined()
  @IsOptional()
  @IsDateString()
  paidAt?: string;

  @emptyToUndefined()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  note?: string;

  @ValidateNested({ each: true })
  @Type(() => PaymentAllocationInput)
  @IsArray()
  @ArrayMinSize(1)
  allocations!: PaymentAllocationInput[];
}

export class CreateSavingsDto {
  @IsUUID()
  studentId!: string;

  @IsIn(['IN', 'OUT'])
  direction!: 'IN' | 'OUT';

  @IsInt()
  @Min(1)
  amount!: number;

  @emptyToUndefined()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  note?: string;

  @emptyToUndefined()
  @IsOptional()
  @IsUUID()
  cashAccountId?: string;

  @emptyToUndefined()
  @IsOptional()
  @IsDateString()
  occurredAt?: string;
}

// ---------- Pengeluaran ----------

export const STANDARDS = [
  'ISI',
  'PROSES',
  'KELULUSAN',
  'TENAGA',
  'SARANA',
  'PENGELOLAAN',
  'PEMBIAYAAN',
  'PENILAIAN',
] as const;

export class UpdateFinanceCategoryDto {
  @emptyToUndefined()
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name?: string;

  @emptyToUndefined()
  @IsOptional()
  @IsIn(STANDARDS as unknown as string[])
  standardGroup?: string;

  @emptyToUndefined()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class ExpenseAllocationInput {
  @IsUUID()
  cashAccountId!: string;

  @IsInt()
  @Min(1)
  amount!: number;
}

export class CreateExpenseDto {
  @IsUUID()
  categoryId!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(300)
  description!: string;

  @emptyToUndefined()
  @IsOptional()
  @IsString()
  @MaxLength(160)
  vendor?: string;

  @emptyToUndefined()
  @IsOptional()
  @IsDateString()
  occurredAt?: string;

  @emptyToUndefined()
  @IsOptional()
  @IsUUID()
  academicYearId?: string;

  @emptyToUndefined()
  @IsOptional()
  @IsString()
  @MaxLength(300)
  note?: string;

  @emptyToUndefined()
  @IsOptional()
  @IsUUID()
  documentId?: string;

  @ValidateNested({ each: true })
  @Type(() => ExpenseAllocationInput)
  @IsArray()
  @ArrayMinSize(1)
  allocations!: ExpenseAllocationInput[];
}

export class UpdateExpenseDto {
  @emptyToUndefined()
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @emptyToUndefined()
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(300)
  description?: string;

  @emptyToUndefined()
  @IsOptional()
  @IsString()
  @MaxLength(160)
  vendor?: string;

  @emptyToUndefined()
  @IsOptional()
  @IsDateString()
  occurredAt?: string;

  @emptyToUndefined()
  @IsOptional()
  @IsUUID()
  academicYearId?: string;

  @emptyToUndefined()
  @IsOptional()
  @IsString()
  @MaxLength(300)
  note?: string;

  @emptyToUndefined()
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ExpenseAllocationInput)
  @ArrayMinSize(1)
  allocations?: ExpenseAllocationInput[];
}
