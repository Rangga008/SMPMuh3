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
import { FileInterceptor } from '@nestjs/platform-express';
import { PERMISSIONS } from '@smpmuh3/types';
import type { AuthUser } from '@smpmuh3/types';
import type { Response } from 'express';
import { CurrentUser } from '../identity/decorators/current-user.decorator';
import { Public } from '../identity/decorators/public.decorator';
import { CandidatesService } from './candidates.service';
import { DocumentsService } from './documents.service';
import { RegistrationsService } from './registrations.service';
import {
  CreateCandidateDto,
  StatusLookupDto,
  UpdateCandidateDto,
  UpdateRegistrationDto,
  UploadDocumentDto,
  type RegistrationDocType,
} from './dto/spmb.dto';
import { IsUUID } from 'class-validator';

class CreateRegistrationDto {
  @IsUUID()
  candidateId!: string;
}

@Controller({ version: '1' })
export class SpmbController {
  constructor(
    private readonly candidates: CandidatesService,
    private readonly registrations: RegistrationsService,
    private readonly documents: DocumentsService,
  ) {}

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

  @Post('registrations')
  createRegistration(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateRegistrationDto,
  ) {
    return this.registrations.createDraft(user.id, dto.candidateId);
  }

  @Get('registrations/lookup')
  @Public()
  lookup(@Query() q: StatusLookupDto) {
    return this.registrations.lookup(q.number, q.email);
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
    return this.registrations.updateDraft(user.id, id, dto.pathway);
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

  @Get('documents/:id/download')
  async download(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { doc, stream } = await this.documents.open(
      user.id,
      id,
      user.permissions.includes(PERMISSIONS.SPMB_REGISTRATION_MANAGE),
    );
    res.set({
      'Content-Type': doc.mimeType,
      'Content-Disposition': `attachment; filename="${doc.fileName}"`,
    });
    return stream;
  }

}
