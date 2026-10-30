import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
} from '@nestjs/common';
import type { AuthUser } from '@smpmuh3/types';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { IsIn, IsOptional, IsUUID } from 'class-validator';
import { CurrentUser } from '../identity/decorators/current-user.decorator';
import { Public } from '../identity/decorators/public.decorator';
import { PaymentsService } from './payments.service';

class PayInvoiceDto {
  @IsIn(['transfer', 'cash'])
  method!: 'transfer' | 'cash';

  @IsOptional()
  @IsUUID()
  proofDocumentId?: string;
}

@Controller({ version: '1' })
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  /** Parent: invoices for own registration. */
  @Get('registrations/:id/invoices')
  listForParent(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.payments.listForParent(id, user.id);
  }

  /** Parent: bayar manual — transfer (bukti) atau tunai di sekolah. */
  @Post('invoices/:id/pay')
  pay(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PayInvoiceDto,
  ) {
    return this.payments.pay(id, user.id, dto);
  }

  /** Parent: initiate payment via mock provider (demo). */
  @Post('invoices/:id/checkout')
  checkout(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.payments.checkout(id, user.id);
  }

  /** Provider webhook — public, signature-verified, idempotent. */
  @Public()
  @Post('webhooks/payments')
  @HttpCode(HttpStatus.OK)
  webhook(
    @Headers() headers: Record<string, string | undefined>,
    @Req() req: RawBodyRequest<Request>,
  ) {
    const raw = req.rawBody?.toString() ?? '';
    return this.payments.handleWebhook(headers, raw);
  }
}
