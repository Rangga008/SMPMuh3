import { Transform } from 'class-transformer';
import {
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
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
