import { Test, TestingModule } from '@nestjs/testing';
import { DeviceType } from '@prisma/client';
import { AnalyticsService } from './analytics.service';
import { PrismaService } from '../prisma/prisma.service';

const CHROME_WINDOWS_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36';
const IPHONE_SAFARI_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 16_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.5 Mobile/15E148 Safari/604.1';
const GOOGLEBOT_UA =
  'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';

describe('AnalyticsService', () => {
  let service: AnalyticsService;
  let prisma: {
    $queryRaw: jest.Mock;
    $transaction: jest.Mock;
    click: {
      create: jest.Mock;
      count: jest.Mock;
      groupBy: jest.Mock;
    };
  };

  beforeEach(async () => {
    prisma = {
      $queryRaw: jest.fn(),
      // getLinkAnalytics batches its reads through an interactive $transaction for a consistent
      // snapshot; the mock just runs the callback with the same mocked client.
      $transaction: jest.fn((cb: (tx: unknown) => unknown) => cb(prisma)),
      click: {
        create: jest.fn(),
        count: jest.fn(),
        groupBy: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [AnalyticsService, PrismaService],
    })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .compile();

    service = module.get<AnalyticsService>(AnalyticsService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('recordClick', () => {
    it('parses a desktop Chrome UA into browser/os/DESKTOP and writes the click', async () => {
      prisma.click.create.mockResolvedValue({});

      await service.recordClick('link-1', {
        referrer: 'https://google.com',
        userAgentRaw: CHROME_WINDOWS_UA,
      });

      expect(prisma.click.create).toHaveBeenCalledTimes(1);
      expect(prisma.click.create).toHaveBeenCalledWith({
        data: {
          linkId: 'link-1',
          referrer: 'https://google.com',
          userAgentRaw: CHROME_WINDOWS_UA,
          browser: 'Chrome',
          os: 'Windows',
          deviceType: DeviceType.DESKTOP,
        },
      });
    });

    it('parses an iPhone Safari UA into MOBILE', async () => {
      prisma.click.create.mockResolvedValue({});

      await service.recordClick('link-2', {
        userAgentRaw: IPHONE_SAFARI_UA,
      });

      expect(prisma.click.create).toHaveBeenCalledWith({
        data: {
          linkId: 'link-2',
          referrer: undefined,
          userAgentRaw: IPHONE_SAFARI_UA,
          browser: 'Mobile Safari',
          os: 'iOS',
          deviceType: DeviceType.MOBILE,
        },
      });
    });

    it('parses a Googlebot UA into BOT via the regex fallback', async () => {
      prisma.click.create.mockResolvedValue({});

      await service.recordClick('link-3', {
        userAgentRaw: GOOGLEBOT_UA,
      });

      expect(prisma.click.create).toHaveBeenCalledWith({
        data: {
          linkId: 'link-3',
          referrer: undefined,
          userAgentRaw: GOOGLEBOT_UA,
          browser: undefined,
          os: undefined,
          deviceType: DeviceType.BOT,
        },
      });
    });

    it('falls back to UNKNOWN with no browser/os when no UA is provided', async () => {
      prisma.click.create.mockResolvedValue({});

      await service.recordClick('link-4', {});

      expect(prisma.click.create).toHaveBeenCalledWith({
        data: {
          linkId: 'link-4',
          referrer: undefined,
          userAgentRaw: undefined,
          browser: undefined,
          os: undefined,
          deviceType: DeviceType.UNKNOWN,
        },
      });
    });

    it('swallows a prisma.click.create rejection instead of throwing', async () => {
      prisma.click.create.mockRejectedValue(new Error('DB connection lost'));

      await expect(
        service.recordClick('link-5', { userAgentRaw: CHROME_WINDOWS_UA }),
      ).resolves.toBeUndefined();
    });
  });

  describe('getLinkAnalytics', () => {
    it('computes the full LinkAnalytics shape from fixture aggregates', async () => {
      const now = new Date('2026-08-20T12:00:00.000Z');
      jest.useFakeTimers().setSystemTime(now);

      prisma.click.count.mockResolvedValue(42);
      // getLinkAnalytics now buckets per day in SQL - the mock returns the aggregated rows.
      prisma.$queryRaw.mockResolvedValue([
        { day: '2026-08-20', count: 2n },
        { day: '2026-08-19', count: 1n },
      ]);
      prisma.click.groupBy.mockImplementation(({ by }: { by: string[] }) => {
        if (by[0] === 'referrer') {
          return Promise.resolve([
            { referrer: 'https://google.com', _count: 10 },
            { referrer: 'https://twitter.com', _count: 3 },
          ]);
        }
        return Promise.resolve([
          { deviceType: DeviceType.DESKTOP, _count: 7 },
          { deviceType: DeviceType.MOBILE, _count: 2 },
        ]);
      });

      const result = await service.getLinkAnalytics('link-1');

      expect(result.linkId).toBe('link-1');
      expect(result.totalClicks).toBe(42);

      // clicksByDay: exactly 30 zero-filled entries, oldest -> today, with the two
      // click-bearing days holding the right counts.
      expect(result.clicksByDay).toHaveLength(30);
      expect(result.clicksByDay[29]).toEqual({ date: '2026-08-20', count: 2 });
      expect(result.clicksByDay[28]).toEqual({ date: '2026-08-19', count: 1 });
      const zeroDays = result.clicksByDay.filter(
        (d) => d.date !== '2026-08-20' && d.date !== '2026-08-19',
      );
      expect(zeroDays).toHaveLength(28);
      expect(zeroDays.every((d) => d.count === 0)).toBe(true);

      // topReferrers: nulls excluded (never appear, since groupBy fixture has none), sorted desc.
      expect(result.topReferrers).toEqual([
        { referrer: 'https://google.com', count: 10 },
        { referrer: 'https://twitter.com', count: 3 },
      ]);

      // deviceBreakdown: enum keys lowercased, missing keys default to 0.
      expect(result.deviceBreakdown).toEqual({
        desktop: 7,
        mobile: 2,
        tablet: 0,
        bot: 0,
        unknown: 0,
      });

      jest.useRealTimers();
    });

    it('zero-fills clicksByDay entirely and defaults every deviceBreakdown key when there are no clicks', async () => {
      const now = new Date('2026-08-20T12:00:00.000Z');
      jest.useFakeTimers().setSystemTime(now);

      prisma.click.count.mockResolvedValue(0);
      prisma.$queryRaw.mockResolvedValue([]);
      prisma.click.groupBy.mockResolvedValue([]);

      const result = await service.getLinkAnalytics('link-empty');

      expect(result.totalClicks).toBe(0);
      expect(result.clicksByDay).toHaveLength(30);
      expect(result.clicksByDay.every((d) => d.count === 0)).toBe(true);
      expect(result.topReferrers).toEqual([]);
      expect(result.deviceBreakdown).toEqual({
        desktop: 0,
        mobile: 0,
        tablet: 0,
        bot: 0,
        unknown: 0,
      });

      jest.useRealTimers();
    });
  });
});
