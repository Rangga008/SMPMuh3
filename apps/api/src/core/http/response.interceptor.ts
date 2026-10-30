import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  StreamableFile,
} from '@nestjs/common';
import { map, Observable } from 'rxjs';

/**
 * Success envelope: every handler's return value becomes `{ data: ... }`.
 * Handlers returning `{ data, meta }` pass through untouched so list
 * endpoints can attach pagination metadata.
 */
@Injectable()
export class ResponseInterceptor implements NestInterceptor {
  intercept(_ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(
      map((data) => {
        // Binary/file responses must pass through untouched.
        if (data instanceof StreamableFile || Buffer.isBuffer(data)) {
          return data;
        }
        if (
          typeof data === 'object' &&
          data !== null &&
          'data' in (data as Record<string, unknown>)
        ) {
          return data;
        }
        return { data };
      }),
    );
  }
}
