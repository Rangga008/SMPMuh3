import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import type { AccessTokenClaims, AuthUser } from '@smpmuh3/types';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { EnvService } from '../../../core/config/env.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(env: EnvService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: env.jwtAccessSecret,
    });
  }

  validate(payload: AccessTokenClaims): AuthUser {
    return {
      id: payload.sub,
      email: payload.email,
      name: payload.name ?? '',
      roles: payload.roles ?? [],
      permissions: payload.permissions ?? [],
    };
  }
}
