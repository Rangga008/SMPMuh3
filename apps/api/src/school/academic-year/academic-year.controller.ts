import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import type { AuthUser } from '@smpmuh3/types';
import { PERMISSIONS } from '@smpmuh3/types';
import { CurrentUser } from '../../identity/decorators/current-user.decorator';
import { RequirePermission } from '../../identity/decorators/require-permission.decorator';
import { AcademicYearService } from './academic-year.service';
import { CreateAcademicYearDto } from './dto/create-academic-year.dto';

@Controller({ path: 'academic-years', version: '1' })
export class AcademicYearController {
  constructor(private readonly academicYears: AcademicYearService) {}

  @Get()
  @RequirePermission(PERMISSIONS.ACADEMIC_YEAR_READ)
  list() {
    return this.academicYears.list();
  }

  @Post()
  @RequirePermission(PERMISSIONS.ACADEMIC_YEAR_MANAGE)
  create(@Body() dto: CreateAcademicYearDto, @CurrentUser() user: AuthUser) {
    return this.academicYears.create(dto, user.id);
  }

  @Patch(':id/activate')
  @RequirePermission(PERMISSIONS.ACADEMIC_YEAR_MANAGE)
  activate(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.academicYears.activate(id, user.id);
  }
}
