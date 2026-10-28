import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import { describe, expect, it, vi } from 'vitest';
import { IS_PUBLIC_KEY } from '../src/identity/decorators/public.decorator';
import { PERMISSIONS_KEY } from '../src/identity/decorators/require-permission.decorator';
import { PermissionsGuard } from '../src/identity/guards/permissions.guard';

function ctxWith(user?: { permissions: string[] }): ExecutionContext {
  return {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

function guardWith(metadata: Record<string, unknown>) {
  const reflector = {
    getAllAndOverride: vi.fn((key: string) => metadata[key]),
  } as unknown as Reflector;
  return new PermissionsGuard(reflector);
}

describe('PermissionsGuard', () => {
  it('allows public routes without a user', () => {
    const guard = guardWith({ [IS_PUBLIC_KEY]: true });
    expect(guard.canActivate(ctxWith())).toBe(true);
  });

  it('allows when no permissions are required', () => {
    const guard = guardWith({ [PERMISSIONS_KEY]: undefined });
    expect(guard.canActivate(ctxWith({ permissions: [] }))).toBe(true);
  });

  it('allows when the user holds all required permissions', () => {
    const guard = guardWith({
      [PERMISSIONS_KEY]: ['school.academic-year.read'],
    });
    expect(
      guard.canActivate(
        ctxWith({ permissions: ['school.academic-year.read', 'audit.read'] }),
      ),
    ).toBe(true);
  });

  it('rejects when the user lacks a required permission', () => {
    const guard = guardWith({
      [PERMISSIONS_KEY]: ['school.academic-year.manage'],
    });
    expect(() =>
      guard.canActivate(ctxWith({ permissions: ['school.academic-year.read'] })),
    ).toThrow(ForbiddenException);
  });

  it('rejects when there is no authenticated user', () => {
    const guard = guardWith({ [PERMISSIONS_KEY]: ['audit.read'] });
    expect(() => guard.canActivate(ctxWith())).toThrow(ForbiddenException);
  });
});
