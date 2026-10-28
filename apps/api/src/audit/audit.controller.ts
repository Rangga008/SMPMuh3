import { Controller, Get, ParseIntPipe, Query } from '@nestjs/common';
import { PERMISSIONS } from '@smpmuh3/types';
import { RequirePermission } from '../identity/decorators/require-permission.decorator';
import { AuditService } from './audit.service';

@Controller({ path: 'audit-logs', version: '1' })
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  @RequirePermission(PERMISSIONS.AUDIT_READ)
  list(
    @Query('entity') entity?: string,
    @Query('take', new ParseIntPipe({ optional: true })) take?: number,
    @Query('skip', new ParseIntPipe({ optional: true })) skip?: number,
  ) {
    return this.audit.list({ entity, take, skip });
  }
}
