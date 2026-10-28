import type { PermissionKey } from '@smpmuh3/types';

/** True when the user's permission set includes every required key. */
export function hasPermissions(
  granted: readonly string[],
  required: readonly PermissionKey[],
): boolean {
  return required.every((p) => granted.includes(p));
}

/** True when the user's permission set includes at least one required key. */
export function hasAnyPermission(
  granted: readonly string[],
  required: readonly PermissionKey[],
): boolean {
  return required.some((p) => granted.includes(p));
}
