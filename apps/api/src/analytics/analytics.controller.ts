import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { LinkAnalytics } from '@link-shortener/shared-types';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { LinksService } from '../links/links.service';
import { AnalyticsService } from './analytics.service';

// Shares the 'links' path prefix with LinksController - safe because the concrete route
// template (:id/analytics) doesn't collide with any route LinksController registers.
@ApiTags('analytics')
@ApiBearerAuth()
@Controller('links')
@UseGuards(JwtAuthGuard)
export class AnalyticsController {
  constructor(
    private readonly linksService: LinksService,
    private readonly analyticsService: AnalyticsService,
  ) {}

  @ApiOperation({
    summary: '30-day click chart, top referrers, device breakdown for one link',
  })
  @Get(':id/analytics')
  async getAnalytics(
    @CurrentUser() userId: string,
    @Param('id') id: string,
  ): Promise<LinkAnalytics> {
    // Reuses LinksService's ownership check: throws NotFoundException (404) if the link
    // doesn't exist OR isn't owned by this user - never leaks existence to non-owners.
    await this.linksService.findOne(userId, id);
    return this.analyticsService.getLinkAnalytics(id);
  }
}
