import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { getRequiredJwtSecret } from '../jwt-secret';

export interface JwtPayload {
  sub: string; // user id
  email: string;
}

export interface RequestUser {
  userId: string;
  email: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: getRequiredJwtSecret(config),
    });
  }

  validate(payload: JwtPayload): RequestUser {
    return { userId: payload.sub, email: payload.email };
  }
}
