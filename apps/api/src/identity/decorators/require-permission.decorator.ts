import { SetMetadata } from '@nestjs/common';
import type { PermissionKey } from '@smpmuh3/types';

export const PERMISSIONS_KEY = 'requiredPermissions';

/** Requires ALL listed permissions. Checked by PermissionsGuard. */
export const RequirePermission = (...permissions: PermissionKey[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);
