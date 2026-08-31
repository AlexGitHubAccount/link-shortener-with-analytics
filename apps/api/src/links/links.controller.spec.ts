import { Test, TestingModule } from '@nestjs/testing';
import { ThrottlerGuard } from '@nestjs/throttler';
import { LinksController } from './links.controller';
import { LinksService } from './links.service';

describe('LinksController', () => {
  let controller: LinksController;
  let service: { [K in keyof LinksService]?: jest.Mock };

  beforeEach(async () => {
    service = {
      create: jest.fn(),
      findAll: jest.fn(),
      findOne: jest.fn(),
      update: jest.fn(),
      remove: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [LinksController],
      providers: [{ provide: LinksService, useValue: service }],
    })
      // Real ThrottlerGuard needs ThrottlerModule's storage/options wired up - irrelevant to
      // what this suite tests (CRUD delegation to LinksService, not rate limiting).
      .overrideGuard(ThrottlerGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get(LinksController);
  });

  it('create() delegates to LinksService.create with the current user id', async () => {
    const dto = { originalUrl: 'https://example.com' };
    service.create!.mockResolvedValue({ id: 'link-1' });

    const result = await controller.create('user-1', dto);

    expect(service.create).toHaveBeenCalledWith('user-1', dto);
    expect(result).toEqual({ id: 'link-1' });
  });

  it('findAll() parses valid page/limit query params into numbers', async () => {
    service.findAll!.mockResolvedValue([]);

    await controller.findAll('user-1', '2', '10');

    expect(service.findAll).toHaveBeenCalledWith('user-1', 2, 10);
  });

  it('findAll() falls back to undefined for a fractional page (e.g. "1.5"), not a truncated int', async () => {
    // Regression coverage for the Stage 3 bug: a bare Number.isFinite check let "1.5" through
    // as page=1.5, which then reached Prisma's skip/take math unnoticed.
    service.findAll!.mockResolvedValue([]);

    await controller.findAll('user-1', '1.5', undefined);

    expect(service.findAll).toHaveBeenCalledWith(
      'user-1',
      undefined,
      undefined,
    );
  });

  it('findAll() falls back to undefined for non-numeric/zero/negative query values', async () => {
    service.findAll!.mockResolvedValue([]);

    await controller.findAll('user-1', 'abc', '-5');

    expect(service.findAll).toHaveBeenCalledWith(
      'user-1',
      undefined,
      undefined,
    );
  });

  it('findOne() delegates with the current user id', async () => {
    service.findOne!.mockResolvedValue({ id: 'link-1' });

    const result = await controller.findOne('user-1', 'link-1');

    expect(service.findOne).toHaveBeenCalledWith('user-1', 'link-1');
    expect(result).toEqual({ id: 'link-1' });
  });

  it('update() delegates with the current user id and dto', async () => {
    const dto = { title: 'New title' };
    service.update!.mockResolvedValue({ id: 'link-1', title: 'New title' });

    const result = await controller.update('user-1', 'link-1', dto);

    expect(service.update).toHaveBeenCalledWith('user-1', 'link-1', dto);
    expect(result).toEqual({ id: 'link-1', title: 'New title' });
  });

  it('remove() delegates with the current user id', async () => {
    service.remove!.mockResolvedValue({ id: 'link-1', isActive: false });

    const result = await controller.remove('user-1', 'link-1');

    expect(service.remove).toHaveBeenCalledWith('user-1', 'link-1');
    expect(result).toEqual({ id: 'link-1', isActive: false });
  });
});
