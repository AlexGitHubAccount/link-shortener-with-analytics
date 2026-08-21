import { Test, TestingModule } from '@nestjs/testing';
import { HealthCheckService } from '@nestjs/terminus';
import { HealthController } from './health.controller';
import { PrismaService } from '../prisma/prisma.service';

// HealthCheckService.check() actually invokes the indicator functions passed to it and
// aggregates their results - this mock reproduces that real behavior (rather than just
// returning a canned result) so the test genuinely exercises the controller's indicator
// closure, including its call to prisma.$queryRawUnsafe.
type Indicator = () => Promise<Record<string, { status: string }>>;

function fakeHealthCheck(indicators: Indicator[]) {
  return Promise.all(indicators.map((fn) => fn())).then((results) => {
    const info = Object.assign({}, ...results) as Record<
      string,
      { status: string }
    >;
    return { status: 'ok', info, error: {}, details: info };
  });
}

describe('HealthController', () => {
  let controller: HealthController;
  let prisma: { $queryRawUnsafe: jest.Mock };
  let healthService: { check: jest.Mock };

  beforeEach(async () => {
    prisma = { $queryRawUnsafe: jest.fn() };
    healthService = { check: jest.fn(fakeHealthCheck) };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        { provide: HealthCheckService, useValue: healthService },
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    controller = module.get(HealthController);
  });

  it('returns status ok with database up when the query succeeds', async () => {
    prisma.$queryRawUnsafe.mockResolvedValue([{ '?column?': 1 }]);

    const result = await controller.check();

    expect(prisma.$queryRawUnsafe).toHaveBeenCalledWith('SELECT 1');
    expect(result.status).toBe('ok');
    expect(result.info?.database.status).toBe('up');
  });

  it('propagates a wrapped error when the database query fails', async () => {
    prisma.$queryRawUnsafe.mockRejectedValue(new Error('connection refused'));

    await expect(controller.check()).rejects.toThrow(
      'Database connection failed',
    );
  });
});
