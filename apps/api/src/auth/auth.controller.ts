import {
  Body,
  ConflictException,
  Controller,
  Get,
  HttpCode,
  Logger,
  NotFoundException,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { AuthGuard } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Request, Response } from 'express';
import type { User } from '@prisma/client';
import type { AuthTokenResponse, AuthUser } from '@link-shortener/shared-types';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import type { GoogleProfile } from './strategies/google.strategy';
import type { JwtPayload, RequestUser } from './strategies/jwt.strategy';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly usersService: UsersService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly authService: AuthService,
  ) {}

  // Email+password registration - a public alternative to Google OAuth that issues the exact
  // same JWT. Throttled tightly (per-IP, ThrottlerModule's shared storage): account creation is
  // an abuse surface (mass/spam signups), same rationale as LinksController.create. Opts into
  // ThrottlerGuard per-route - it is NOT a global guard, so authenticated traffic stays
  // unthrottled.
  @ApiOperation({
    summary:
      'Register with email + password - issues a JWT (same token as Google login)',
  })
  @ApiResponse({ status: 201, description: 'Account created, JWT returned' })
  @ApiResponse({ status: 409, description: 'Email already registered' })
  @ApiResponse({ status: 429, description: 'Too many registration attempts' })
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @UseGuards(ThrottlerGuard)
  @Post('register')
  @HttpCode(201)
  register(@Body() dto: RegisterDto): Promise<AuthTokenResponse> {
    return this.authService.register(dto);
  }

  // Email+password login. Stricter throttle than register - this is the brute-force surface.
  // Errors are deliberately generic ("Invalid email or password" for wrong password AND for
  // Google-only / nonexistent accounts) so the response never confirms whether an email is
  // registered; AuthService also equalises timing on those paths.
  @ApiOperation({
    summary:
      'Log in with email + password - issues a JWT (same token as Google login)',
  })
  @ApiResponse({ status: 200, description: 'Credentials valid, JWT returned' })
  @ApiResponse({ status: 401, description: 'Invalid email or password' })
  @ApiResponse({ status: 429, description: 'Too many login attempts' })
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @UseGuards(ThrottlerGuard)
  @Post('login')
  @HttpCode(200)
  login(@Body() dto: LoginDto): Promise<AuthTokenResponse> {
    return this.authService.login(dto);
  }

  // Revokes the CURRENT token server-side (inserts its jti into RevokedToken - see
  // JwtStrategy.validate, which checks this on every subsequent authenticated request). Without
  // this, "logout" was purely client-side (deleting the token from localStorage) and a
  // leaked/stolen token stayed valid for its full remaining life regardless of what the
  // legitimate user did. Idempotent - calling it twice with an already-revoked token just
  // re-inserts the same row (upsert), not an error.
  @ApiOperation({
    summary:
      'Revoke the current token server-side (real logout, not just a client-side clear)',
  })
  @ApiBearerAuth()
  @ApiResponse({ status: 204, description: 'Token revoked (no content)' })
  @Post('logout')
  @HttpCode(204)
  @UseGuards(JwtAuthGuard)
  async logout(@Req() req: Request & { user: RequestUser }): Promise<void> {
    const { jti, exp } = req.user;
    if (!jti) {
      // Token predates the jti field (issued before this feature existed) - nothing to revoke
      // by id, but it's still short-lived enough to just expire naturally. Not an error.
      return;
    }
    await this.prisma.revokedToken.upsert({
      where: { jti },
      create: {
        jti,
        expiresAt: exp
          ? new Date(exp * 1000)
          : new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
      update: {},
    });
    // Lazy cleanup of rows whose own token already expired anyway - piggybacks on a real
    // logout request rather than needing a separate cron job at this project's scale.
    // Best-effort: the token is already revoked by the upsert above, so a cleanup failure
    // must not turn a successful logout into a 500. Log and move on (cf. AnalyticsService.recordClick).
    try {
      await this.prisma.revokedToken.deleteMany({
        where: { expiresAt: { lt: new Date() } },
      });
    } catch (error) {
      this.logger.warn(
        `Lazy RevokedToken cleanup failed (logout still succeeded): ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  // Frontend calls this right after picking up the token from the callback redirect, to get
  // real user info (email/displayName/avatarUrl) for the auth store rather than trusting an
  // unverified client-side JWT decode - the token IS verified here, server-side, by JwtAuthGuard.
  @ApiOperation({
    summary:
      'Get the current authenticated user (verifies the bearer JWT server-side)',
  })
  @ApiBearerAuth()
  @Get('me')
  @UseGuards(JwtAuthGuard)
  async me(@CurrentUser() userId: string): Promise<AuthUser> {
    const user = await this.usersService.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
    };
  }

  // Passport's AuthGuard('google') intercepts this request and redirects the browser to
  // Google's consent screen before this handler body ever runs.
  @ApiOperation({
    summary:
      'Start Google OAuth login - redirects to the Google consent screen',
  })
  @Get('google')
  @UseGuards(AuthGuard('google'))
  googleAuth(): void {}

  @ApiOperation({
    summary:
      "Google's OAuth callback - issues a JWT, redirects to the frontend with it in the URL fragment",
  })
  @Get('google/callback')
  @UseGuards(AuthGuard('google'))
  async googleAuthCallback(
    @Req() req: Request & { user: GoogleProfile },
    @Res() res: Response,
  ): Promise<void> {
    const frontendUrl =
      this.config.get<string>('FRONTEND_URL') ?? 'http://localhost:5173';

    let user: User;
    try {
      user = await this.usersService.findOrCreateByGoogleProfile(req.user);
    } catch (error) {
      // A password account already owns this email and we deliberately don't auto-link
      // (see UsersService.findOrCreateByGoogleProfile). Redirect back to the login page with a
      // flag the SPA renders a message for, rather than letting Nest render a raw error page.
      if (error instanceof ConflictException) {
        res.redirect(`${frontendUrl}/login?error=account_exists`);
        return;
      }
      throw error;
    }

    // jti (JWT ID) - unique per issued token, unrelated to the user id. This is what a later
    // POST /auth/logout revokes; without it, revocation would have no per-token handle to act on.
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      jti: randomUUID(),
    };
    const token = this.jwtService.sign(payload);

    // Token in the URL fragment, not a query string: fragments are never sent to the server
    // in subsequent requests or included in Referer headers, unlike query params - a
    // meaningfully safer place to hand a bearer token to a single-page app for one-time pickup.
    res.redirect(`${frontendUrl}/auth/callback#token=${token}`);
  }
}
