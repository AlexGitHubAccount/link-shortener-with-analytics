import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../../prisma/prisma.service';
import { getRequiredJwtSecret } from '../jwt-secret';

export interface JwtPayload {
  sub: string; // user id
  email: string;
  // Unique per issued token - what a logout revokes, see RevokedToken. Optional: tokens issued
  // before this field existed have no jti (handled as a no-op in validate() below).
  jti?: string;
  exp?: number; // seconds since epoch, set automatically by JwtModule at sign time
}

export interface RequestUser {
  userId: string;
  email: string;
  jti?: string;
  exp?: number;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: getRequiredJwtSecret(config),
      // Tokens are signed with a symmetric secret (JwtModule default HS256). Pin verification to
      // HS256 explicitly as defence-in-depth so no other algorithm is ever accepted.
      algorithms: ['HS256'],
    });
  }

  async validate(payload: JwtPayload): Promise<RequestUser> {
    // Checked on every authenticated request, not just at sign-in - this is what makes
    // server-side logout actually work rather than just a client-side token delete. Backward
    // compatible with tokens issued before this field existed: those have no `jti` and were
    // never inserted into RevokedToken, so the lookup below is simply a no-op for them, not
    // a crash - they still expire naturally on their own original TTL.
    if (payload.jti) {
      const revoked = await this.prisma.revokedToken.findUnique({
        where: { jti: payload.jti },
      });
      if (revoked) {
        throw new UnauthorizedException('Token has been revoked');
      }
    }

    return {
      userId: payload.sub,
      email: payload.email,
      jti: payload.jti,
      exp: payload.exp,
    };
  }
}
