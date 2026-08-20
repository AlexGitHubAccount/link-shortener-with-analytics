import { Module } from '@nestjs/common';
import { AnalyticsService } from './analytics.service';

@Module({
  providers: [AnalyticsService],
  exports: [AnalyticsService], // redirect module calls recordClick()
})
export class AnalyticsModule {}
