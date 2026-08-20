import {
  Controller,
  Get,
  GoneException,
  Headers,
  NotFoundException,
  Param,
  Redirect,
} from '@nestjs/common';
import { LinksService } from '../links/links.service';
import { AnalyticsService } from '../analytics/analytics.service';

// Deliberately its own module/controller, not part of LinksModule's CRUD surface:
// this is the highest-traffic path in the app and must never depend on future
// auth-guard checks the way the private /links endpoints will (Stage 4).
@Controller()
export class RedirectController {
  constructor(
    private readonly linksService: LinksService,
    private readonly analyticsService: AnalyticsService,
  ) {}

  @Get(':code')
  @Redirect()
  async redirect(
    @Param('code') code: string,
    @Headers('referer') referrer?: string,
    @Headers('user-agent') userAgentRaw?: string,
  ) {
    const link = await this.linksService.findByShortCode(code);

    if (!link) {
      throw new NotFoundException(`No link for code "${code}"`);
    }
    if (!link.isActive || (link.expiresAt && link.expiresAt < new Date())) {
      throw new GoneException(`Link "${code}" is no longer available`);
    }

    // Fire-and-forget: never block or fail the redirect on analytics writes.
    void this.analyticsService.recordClick(link.id, { referrer, userAgentRaw });

    return { url: link.originalUrl, statusCode: 302 };
  }
}
