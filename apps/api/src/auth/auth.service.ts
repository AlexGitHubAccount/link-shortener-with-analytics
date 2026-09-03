import {
  ConflictException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { hash, verify } from '@node-rs/argon2';
import { JwtService } from '@nestjs/jwt';
import type { User } from '@prisma/client';
import type { AuthTokenResponse } from '@link-shortener/shared-types';
import { UsersService } from '../users/users.service';
import { isUniqueConstraintViolation } from '../common/prisma-errors';
import type { JwtPayload } from './strategies/jwt.strategy';
import type { RegisterDto } from './dto/register.dto';
import type { LoginDto } from './dto/login.dto';

// An argon2 hash of a random secret, verified against on the "no such user" / "user has no
// password" login paths so those take the same ~constant time as a real password check -
// without it, a fast 401 for an unknown email vs. a slow 401 for a known email with a wrong
// password is a user-enumeration oracle. Lazy + memoized on first login rather than computed at
// module load: an argon2 failure then only degrades the login path, not the whole API's boot
// (an unhandled rejection at import time would terminate the process on Node >=15).
//
// On rejection the memo is cleared so the next call retries - caching a rejected promise would
// wedge every unknown-email login until a process restart. Callers must still wrap this (with
// the verify() that follows it) in a catch that funnels to the same generic 401, so a hash
// failure never turns the enumeration-defence path into a 500 while the real-password path
// stays a 401.
let dummyHashPromise: Promise<string> | undefined;
async function getDummyHash(): Promise<string> {
  dummyHashPromise ??= hash(randomUUID());
  try {
    return await dummyHashPromise;
  } catch (err) {
    dummyHashPromise = undefined;
    throw err;
  }
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
  ) {}

  async register(dto: RegisterDto): Promise<AuthTokenResponse> {
    const existing = await this.usersService.findByEmail(dto.email);
    if (existing) {
      throw new ConflictException('Email already registered');
    }
    const passwordHash = await hash(dto.password);
    let user: User;
    try {
      user = await this.usersService.createPasswordUser({
        email: dto.email,
        passwordHash,
        displayName: dto.displayName,
      });
    } catch (error) {
      // The findByEmail check above is not atomic with the insert - a concurrent signup or a
      // double-submit can slip a row in between. `createPasswordUser` sets no googleId, so the
      // only unique constraint it can violate is email: collapse that race to the same 409 the
      // pre-check returns rather than leaking a raw Prisma error as a 500.
      if (isUniqueConstraintViolation(error)) {
        throw new ConflictException('Email already registered');
      }
      throw error;
    }
    this.logger.log(`New account registered: ${user.email}`);
    return this.issueToken(user);
  }

  async login(dto: LoginDto): Promise<AuthTokenResponse> {
    const user = await this.usersService.findByEmail(dto.email);

    if (!user || !user.passwordHash) {
      // Unknown email, or a Google-only account with no password: still run an argon2 op against
      // the dummy hash so this path isn't measurably faster than a real wrong-password check.
      // The whole thing (hash + verify) is under one catch, exactly mirroring the real-password
      // branch below - either branch may fail its argon2 op, and either way the caller gets the
      // same generic 401, never a 500.
      await getDummyHash()
        .then((dummy) => verify(dummy, dto.password))
        .catch(() => false);
      this.logger.warn(`Failed password login for ${dto.email}`);
      throw new UnauthorizedException('Invalid email or password');
    }

    const passwordMatches = await verify(user.passwordHash, dto.password).catch(
      () => false,
    );
    if (!passwordMatches) {
      this.logger.warn(`Failed password login for ${dto.email}`);
      throw new UnauthorizedException('Invalid email or password');
    }

    return this.issueToken(user);
  }

  // Same payload shape AuthController builds for the Google callback - keep them consistent
  // (sub/email/fresh jti). jti is the per-token handle POST /auth/logout revokes.
  private issueToken(user: User): AuthTokenResponse {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      jti: randomUUID(),
    };
    return { token: this.jwtService.sign(payload) };
  }
}
