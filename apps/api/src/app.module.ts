import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { envValidationSchema } from './config/env.validation';
import { PrismaModule } from './prisma/prisma.module';
import { HealthModule } from './health/health.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { LinksModule } from './links/links.module';
import { RedirectModule } from './redirect/redirect.module';
import { AnalyticsModule } from './analytics/analytics.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
      // Validated once at boot - a missing/malformed env var fails immediately with a clear
      // message naming the exact variable, not later as a confusing runtime error the first
      // time something actually reads it. See config/env.validation.ts for why JWT_SECRET is
      // deliberately excluded (owned by jwt-secret.ts instead, with a better error message).
      validationSchema: envValidationSchema,
      validationOptions: { abortEarly: false },
    }),
    // Registered globally so any controller can opt in with @UseGuards(ThrottlerGuard) +
    // @Throttle(...) - NOT applied as a global APP_GUARD here on purpose, so authenticated
    // dashboard traffic (links/analytics) stays unthrottled. Currently only RedirectController's
    // public GET /:code opts in - it's the one endpoint with no JwtAuthGuard, found unprotected
    // during a push-gate security-reviewer scope review.
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 30 }]),
    PrismaModule,
    // RedirectModule's GET /:code is a single-segment wildcard that would swallow any other
    // top-level single-segment route (/health, /links, ...) registered after it — NestJS/Express
    // match in registration order, not by specificity. Keep RedirectModule LAST among modules
    // with top-level GET routes; see RESERVED_SHORT_CODES in links.service.ts for the other half
    // of this guard (blocking user-chosen customCode values that would collide anyway).
    HealthModule,
    AuthModule,
    UsersModule,
    LinksModule,
    AnalyticsModule,
    RedirectModule,
  ],
})
export class AppModule {}
