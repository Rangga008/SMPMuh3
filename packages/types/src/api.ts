/**
 * API response envelope conventions (see docs/development/conventions.md).
 *
 * Success responses are wrapped by the API's ResponseInterceptor.
 * Error responses are produced by the API's AllExceptionsFilter.
 */

export interface ApiSuccess<T> {
  data: T;
  meta?: Record<string, unknown>;
}

export interface ApiErrorBody {
  code: string;
  message: string;
  details?: unknown;
}

export interface ApiError {
  error: ApiErrorBody;
  requestId?: string;
}

export type ApiResponse<T> = ApiSuccess<T> | ApiError;

export function isApiError(res: ApiResponse<unknown>): res is ApiError {
  return typeof res === 'object' && res !== null && 'error' in res;
}
