import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { PERMISSIONS, type AuthUser } from '@smpmuh3/types';
import type { RegistrationStatus } from '@prisma/client';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { CurrentUser } from '../identity/decorators/current-user.decorator';
import { RequirePermission } from '../identity/decorators/require-permission.decorator';
import { DocumentsService } from './documents.service';
import { RegistrationsService } from './registrations.service';
import { PaymentsService } from '../payments/payments.service';
import { REGISTRATION_STATUSES } from '@smpmuh3/types';

class TransitionDto {
  @IsIn(REGISTRATION_STATUSES)
  status!: RegistrationStatus;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

class VerifyDocumentDto {
  @IsIn(['verified', 'rejected'])
  action!: 'verified' | 'rejected';

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

class CreateInvoiceDto {
  @IsString()
  @MaxLength(120)
  title!: string;

  @IsInt()
  @Min(1)
  amount!: number;
}

/** Allowed staff transitions — strict state machine per spec. */
const TRANSITIONS: Record<RegistrationStatus, RegistrationStatus[]> = {
  DRAFT: [],
  SUBMITTED: ['DOCUMENT_REVIEW', 'NEEDS_REVISION', 'VERIFIED', 'REJECTED'],
  DOCUMENT_REVIEW: ['NEEDS_REVISION', 'VERIFIED', 'REJECTED'],
  NEEDS_REVISION: ['DOCUMENT_REVIEW', 'REJECTED'],
  VERIFIED: ['SELECTION'],
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
  ) {}

  @Get('registrations')
  @RequirePermission(PERMISSIONS.SPMB_REGISTRATION_READ)
  list(
    @Query('status') status?: RegistrationStatus,
    @Query('search') search?: string,
    @Query('take', new ParseIntPipe({ optional: true })) take?: number,
  ) {
    return this.registrations.listForStaff({ status, search, take });
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

  @Patch('documents/:id/verify')
  @RequirePermission(PERMISSIONS.SPMB_REGISTRATION_MANAGE)
  verifyDocument(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: VerifyDocumentDto,
  ) {
    return this.documents.verify(id, dto.action, dto.note, user.id);
  }

  @Post('registrations/:id/invoice')
  @RequirePermission(PERMISSIONS.SPMB_REGISTRATION_MANAGE)
  createInvoice(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateInvoiceDto,
  ) {
    return this.payments.createInvoice(id, dto.title, dto.amount, user.id);
  }
}
