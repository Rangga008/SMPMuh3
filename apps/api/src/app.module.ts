import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { AuditModule } from './audit/audit.module';
import { CoreModule } from './core/core.module';
import { EnvService } from './core/config/env.service';
import { IdentityModule } from './identity/identity.module';
import { JwtAuthGuard } from './identity/guards/jwt-auth.guard';
import { PermissionsGuard } from './identity/guards/permissions.guard';
import { NotificationsModule } from './notifications/notifications.module';
import { SchoolModule } from './school/school.module';
import { SpmbModule } from './spmb/spmb.module';
import { PaymentsModule } from './payments/payments.module';
import { StudentsModule } from './students/students.module';
import { AcademicModule } from './academic/academic.module';
import { FinanceModule } from './finance/finance.module';
import { TatausahaModule } from './tatausaha/tatausaha.module';

@Module({
  imports: [
    LoggerModule.forRootAsync({
      useFactory: (env: EnvService) => ({
        pinoHttp: {
          level: env.isProduction ? 'info' : 'debug',
          redact: ['req.headers.authorization', 'req.headers.cookie'],
          ...(env.isProduction
            ? {}
            : {
                transport: {
                  target: 'pino-pretty',
                  options: { singleLine: true, translateTime: 'HH:MM:ss' },
                },
              }),
        },
      }),
      inject: [EnvService],
    }),
    ThrottlerModule.forRoot([
      {
        name: 'default',
        ttl: 60_000,
        limit: 100,
      },
    ]),
    CoreModule,
    IdentityModule,
    SchoolModule,
    SpmbModule,
    PaymentsModule,
    StudentsModule,
    AcademicModule,
    FinanceModule,
    TatausahaModule,
    NotificationsModule,
    AuditModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
})
export class AppModule {}
