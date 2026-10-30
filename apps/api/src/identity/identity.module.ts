import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { EnvService, ttlToMs } from '../core/config/env.service';
import { AuthController } from './auth/auth.controller';
import { AuthService } from './auth/auth.service';
import { JwtStrategy } from './auth/strategies/jwt.strategy';
import { RolesController } from './roles.controller';
import { AdminUsersController } from './admin-users.controller';
import { UsersService } from './users/users.service';

@Module({
  imports: [
    PassportModule,
    JwtModule.registerAsync({
      useFactory: (env: EnvService) => ({
        secret: env.jwtAccessSecret,
        signOptions: { expiresIn: Math.floor(ttlToMs(env.jwtAccessTtl) / 1000) },
      }),
      inject: [EnvService],
    }),
  ],
  controllers: [AuthController, RolesController, AdminUsersController],
  providers: [AuthService, UsersService, JwtStrategy],
  exports: [UsersService],
})
export class IdentityModule {}
