import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import {
  Strategy,
  StrategyOptions,
  VerifyCallback,
  Profile,
} from 'passport-google-oauth20';

export interface GoogleProfile {
  googleId: string;
  email: string;
  displayName?: string;
  avatarUrl?: string;
}

// Any credential still set to a "REPLACE_ME..." placeholder (the .env.example default, or the
// value CI writes for the e2e job) counts as not configured. Prefix match so the exact wording
// of the placeholder can change without breaking detection.
const PLACEHOLDER_PREFIX = 'REPLACE_ME';
const isPlaceholder = (value?: string): boolean =>
  !value || value.startsWith(PLACEHOLDER_PREFIX);

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  private readonly logger = new Logger(GoogleStrategy.name);

  constructor(config: ConfigService) {
    const clientID = config.get<string>('GOOGLE_CLIENT_ID');
    const clientSecret = config.get<string>('GOOGLE_CLIENT_SECRET');

    if (isPlaceholder(clientID) || isPlaceholder(clientSecret)) {
      // Don't crash the whole app over missing Google credentials - real ones require the
      // user to set up a Google Cloud project themselves (Claude Code can't do this on their
      // behalf). Register the strategy with dummy values so Nest boots cleanly; GET /auth/google
      // will redirect to Google, which will show an error page until real credentials are set.
      // See the "Sign in with Google" entry in CLAUDE.md's Troubleshooting section.
      Logger.warn(
        'GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET not configured - Google login will not work until set (see CLAUDE.md)',
        GoogleStrategy.name,
      );
    }

    const options: StrategyOptions = {
      clientID: clientID || 'not-configured',
      clientSecret: clientSecret || 'not-configured',
      callbackURL:
        config.get<string>('GOOGLE_CALLBACK_URL') ??
        'http://localhost:4000/auth/google/callback',
      scope: ['email', 'profile'],
    };
    super(options);
  }

  validate(
    _accessToken: string,
    _refreshToken: string,
    profile: Profile,
    done: VerifyCallback,
  ): void {
    const email = profile.emails?.[0]?.value;
    if (!email) {
      done(new Error('Google profile did not include an email address'), false);
      return;
    }
    const user: GoogleProfile = {
      googleId: profile.id,
      email,
      displayName: profile.displayName,
      avatarUrl: profile.photos?.[0]?.value,
    };
    done(null, user);
  }
}
