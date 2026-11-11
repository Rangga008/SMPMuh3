import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseFilePipeBuilder,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { StreamableFile } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { PERMISSIONS } from '@smpmuh3/types';
import type { AuthUser } from '@smpmuh3/types';
import type { Response } from 'express';
import { CurrentUser } from '../identity/decorators/current-user.decorator';
import { Public } from '../identity/decorators/public.decorator';
import { PaymentsService } from '../payments/payments.service';
import { CandidatesService } from './candidates.service';
import { DocumentsService } from './documents.service';
import { RegistrationsService } from './registrations.service';
import { SpmbSettingsService } from './settings.service';
import {
  CreateCandidateDto,
  DaftarByCodeDto,
  GuestTitipanDto,
  ParentTitipanDto,
  RedeemTitipanDto,
  StatusLookupDto,
  UpdateCandidateDto,
  UpdateRegistrationDto,
  UploadDocumentDto,
  type RegistrationDocType,
} from './dto/spmb.dto';
import { TitipanService } from './titipan.service';

@Controller({ version: '1' })
export class SpmbController {
  constructor(
    private readonly candidates: CandidatesService,
    private readonly registrations: RegistrationsService,
    private readonly documents: DocumentsService,
    private readonly settings: SpmbSettingsService,
    private readonly payments: PaymentsService,
    private readonly titipan: TitipanService,
  ) {}

  // ---------- Info publik/ortu ----------
  /** Gelombang aktif — default tahun ajaran aktif, bisa per tahun lain. */
  @Get('waves')
  activeWaves(@Query('academicYearId') academicYearId?: string) {
    return this.settings.activeWaves(academicYearId || undefined);
  }

  /** Pertanyaan formulir aktif — diisi ortu pada tahap FORM_FILLING. */
  @Get('form-questions')
  formQuestions() {
    return this.settings.listQuestions(true);
  }

  /** Aturan diskon aktif — ditampilkan saat memilih jalur prestasi. */
  @Get('discounts')
  discounts() {
    return this.settings.listDiscounts();
  }

  /** Daftar biaya (publik) — transparansi biaya di landing page. */
  @Public()
  @Get('fees')
  fees() {
    return this.settings.listFees();
  }

  // ---------- Daftar titipan / waiting list ----------

  /** Tahun ajaran yang membuka titipan + ringkasan antrean (publik). */
  @Public()
  @Get('titipan/years')
  titipanYears() {
    return this.titipan.openYears();
  }

  /** Papan antrean titipan publik — pola data-titipan SPMB SDM3. */
  @Public()
  @Get('titipan/board')
  titipanBoard(@Query('academicYearId') academicYearId?: string) {
    return this.titipan.publicBoard(academicYearId || undefined);
  }

  /** Form titipan publik — tanpa akun, masuk status PENDING. */
  @Public()
  @Post('titipan/guest')
  titipanGuest(@Body() dto: GuestTitipanDto) {
    return this.titipan.createGuest(dto);
  }

  /**
   * Info kode formulir (publik) — status + tahun + gelombang aktifnya.
   * Dipakai ortu yang menitip lewat form publik lalu menerima kode via WA.
   */
  @Public()
  @Get('titipan/code/:code')
  async titipanCodeInfo(@Param('code') code: string) {
    const entry = await this.titipan.findByCode(code);
    return {
      status: entry.status,
      academicYearId: entry.academicYearId,
      academicYearName: entry.academicYear.name,
      candidateName: entry.candidateName,
      waves: await this.settings.activeWaves(entry.academicYearId),
    };
  }

  /** Titipan milik ortu yang sedang login. */
  @Get('titipan')
  myTitipan(@CurrentUser() user: AuthUser) {
    return this.titipan.listForParent(user.id);
  }

  /** Titipan dari akun ortu — tertaut kandidat. */
  @Post('titipan')
  createTitipan(@CurrentUser() user: AuthUser, @Body() dto: ParentTitipanDto) {
    return this.titipan.createForParent(user.id, dto);
  }

  // ---------- Candidates (own) ----------
  @Get('candidates')
  listCandidates(@CurrentUser() user: AuthUser) {
    return this.candidates.listByParent(user.id);
  }

  @Post('candidates')
  createCandidate(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateCandidateDto,
  ) {
    return this.candidates.create(user.id, dto);
  }

  @Patch('candidates/:id')
  updateCandidate(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCandidateDto,
  ) {
    return this.candidates.update(user.id, id, dto);
  }

  // ---------- Registrations (own) ----------
  @Get('registrations')
  listRegistrations(@CurrentUser() user: AuthUser) {
    return this.registrations.listByParent(user.id);
  }

  /** Buat pendaftaran — wajib kode formulir unik dari daftar titipan. */
  @Post('registrations')
  createRegistration(
    @CurrentUser() user: AuthUser,
    @Body() dto: RedeemTitipanDto,
  ) {
    return this.registrations.redeemCode(user.id, dto);
  }

  /**
   * Alur utama publik "Daftar Sekarang": kode formulir + No. HP titipan +
   * kata sandi → akun otomatis dibuat bila belum ada → pendaftaran
   * langsung terbuat untuk calon murid dari titipan tersebut.
   */
  @Public()
  @Post('titipan/redeem')
  redeemPublic(@Body() dto: DaftarByCodeDto) {
    return this.registrations.redeemPublic(dto);
  }

  @Get('registrations/lookup')
  @Public()
  lookup(@Query() q: StatusLookupDto) {
    return this.registrations.lookup(q.number);
  }

  @Get('registrations/:id')
  getRegistration(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.registrations.ownedOrStaff(id, user.id, user.permissions.includes(PERMISSIONS.SPMB_REGISTRATION_MANAGE));
  }

  @Patch('registrations/:id')
  updateRegistration(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateRegistrationDto,
  ) {
    return this.registrations.updateDraft(user.id, id, dto);
  }

  @Post('registrations/:id/submit')
  @HttpCode(HttpStatus.OK)
  submit(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.registrations.submit(user.id, id);
  }

  // ---------- Documents ----------
  @Post('registrations/:id/documents')
  @UseInterceptors(FileInterceptor('file'))
  uploadDocument(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UploadDocumentDto,
    @UploadedFile(
      new ParseFilePipeBuilder()
        .addMaxSizeValidator({ maxSize: 5 * 1024 * 1024 })
        .build({ fileIsRequired: true }),
    )
    file: Express.Multer.File,
  ) {
    return this.documents.upload(
      user.id,
      id,
      dto.type as RegistrationDocType,
      file,
    );
  }

  @Get('registrations/:id/documents')
  listDocuments(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.documents.listForRegistration(user.id, id);
  }

  @Public()
  @Get('surat-pernyataan-template')
  async suratTemplate(@Res({ passthrough: true }) res: Response) {
    const { doc, buffer } = await this.documents.openTemplate();
    res.set({
      'Content-Type': doc.mimeType,
      'Content-Disposition': `attachment; filename="${doc.fileName}"`,
    });
    return new StreamableFile(buffer);
  }

  @Get('documents/:id/download')
  async download(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { doc, buffer } = await this.documents.open(
      user.id,
      id,
      user.permissions.includes(PERMISSIONS.SPMB_REGISTRATION_MANAGE),
    );
    res.set({
      'Content-Type': doc.mimeType,
      'Content-Disposition': `attachment; filename="${doc.fileName}"`,
    });
    return new StreamableFile(buffer);
  }

}
