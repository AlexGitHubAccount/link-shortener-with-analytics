import { Injectable, Logger } from '@nestjs/common';
import { DeviceType } from '@prisma/client';
import { UAParser } from 'ua-parser-js';
import type { LinkAnalytics } from '@link-shortener/shared-types';
import { PrismaService } from '../prisma/prisma.service';

export interface RecordClickInput {
  referrer?: string;
  userAgentRaw?: string;
}

// ua-parser-js's bot coverage varies by version/UA string (in v2 it mostly surfaces as
// browser.type === 'crawler', but not for every known bot) - an explicit regex fallback on
// common bot substrings keeps deviceType honest regardless of library gaps.
const BOT_UA_REGEX = /bot|crawl|spider|slurp|facebookexternalhit/i;

const CLICKS_BY_DAY_WINDOW_DAYS = 30;

// Parses a raw User-Agent string into (browser name, os name, DeviceType). Never throws -
// a missing/unparseable UA just falls back to UNKNOWN, since this must never break click
// recording (see recordClick's try/catch) or the redirect it rides along with.
function parseUserAgent(userAgentRaw?: string): {
  browser?: string;
  os?: string;
  deviceType: DeviceType;
} {
  if (!userAgentRaw) {
    return { deviceType: DeviceType.UNKNOWN };
  }

  const { browser, os, device } = UAParser(userAgentRaw);
  const isBot = browser.type === 'crawler' || BOT_UA_REGEX.test(userAgentRaw);

  let deviceType: DeviceType;
  if (isBot) {
    deviceType = DeviceType.BOT;
  } else if (device.type === 'mobile') {
    deviceType = DeviceType.MOBILE;
  } else if (device.type === 'tablet') {
    deviceType = DeviceType.TABLET;
  } else if (device.type === undefined) {
    // ua-parser-js v2 doesn't emit a 'desktop' device.type - undefined is its documented way
    // of saying "not mobile/tablet/console/etc", which for our purposes is desktop.
    deviceType = DeviceType.DESKTOP;
  } else {
    // console/smarttv/wearable/xr/embedded - real categories our schema doesn't model.
    deviceType = DeviceType.UNKNOWN;
  }

  return { browser: browser.name, os: os.name, deviceType };
}

// Builds the last N UTC calendar dates (including today), oldest first, as YYYY-MM-DD strings.
function buildUtcDateRange(days: number): string[] {
  const dates: string[] = [];
  const today = new Date();
  const todayUtc = Date.UTC(
    today.getUTCFullYear(),
    today.getUTCMonth(),
    today.getUTCDate(),
  );
  for (let i = days - 1; i >= 0; i--) {
    dates.push(
      new Date(todayUtc - i * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
    );
  }
  return dates;
}

@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async recordClick(linkId: string, input: RecordClickInput): Promise<void> {
    try {
      const { browser, os, deviceType } = parseUserAgent(input.userAgentRaw);
      await this.prisma.click.create({
        data: {
          linkId,
          referrer: input.referrer,
          userAgentRaw: input.userAgentRaw,
          browser,
          os,
          deviceType,
        },
      });
    } catch (error) {
      // Fire-and-forget from RedirectController — a failed click write must never surface
      // to the user or affect the redirect that already happened. Log and move on.
      this.logger.error(
        `Failed to record click for link ${linkId}`,
        error instanceof Error ? error.stack : error,
      );
    }
  }

  async getLinkAnalytics(linkId: string): Promise<LinkAnalytics> {
    const windowStart = new Date(
      Date.now() - CLICKS_BY_DAY_WINDOW_DAYS * 24 * 60 * 60 * 1000,
    );
    // $transaction (not Promise.all) so the four reads share one consistent snapshot - under
    // concurrent Click writes, totalClicks would otherwise be able to disagree with the sums of
    // clicksByDay / deviceBreakdown in the same response.
    const [totalClicks, clicksByDayRows, referrerGroups, deviceGroups] =
      await this.prisma.$transaction((tx) =>
        Promise.all([
          tx.click.count({ where: { linkId } }),
          // Aggregate per UTC day in SQL rather than loading every click row from the window into
          // Node just to bucket it - Click is the fastest-growing table, and a viral link can do
          // millions of clicks a month. This returns O(days) rows.
          tx.$queryRaw<Array<{ day: string; count: bigint }>>`
            SELECT to_char("clickedAt", 'YYYY-MM-DD') AS day, count(*) AS count
            FROM "Click"
            WHERE "linkId" = ${linkId} AND "clickedAt" >= ${windowStart}
            GROUP BY 1
          `,
          tx.click.groupBy({
            by: ['referrer'],
            where: { linkId, referrer: { not: null } },
            _count: true,
            orderBy: { _count: { referrer: 'desc' } },
            take: 5,
          }),
          tx.click.groupBy({
            by: ['deviceType'],
            where: { linkId },
            _count: true,
          }),
        ]),
      );

    const countsByDate = new Map<string, number>();
    for (const row of clicksByDayRows) {
      countsByDate.set(row.day, Number(row.count));
    }
    const clicksByDay = buildUtcDateRange(CLICKS_BY_DAY_WINDOW_DAYS).map(
      (date) => ({ date, count: countsByDate.get(date) ?? 0 }),
    );

    const topReferrers = referrerGroups.map((group) => ({
      // referrer: { not: null } in the where clause guarantees this, TS just can't see it.
      referrer: group.referrer as string,
      count: group._count,
    }));

    const deviceBreakdown = {
      desktop: 0,
      mobile: 0,
      tablet: 0,
      bot: 0,
      unknown: 0,
    };
    for (const group of deviceGroups) {
      const key =
        group.deviceType.toLowerCase() as keyof typeof deviceBreakdown;
      deviceBreakdown[key] = group._count;
    }

    return { linkId, totalClicks, clicksByDay, topReferrers, deviceBreakdown };
  }
}
