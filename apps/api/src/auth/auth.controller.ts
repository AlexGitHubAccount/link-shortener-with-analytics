import {
  Controller,
  Get,
  NotFoundException,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import type { AuthUser } from '@link-shortener/shared-types';
import { UsersService } from '../users/users.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { GoogleProfile } from './strategies/google.strategy';
import type { JwtPayload } from './strategies/jwt.strategy';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly jwtService: JwtService,
    private readonly usersService: UsersService,
    private readonly config: ConfigService,
  ) {}

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
    const user = await this.usersService.findOrCreateByGoogleProfile(req.user);
    const payload: JwtPayload = { sub: user.id, email: user.email };
    const token = this.jwtService.sign(payload);

    const frontendUrl =
      this.config.get<string>('FRONTEND_URL') ?? 'http://localhost:5173';
    // Token in the URL fragment, not a query string: fragments are never sent to the server
    // in subsequent requests or included in Referer headers, unlike query params - a
    // meaningfully safer place to hand a bearer token to a single-page app for one-time pickup.
    res.redirect(`${frontendUrl}/auth/callback#token=${token}`);
  }
}
