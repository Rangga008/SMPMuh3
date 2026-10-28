import type { PermissionKey } from './permissions';

/** Authenticated principal attached to the request after JWT validation. */
export interface AuthUser {
  id: string;
  email: string;
  name: string;
  roles: string[];
  permissions: PermissionKey[];
}

/** Claims carried inside the access token. */
export interface AccessTokenClaims {
  sub: string;
  email: string;
  name?: string;
  roles: string[];
  permissions: PermissionKey[];
  iat: number;
  exp: number;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  /** Access token lifetime in seconds. */
  expiresIn: number;
  tokenType: 'Bearer';
}
