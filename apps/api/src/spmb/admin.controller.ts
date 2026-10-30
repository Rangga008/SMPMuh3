import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseFilePipeBuilder,
  ParseIntPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { PERMISSIONS, type AuthUser } from '@smpmuh3/types';
import type { RegistrationStatus } from '@prisma/client';
import type { Response } from 'express';
import { StreamableFile } from '@nestjs/common';
import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { CurrentUser } from '../identity/decorators/current-user.decorator';
import { RequirePermission } from '../identity/decorators/require-permission.decorator';
import { PaymentsService } from '../payments/payments.service';
import { DocumentsService } from './documents.service';
import { RegistrationsService } from './registrations.service';
import { SpmbSettingsService } from './settings.service';
import { SpmbImportService } from './import.service';
import { UsersService, normalizePhone } from '../identity/users/users.service';
import {
  CreateInvoiceDto,
  DiscountDto,
  InstallmentPlanDto,
  PsikotesDto,
  SaveDiscountDto,
  SaveQuestionDto,
  SaveWaveDto,
  UpdateFeeDto,
  VerifyPaymentDto,
} from './dto/spmb.dto';
import { REGISTRATION_STATUSES } from '@smpmuh3/types';

class TransitionDto {
  @IsIn(REGISTRATION_STATUSES)
  status!: RegistrationStatus;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

class BulkTransitionDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID('4', { each: true })
  ids!: string[];

  @IsIn(REGISTRATION_STATUSES)
  status!: RegistrationStatus;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

class BulkIdsDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID('4', { each: true })
  ids!: string[];
}

class RecordCashDto {
  @IsUUID()
  invoiceId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  note?: string;
}

class UpdateParentDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  email?: string;

  @IsOptional()
  @IsIn(['ACTIVE', 'DISABLED'])
  status?: 'ACTIVE' | 'DISABLED';
}

class VerifyDocumentDto {
  @IsIn(['verified', 'rejected'])
  action!: 'verified' | 'rejected';

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

/** Allowed staff transitions — pembayaran berpindah otomatis via verify. */
const TRANSITIONS: Record<RegistrationStatus, RegistrationStatus[]> = {
  DRAFT: [],
  AWAITING_PAYMENT: ['REJECTED'],
  PAYMENT_REVIEW: [],
  FORM_FILLING: [],
  SUBMITTED: ['DOCUMENT_REVIEW', 'NEEDS_REVISION', 'VERIFIED', 'REJECTED'],
  DOCUMENT_REVIEW: ['NEEDS_REVISION', 'VERIFIED', 'REJECTED'],
  NEEDS_REVISION: ['REJECTED'],
  VERIFIED: ['REJECTED'],
  AWAITING_FINAL_PAYMENT: ['REJECTED'],
  FINAL_PAYMENT_REVIEW: [],
  SELECTION: ['ACCEPTED', 'REJECTED'],
  ACCEPTED: ['RE_REGISTRATION'],
  REJECTED: [],
  RE_REGISTRATION: ['COMPLETED'],
  COMPLETED: [],
};

@Controller({ path: 'admin', version: '1' })
export class AdminSpmbController {
  constructor(
    private readonly registrations: RegistrationsService,
    private readonly documents: DocumentsService,
    private readonly payments: PaymentsService,
    private readonly settings: SpmbSettingsService,
    private readonly importer: SpmbImportService,
    private readonly users: UsersService,
  ) {}

  // ---------- Akun Orang Tua ----------

  @Get('parents')
  @RequirePermission(PERMISSIONS.SPMB_REGISTRATION_READ)
  listParents() {
    return this.users.listParents();
  }

  @Get('parents/:id')
  @RequirePermission(PERMISSIONS.SPMB_REGISTRATION_READ)
  async parentDetail(@Param('id', ParseUUIDPipe) id: string) {
    const u = await this.users.parentDetail(id);
    if (!u) throw new BadRequestException('Akun tidak ditemukan.');
    return u;
  }

  @Patch('parents/:id')
  @RequirePermission(PERMISSIONS.SPMB_REGISTRATION_MANAGE)
  async updateParent(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateParentDto,
  ) {
    const data: Parameters<UsersService['updateUser']>[1] = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.phone !== undefined) {
      data.phone = dto.phone ? normalizePhone(dto.phone) : null;
    }
    if (dto.email !== undefined) {
      data.email = dto.email ? dto.email.toLowerCase() : null;
    }
    if (dto.status !== undefined) data.status = dto.status;
    return this.users.updateUser(id, data);
  }

  @Delete('parents/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission(PERMISSIONS.SPMB_REGISTRATION_MANAGE)
  async deleteParent(@Param('id', ParseUUIDPipe) id: string) {
    const res = await this.users.deleteParent(id);
    if (!res.count) throw new BadRequestException('Akun tidak ditemukan.');
  }

  // ---------- Pendaftar ----------
  @Get('registrations')
  @RequirePermission(PERMISSIONS.SPMB_REGISTRATION_READ)
  list(
    @Query('status') status?: RegistrationStatus,
    @Query('waveId') waveId?: string,
    @Query('academicYearId') academicYearId?: string,
    @Query('search') search?: string,
    @Query('take', new ParseIntPipe({ optional: true })) take?: number,
  ) {
    return this.registrations.listForStaff({
      status,
      waveId,
      academicYearId,
      search,
      take,
    });
  }

  @Get('spmb/summary')
  @RequirePermission(PERMISSIONS.SPMB_REGISTRATION_READ)
  summary() {
    return this.registrations.staffSummary();
  }

  @Get('registrations/:id')
  @RequirePermission(PERMISSIONS.SPMB_REGISTRATION_READ)
  detail(@Param('id', ParseUUIDPipe) id: string) {
    return this.registrations.staffDetail(id);
  }

  @Post('registrations/:id/transition')
  @RequirePermission(PERMISSIONS.SPMB_REGISTRATION_MANAGE)
  @HttpCode(HttpStatus.OK)
  async transition(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: TransitionDto,
  ) {
    const reg = await this.registrations.staffDetail(id);
    const allowed = TRANSITIONS[reg.status] ?? [];
    if (!allowed.includes(dto.status)) {
      throw new BadRequestException(
        `Cannot move ${reg.status} → ${dto.status}`,
      );
    }
    return this.registrations.transition(
      id,
      dto.status,
      user.id,
      dto.note,
    );
  }

  @Post('registrations/transition')
  @RequirePermission(PERMISSIONS.SPMB_REGISTRATION_MANAGE)
  @HttpCode(HttpStatus.OK)
  bulkTransition(
    @CurrentUser() user: AuthUser,
    @Body() dto: BulkTransitionDto,
  ) {
    return this.registrations.bulkTransition(
      dto.ids,
      dto.status,
      user.id,
      dto.note,
    );
  }

  @Post('registrations/promote')
  @RequirePermission(PERMISSIONS.SPMB_REGISTRATION_MANAGE)
  @HttpCode(HttpStatus.OK)
  bulkPromote(@CurrentUser() user: AuthUser, @Body() dto: BulkIdsDto) {
    return this.registrations.bulkPromote(dto.ids, user.id);
  }

  @Patch('registrations/:id/psikotes')
  @RequirePermission(PERMISSIONS.SPMB_REGISTRATION_MANAGE)
  setPsikotes(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PsikotesDto,
  ) {
    return this.registrations.setPsikotes(
      id,
      { psikotesAt: dto.psikotesAt, note: dto.note },
      user.id,
    );
  }

  @Patch('registrations/:id/discount')
  @RequirePermission(PERMISSIONS.SPMB_REGISTRATION_MANAGE)
  setDiscount(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DiscountDto,
  ) {
    return this.registrations.setDiscount(id, dto.percent, user.id);
  }

  @Patch('documents/:id/verify')
  @RequirePermission(PERMISSIONS.SPMB_REGISTRATION_MANAGE)
  verifyDocument(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: VerifyDocumentDto,
  ) {
    return this.documents.verify(id, dto.action, dto.note, user.id);
  }

  // ---------- Pembayaran ----------
  @Post('registrations/:id/invoice')
  @RequirePermission(PERMISSIONS.SPMB_REGISTRATION_MANAGE)
  createInvoice(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateInvoiceDto,
  ) {
    return this.payments.createInvoice(id, dto.title, dto.amount, user.id, {
      kind: dto.kind,
      applyDiscount: dto.applyDiscount,
      dueAt: dto.dueAt ? new Date(dto.dueAt) : undefined,
      note: dto.note,
    });
  }

  @Post('registrations/:id/installment-plan')
  @RequirePermission(PERMISSIONS.SPMB_REGISTRATION_MANAGE)
  createInstallmentPlan(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: InstallmentPlanDto,
  ) {
    return this.payments.createInstallmentPlan(id, dto, user.id);
  }

  @Patch('payments/:id/verify')
  @RequirePermission(PERMISSIONS.SPMB_REGISTRATION_MANAGE)
  verifyPayment(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: VerifyPaymentDto,
  ) {
    return this.payments.verifyPayment(id, dto.action, dto.note, user.id);
  }

  @Post('payments/record-cash')
  @RequirePermission(PERMISSIONS.SPMB_REGISTRATION_MANAGE)
  @HttpCode(HttpStatus.OK)
  recordCash(
    @CurrentUser() user: AuthUser,
    @Body() dto: RecordCashDto,
  ) {
    return this.payments.recordCash(dto.invoiceId, dto.note, user.id);
  }

  // ---------- Import / export ----------
  @Get('spmb/export.xlsx')
  @RequirePermission(PERMISSIONS.SPMB_REGISTRATION_READ)
  async exportXlsx(
    @Query('waveId') waveId: string | undefined,
    @Query('academicYearId') academicYearId: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ) {
    const buf = await this.importer.exportXlsx(waveId, academicYearId);
    res.set({
      'Content-Type':
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="pendaftar-spmb.xlsx"`,
    });
    return new StreamableFile(buf);
  }

  @Get('spmb/export-documents')
  @RequirePermission(PERMISSIONS.SPMB_REGISTRATION_READ)
  async exportDocuments(
    @Query('waveId', ParseUUIDPipe) waveId: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const buf = await this.importer.exportDocumentsZip(waveId);
    res.set({
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="berkas-diterima.zip"`,
    });
    return new StreamableFile(buf);
  }

  @Post('spmb/import')
  @RequirePermission(PERMISSIONS.SPMB_REGISTRATION_MANAGE)
  @UseInterceptors(FileInterceptor('file'))
  importExcel(
    @CurrentUser() user: AuthUser,
    @UploadedFile(
      new ParseFilePipeBuilder()
        .addMaxSizeValidator({ maxSize: 10 * 1024 * 1024 })
        .build({ fileIsRequired: true }),
    )
    file: Express.Multer.File,
  ) {
    const name = file.originalname.toLowerCase();
    if (!name.endsWith('.xlsx') && !name.endsWith('.xls')) {
      throw new BadRequestException('Hanya file Excel (.xlsx/.xls)');
    }
    return this.importer.importExcel(file.buffer, user.id);
  }

  @Get('registrations/:id/export.pdf')
  @RequirePermission(PERMISSIONS.SPMB_REGISTRATION_READ)
  async exportPdf(
    @Param('id', ParseUUIDPipe) id: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { doc, fileName } = await this.importer.exportPdf(id);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${fileName}"`,
    });
    return doc;
  }

  // ---------- Template surat pernyataan ----------
  @Post('spmb/surat-pernyataan-template')
  @RequirePermission(PERMISSIONS.SPMB_REGISTRATION_MANAGE)
  @UseInterceptors(FileInterceptor('file'))
  uploadSuratTemplate(
    @CurrentUser() user: AuthUser,
    @UploadedFile(
      new ParseFilePipeBuilder()
        .addMaxSizeValidator({ maxSize: 5 * 1024 * 1024 })
        .build({ fileIsRequired: true }),
    )
    file: Express.Multer.File,
  ) {
    return this.documents.uploadTemplate(user.id, file);
  }

  // ---------- Pengaturan: gelombang ----------
  @Get('spmb/waves')
  @RequirePermission(PERMISSIONS.SPMB_REGISTRATION_READ)
  listWaves() {
    return this.settings.listWaves();
  }

  @Post('spmb/waves')
  @RequirePermission(PERMISSIONS.SPMB_REGISTRATION_MANAGE)
  createWave(@Body() dto: SaveWaveDto) {
    return this.settings.saveWave(undefined, dto);
  }

  @Patch('spmb/waves/:id')
  @RequirePermission(PERMISSIONS.SPMB_REGISTRATION_MANAGE)
  updateWave(@Param('id', ParseUUIDPipe) id: string, @Body() dto: SaveWaveDto) {
    return this.settings.saveWave(id, dto);
  }

  @Delete('spmb/waves/:id')
  @RequirePermission(PERMISSIONS.SPMB_REGISTRATION_MANAGE)
  deleteWave(@Param('id', ParseUUIDPipe) id: string) {
    return this.settings.deleteWave(id);
  }

  // ---------- Pengaturan: biaya per gelombang ----------
  @Get('spmb/waves/:id/fees')
  @RequirePermission(PERMISSIONS.SPMB_REGISTRATION_READ)
  waveFees(@Param('id', ParseUUIDPipe) id: string) {
    return this.settings.feesForWave(id);
  }

  @Put('spmb/waves/:id/fees/:key')
  @RequirePermission(PERMISSIONS.SPMB_REGISTRATION_MANAGE)
  saveWaveFee(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('key') key: string,
    @Body() dto: UpdateFeeDto,
  ) {
    return this.settings.saveWaveFee(id, key, dto.amount, user.id);
  }

  @Delete('spmb/waves/:id/fees/:key')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission(PERMISSIONS.SPMB_REGISTRATION_MANAGE)
  deleteWaveFee(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('key') key: string,
  ) {
    return this.settings.deleteWaveFee(id, key);
  }

  // ---------- Pengaturan: biaya ----------
  @Get('spmb/fees')
  @RequirePermission(PERMISSIONS.SPMB_REGISTRATION_READ)
  listFees() {
    return this.settings.listFees();
  }

  @Patch('spmb/fees/:key')
  @RequirePermission(PERMISSIONS.SPMB_REGISTRATION_MANAGE)
  updateFee(
    @CurrentUser() user: AuthUser,
    @Param('key') key: string,
    @Body() dto: UpdateFeeDto,
  ) {
    return this.settings.updateFee(key, dto.amount, user.id);
  }

  // ---------- Pengaturan: diskon prestasi ----------
  @Get('spmb/discounts')
  @RequirePermission(PERMISSIONS.SPMB_REGISTRATION_READ)
  listDiscounts() {
    return this.settings.listDiscounts();
  }

  @Put('spmb/discounts/:subType')
  @RequirePermission(PERMISSIONS.SPMB_REGISTRATION_MANAGE)
  upsertDiscount(
    @Param('subType') subType: string,
    @Body() dto: SaveDiscountDto,
  ) {
    return this.settings.upsertDiscount(subType, dto);
  }

  // ---------- Pengaturan: pertanyaan formulir ----------
  @Get('spmb/questions')
  @RequirePermission(PERMISSIONS.SPMB_REGISTRATION_READ)
  listQuestions() {
    return this.settings.listQuestions();
  }

  @Post('spmb/questions')
  @RequirePermission(PERMISSIONS.SPMB_REGISTRATION_MANAGE)
  createQuestion(@Body() dto: SaveQuestionDto) {
    return this.settings.saveQuestion(undefined, dto);
  }

  @Patch('spmb/questions/:id')
  @RequirePermission(PERMISSIONS.SPMB_REGISTRATION_MANAGE)
  updateQuestion(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SaveQuestionDto,
  ) {
    return this.settings.saveQuestion(id, dto);
  }

  @Delete('spmb/questions/:id')
  @RequirePermission(PERMISSIONS.SPMB_REGISTRATION_MANAGE)
  deleteQuestion(@Param('id', ParseUUIDPipe) id: string) {
    return this.settings.deleteQuestion(id);
  }
}
