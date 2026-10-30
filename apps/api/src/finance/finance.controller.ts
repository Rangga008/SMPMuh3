import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { PERMISSIONS, type AuthUser } from '@smpmuh3/types';
import { CurrentUser } from '../identity/decorators/current-user.decorator';
import { RequirePermission } from '../identity/decorators/require-permission.decorator';
import {
  CreateFinanceCategoryDto,
  CreateFinanceTransactionDto,
  UpdateFinanceTransactionDto,
  UpsertFinanceBudgetDto,
} from './dto/finance.dto';
import { FinanceService } from './finance.service';

@Controller({ path: 'admin/finance', version: '1' })
export class FinanceController {
  constructor(private readonly finance: FinanceService) {}

  @Get('summary')
  @RequirePermission(PERMISSIONS.FINANCE_READ)
  summary(
    @Query('academicYearId') academicYearId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.finance.summary({
      academicYearId: academicYearId || undefined,
      from: from ? new Date(from) : undefined,
      to: to ? new Date(`${to}T23:59:59`) : undefined,
    });
  }

  @Get('transactions')
  @RequirePermission(PERMISSIONS.FINANCE_READ)
  transactions(
    @Query('type') type?: 'INCOME' | 'EXPENSE',
    @Query('categoryId') categoryId?: string,
    @Query('academicYearId') academicYearId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('search') search?: string,
    @Query('take') take?: string,
    @Query('skip') skip?: string,
  ) {
    return this.finance.listTransactions({
      type: type === 'INCOME' || type === 'EXPENSE' ? type : undefined,
      categoryId: categoryId || undefined,
      academicYearId: academicYearId || undefined,
      from: from ? new Date(from) : undefined,
      to: to ? new Date(`${to}T23:59:59`) : undefined,
      search: search || undefined,
      take: take ? Number(take) : undefined,
      skip: skip ? Number(skip) : undefined,
    });
  }

  @Post('transactions')
  @RequirePermission(PERMISSIONS.FINANCE_MANAGE)
  create(
    @Body() dto: CreateFinanceTransactionDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.finance.createTransaction(dto, user.id);
  }

  @Patch('transactions/:id')
  @RequirePermission(PERMISSIONS.FINANCE_MANAGE)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateFinanceTransactionDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.finance.updateTransaction(id, dto, user.id);
  }

  @Delete('transactions/:id')
  @RequirePermission(PERMISSIONS.FINANCE_MANAGE)
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.finance.deleteTransaction(id, user.id);
  }

  @Get('categories')
  @RequirePermission(PERMISSIONS.FINANCE_READ)
  categories() {
    return this.finance.listCategories();
  }

  @Post('categories')
  @RequirePermission(PERMISSIONS.FINANCE_MANAGE)
  createCategory(
    @Body() dto: CreateFinanceCategoryDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.finance.createCategory(dto, user.id);
  }

  @Get('budgets')
  @RequirePermission(PERMISSIONS.FINANCE_READ)
  budgets(@Query('academicYearId', ParseUUIDPipe) academicYearId: string) {
    return this.finance.listBudgets(academicYearId);
  }

  @Put('budgets')
  @RequirePermission(PERMISSIONS.FINANCE_MANAGE)
  upsertBudget(
    @Body() dto: UpsertFinanceBudgetDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.finance.upsertBudget(dto, user.id);
  }
}
