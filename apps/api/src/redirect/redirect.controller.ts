import {
  Controller,
  Get,
  GoneException,
  Headers,
  NotFoundException,
  Param,
  Redirect,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { RedirectThrottlerGuard } from './redirect-throttler.guard';
import { LinksService } from '../links/links.service';
import { AnalyticsService } from '../analytics/analytics.service';

// Deliberately its own module/controller, not part of LinksModule's CRUD surface:
// this is the highest-traffic path in the app and must never depend on future
// auth-guard checks the way the private /links endpoints will (Stage 4).
//
// This is also the ONE endpoint in the app with no JwtAuthGuard - anyone can hit it, and every
// hit writes a Click row. @UseGuards(RedirectThrottlerGuard) opts it into the ThrottlerModule
// limits registered in app.module.ts (found missing entirely during an earlier security
// review) without throttling any of the authenticated dashboard
// traffic elsewhere. RedirectThrottlerGuard keys on the socket address, not req.ip, because
// this route is not behind the trusted proxy - see that file.
@ApiTags('redirect')
@Controller()
@UseGuards(RedirectThrottlerGuard)
export class RedirectController {
  // referer/user-agent are unauthenticated, attacker-controlled request headers persisted
  // verbatim into every Click row. Cap them so a caller can't use the analytics write to stuff
  // multi-KB strings (up to Node's ~8KB header limit) into the table on each throttled request.
  private static readonly MAX_HEADER_LEN = 512;

  constructor(
    private readonly linksService: LinksService,
    private readonly analyticsService: AnalyticsService,
  ) {}

  // Documented (not @ApiExcludeEndpoint'd) despite being a real 302 rather than a JSON
  // response - Swagger UI's "Try it out" won't follow the redirect usefully, but this is still
  // a real public endpoint of the API that consumers/tooling should see listed.
  @ApiOperation({
    summary:
      'Public redirect by short code - increments click analytics as a side effect',
  })
  @ApiResponse({
    status: 302,
    description: "Redirects to the link's original URL",
  })
  @ApiResponse({ status: 404, description: 'No link exists for this code' })
  @ApiResponse({
    status: 410,
    description: 'Link is inactive or past its expiry date',
  })
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
    const cap = (value?: string) =>
      value?.slice(0, RedirectController.MAX_HEADER_LEN);
    void this.analyticsService.recordClick(link.id, {
      referrer: cap(referrer),
      userAgentRaw: cap(userAgentRaw),
    });

    return { url: link.originalUrl, statusCode: 302 };
  }
}
