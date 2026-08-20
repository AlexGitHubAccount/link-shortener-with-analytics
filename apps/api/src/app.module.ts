import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
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
    }),
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
