import {
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
import { CurrentUser } from '../identity/decorators/current-user.decorator';
import { Public } from '../identity/decorators/public.decorator';
import { PaymentsService } from './payments.service';

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

  /** Parent: initiate payment for own invoice. */
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
