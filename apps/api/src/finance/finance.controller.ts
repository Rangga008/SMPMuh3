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
  CreateBankIncomeDto,
  CreateCashAccountDto,
  CreateExpenseDto,
  CreateFinanceCategoryDto,
  CreateFinanceTransactionDto,
  CreateInvoiceDto,
  CreateSavingsDto,
  GenerateBillingDto,
  RecordBillingPaymentDto,
  UpdateCashAccountDto,
  UpdateExpenseDto,
  UpdateFinanceCategoryDto,
  UpdateFinanceTransactionDto,
  UpdateInvoiceDto,
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

  @Get('reports')
  @RequirePermission(PERMISSIONS.FINANCE_READ)
  reports(
    @Query('academicYearId') academicYearId?: string,
    @Query('semesterId') semesterId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('cashAccountId') cashAccountId?: string,
  ) {
    return this.finance.reports({
      academicYearId: academicYearId || undefined,
      semesterId: semesterId || undefined,
      from: from ? new Date(from) : undefined,
      to: to ? new Date(`${to}T23:59:59`) : undefined,
      cashAccountId: cashAccountId || undefined,
    });
  }

  @Get('transactions')
  @RequirePermission(PERMISSIONS.FINANCE_READ)
  transactions(
    @Query('type') type?: 'INCOME' | 'EXPENSE',
    @Query('categoryId') categoryId?: string,
    @Query('cashAccountId') cashAccountId?: string,
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
      cashAccountId: cashAccountId || undefined,
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

  // ---------- Kas & buku bank ----------

  @Get('accounts')
  @RequirePermission(PERMISSIONS.FINANCE_READ)
  accounts() {
    return this.finance.listAccounts();
  }

  @Post('accounts')
  @RequirePermission(PERMISSIONS.FINANCE_MANAGE)
  createAccount(
    @Body() dto: CreateCashAccountDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.finance.createAccount(dto, user.id);
  }

  @Patch('accounts/:id')
  @RequirePermission(PERMISSIONS.FINANCE_MANAGE)
  updateAccount(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCashAccountDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.finance.updateAccount(id, dto, user.id);
  }

  /** Buku kas satu akun — saldo awal + baris gerakan + saldo berjalan. */
  @Get('accounts/:id/ledger')
  @RequirePermission(PERMISSIONS.FINANCE_READ)
  ledger(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.finance.accountLedger(
      id,
      from ? new Date(from) : undefined,
      to ? new Date(`${to}T23:59:59`) : undefined,
    );
  }

  @Get('bank-income')
  @RequirePermission(PERMISSIONS.FINANCE_READ)
  bankIncome(
    @Query('cashAccountId') cashAccountId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.finance.listBankIncome(
      cashAccountId || undefined,
      from ? new Date(from) : undefined,
      to ? new Date(`${to}T23:59:59`) : undefined,
    );
  }

  @Post('bank-income')
  @RequirePermission(PERMISSIONS.FINANCE_MANAGE)
  createBankIncome(
    @Body() dto: CreateBankIncomeDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.finance.createBankIncome(dto, user.id);
  }

  // ---------- Pengeluaran ----------

  @Patch('categories/:id')
  @RequirePermission(PERMISSIONS.FINANCE_MANAGE)
  updateCategory(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateFinanceCategoryDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.finance.updateCategory(id, dto, user.id);
  }

  /** Rekap penggunaan dana: sumber kas × kategori/standar. */
  @Get('expenses/fund-usage')
  @RequirePermission(PERMISSIONS.FINANCE_READ)
  fundUsage(
    @Query('academicYearId') academicYearId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.finance.fundUsage({
      academicYearId: academicYearId || undefined,
      from: from ? new Date(from) : undefined,
      to: to ? new Date(`${to}T23:59:59`) : undefined,
    });
  }

  @Get('expenses')
  @RequirePermission(PERMISSIONS.FINANCE_READ)
  expenses(
    @Query('categoryId') categoryId?: string,
    @Query('standardGroup') standardGroup?: string,
    @Query('cashAccountId') cashAccountId?: string,
    @Query('academicYearId') academicYearId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('search') search?: string,
    @Query('take') take?: string,
    @Query('skip') skip?: string,
  ) {
    return this.finance.listExpenses({
      categoryId: categoryId || undefined,
      standardGroup: standardGroup || undefined,
      cashAccountId: cashAccountId || undefined,
      academicYearId: academicYearId || undefined,
      from: from ? new Date(from) : undefined,
      to: to ? new Date(`${to}T23:59:59`) : undefined,
      search: search || undefined,
      take: take ? Number(take) : undefined,
      skip: skip ? Number(skip) : undefined,
    });
  }

  @Get('expenses/:id')
  @RequirePermission(PERMISSIONS.FINANCE_READ)
  expense(@Param('id', ParseUUIDPipe) id: string) {
    return this.finance.getExpense(id);
  }

  @Post('expenses')
  @RequirePermission(PERMISSIONS.FINANCE_MANAGE)
  createExpense(
    @Body() dto: CreateExpenseDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.finance.createExpense(dto, user.id);
  }

  @Patch('expenses/:id')
  @RequirePermission(PERMISSIONS.FINANCE_MANAGE)
  updateExpense(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateExpenseDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.finance.updateExpense(id, dto, user.id);
  }

  /** Batalkan pengeluaran — gerakan kas & transaksi terkait ditarik. */
  @Delete('expenses/:id')
  @RequirePermission(PERMISSIONS.FINANCE_MANAGE)
  voidExpense(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.finance.voidExpense(id, user.id);
  }

  // ---------- Tagihan siswa ----------

  @Get('invoices')
  @RequirePermission(PERMISSIONS.FINANCE_READ)
  invoices(
    @Query('studentId') studentId?: string,
    @Query('classId') classId?: string,
    @Query('gradeLevel') gradeLevel?: string,
    @Query('academicYearId') academicYearId?: string,
    @Query('semesterId') semesterId?: string,
    @Query('kind') kind?: string,
    @Query('status') status?: string,
    @Query('search') search?: string,
    @Query('take') take?: string,
    @Query('skip') skip?: string,
  ) {
    return this.finance.listInvoices({
      studentId: studentId || undefined,
      classId: classId || undefined,
      gradeLevel: gradeLevel ? Number(gradeLevel) : undefined,
      academicYearId: academicYearId || undefined,
      semesterId: semesterId || undefined,
      kind: kind || undefined,
      status: status || undefined,
      search: search || undefined,
      take: take ? Number(take) : undefined,
      skip: skip ? Number(skip) : undefined,
    });
  }

  @Post('invoices')
  @RequirePermission(PERMISSIONS.FINANCE_MANAGE)
  createInvoice(
    @Body() dto: CreateInvoiceDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.finance.createInvoice(dto, user.id);
  }

  @Get('invoices/:id')
  @RequirePermission(PERMISSIONS.FINANCE_READ)
  invoice(@Param('id', ParseUUIDPipe) id: string) {
    return this.finance.getInvoice(id);
  }

  @Patch('invoices/:id')
  @RequirePermission(PERMISSIONS.FINANCE_MANAGE)
  updateInvoice(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateInvoiceDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.finance.updateInvoice(id, dto, user.id);
  }

  @Post('billing/generate')
  @RequirePermission(PERMISSIONS.FINANCE_MANAGE)
  generateBilling(
    @Body() dto: GenerateBillingDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.finance.generateBilling(dto, user.id);
  }

  @Get('billing/batches')
  @RequirePermission(PERMISSIONS.FINANCE_READ)
  billingBatches(@Query('academicYearId') academicYearId?: string) {
    return this.finance.listBatches({ academicYearId: academicYearId || undefined });
  }

  @Delete('billing/batches/:id')
  @RequirePermission(PERMISSIONS.FINANCE_MANAGE)
  voidBatch(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.finance.voidBatch(id, user.id);
  }

  /** Terima pembayaran siswa — bisa split ke beberapa komponen/invoice. */
  @Post('billing/payments')
  @RequirePermission(PERMISSIONS.FINANCE_MANAGE)
  recordBillingPayment(
    @Body() dto: RecordBillingPaymentDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.finance.recordBillingPayment(dto, user.id);
  }

  /** Data kwitansi rinci satu pembayaran. */
  @Get('payments/:id/receipt')
  @RequirePermission(PERMISSIONS.FINANCE_READ)
  billingReceipt(@Param('id', ParseUUIDPipe) id: string) {
    return this.finance.getBillingReceipt(id);
  }

  /** Kartu piutang + tabungan satu siswa. */
  @Get('students/:id/bills')
  @RequirePermission(PERMISSIONS.FINANCE_READ)
  studentBills(@Param('id', ParseUUIDPipe) id: string) {
    return this.finance.studentBills(id);
  }

  /** Kirim pengingat tagihan ke ortu via antrean WhatsApp gateway. */
  @Post('invoices/:id/notify')
  @RequirePermission(PERMISSIONS.FINANCE_MANAGE)
  notifyInvoice(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.finance.notifyInvoice(id, user.id);
  }

  // ---------- Tabungan siswa ----------

  @Get('savings/summary')
  @RequirePermission(PERMISSIONS.FINANCE_READ)
  savingsSummary(
    @Query('search') search?: string,
    @Query('classId') classId?: string,
    @Query('gradeLevel') gradeLevel?: string,
    @Query('take') take?: string,
  ) {
    return this.finance.savingsSummary({
      search: search || undefined,
      classId: classId || undefined,
      gradeLevel: gradeLevel ? Number(gradeLevel) : undefined,
      take: take ? Number(take) : undefined,
    });
  }

  @Get('savings/:studentId')
  @RequirePermission(PERMISSIONS.FINANCE_READ)
  savingsEntries(@Param('studentId', ParseUUIDPipe) studentId: string) {
    return this.finance.listSavingsEntries(studentId);
  }

  @Post('savings')
  @RequirePermission(PERMISSIONS.FINANCE_MANAGE)
  createSavings(
    @Body() dto: CreateSavingsDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.finance.createSavingsEntry(dto, user.id);
  }
}
