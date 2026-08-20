import { Module } from '@nestjs/common';
import { LinksModule } from '../links/links.module';
import { AnalyticsModule } from '../analytics/analytics.module';
import { RedirectController } from './redirect.controller';

@Module({
  imports: [LinksModule, AnalyticsModule],
  controllers: [RedirectController],
})
export class RedirectModule {}
