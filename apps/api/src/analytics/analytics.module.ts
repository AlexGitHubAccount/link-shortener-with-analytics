import { Module } from '@nestjs/common';
import { LinksModule } from '../links/links.module';
import { AnalyticsService } from './analytics.service';
import { AnalyticsController } from './analytics.controller';

@Module({
  imports: [LinksModule], // for LinksService's ownership check in AnalyticsController
  controllers: [AnalyticsController],
  providers: [AnalyticsService],
  exports: [AnalyticsService], // redirect module calls recordClick()
})
export class AnalyticsModule {}
