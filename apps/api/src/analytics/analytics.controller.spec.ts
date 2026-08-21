import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';
import { LinksService } from '../links/links.service';

describe('AnalyticsController', () => {
  let controller: AnalyticsController;
  let linksService: { findOne: jest.Mock };
  let analyticsService: { getLinkAnalytics: jest.Mock };

  beforeEach(async () => {
    linksService = { findOne: jest.fn() };
    analyticsService = { getLinkAnalytics: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AnalyticsController],
      providers: [
        { provide: LinksService, useValue: linksService },
        { provide: AnalyticsService, useValue: analyticsService },
      ],
    }).compile();

    controller = module.get(AnalyticsController);
  });

  it('checks ownership via LinksService.findOne before returning analytics', async () => {
    linksService.findOne.mockResolvedValue({ id: 'link-1', userId: 'user-1' });
    const analytics = { linkId: 'link-1', totalClicks: 5 };
    analyticsService.getLinkAnalytics.mockResolvedValue(analytics);

    const result = await controller.getAnalytics('user-1', 'link-1');

    expect(linksService.findOne).toHaveBeenCalledWith('user-1', 'link-1');
    expect(analyticsService.getLinkAnalytics).toHaveBeenCalledWith('link-1');
    expect(result).toEqual(analytics);
  });

  it('propagates NotFoundException from the ownership check without calling getLinkAnalytics', async () => {
    linksService.findOne.mockRejectedValue(
      new NotFoundException('Link "link-1" not found'),
    );

    await expect(controller.getAnalytics('user-1', 'link-1')).rejects.toThrow(
      NotFoundException,
    );
    expect(analyticsService.getLinkAnalytics).not.toHaveBeenCalled();
  });
});
