import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { AuthUser } from '@smpmuh3/types';

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser => {
    return ctx.switchToHttp().getRequest().user;
  },
);
