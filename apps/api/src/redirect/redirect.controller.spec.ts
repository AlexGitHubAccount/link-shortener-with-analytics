import { Test, TestingModule } from '@nestjs/testing';
import { GoneException, NotFoundException } from '@nestjs/common';
import { RedirectThrottlerGuard } from './redirect-throttler.guard';
import { Link } from '@prisma/client';
import { RedirectController } from './redirect.controller';
import { LinksService } from '../links/links.service';
import { AnalyticsService } from '../analytics/analytics.service';

describe('RedirectController', () => {
  let controller: RedirectController;
  let linksService: { findByShortCode: jest.Mock };
  let analyticsService: { recordClick: jest.Mock };

  const baseLink: Link = {
    id: 'link-1',
    shortCode: 'abc1234',
    originalUrl: 'https://example.com/some/page',
    userId: 'user-1',
    isActive: true,
    isCustomAlias: false,
    expiresAt: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  } as Link;

  beforeEach(async () => {
    linksService = { findByShortCode: jest.fn() };
    analyticsService = { recordClick: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [RedirectController],
      providers: [
        { provide: LinksService, useValue: linksService },
        { provide: AnalyticsService, useValue: analyticsService },
      ],
    })
      // Real ThrottlerGuard needs ThrottlerModule's storage/options wired up - irrelevant to
      // what this suite tests (redirect logic, not rate limiting), so it's stubbed out rather
      // than pulling in the real module just to satisfy DI.
      .overrideGuard(RedirectThrottlerGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<RedirectController>(RedirectController);
  });

  it('throws NotFoundException when no link exists for the code', async () => {
    linksService.findByShortCode.mockResolvedValue(null);

    await expect(
      controller.redirect('missing', undefined, undefined),
    ).rejects.toThrow(NotFoundException);

    expect(analyticsService.recordClick).not.toHaveBeenCalled();
  });

  it('throws GoneException when the link is inactive', async () => {
    linksService.findByShortCode.mockResolvedValue({
      ...baseLink,
      isActive: false,
    });

    await expect(
      controller.redirect('abc1234', undefined, undefined),
    ).rejects.toThrow(GoneException);

    expect(analyticsService.recordClick).not.toHaveBeenCalled();
  });

  it('throws GoneException when the link has expired', async () => {
    linksService.findByShortCode.mockResolvedValue({
      ...baseLink,
      expiresAt: new Date('2020-01-01T00:00:00.000Z'),
    });

    await expect(
      controller.redirect('abc1234', undefined, undefined),
    ).rejects.toThrow(GoneException);

    expect(analyticsService.recordClick).not.toHaveBeenCalled();
  });

  it('returns a 302 redirect and records the click for a valid active link', async () => {
    linksService.findByShortCode.mockResolvedValue(baseLink);

    const result = await controller.redirect(
      'abc1234',
      'https://referrer.example.com',
      'Mozilla/5.0 Test Agent',
    );

    expect(result).toEqual({
      url: baseLink.originalUrl,
      statusCode: 302,
    });

    expect(analyticsService.recordClick).toHaveBeenCalledTimes(1);
    expect(analyticsService.recordClick).toHaveBeenCalledWith(baseLink.id, {
      referrer: 'https://referrer.example.com',
      userAgentRaw: 'Mozilla/5.0 Test Agent',
    });
  });

  it('does not throw when the link has a future expiry date', async () => {
    linksService.findByShortCode.mockResolvedValue({
      ...baseLink,
      expiresAt: new Date('2099-01-01T00:00:00.000Z'),
    });

    const result = await controller.redirect('abc1234', undefined, undefined);

    expect(result).toEqual({ url: baseLink.originalUrl, statusCode: 302 });
  });
});
