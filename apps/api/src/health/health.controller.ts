import { Controller, Get } from '@nestjs/common';
import { HealthCheckService, HealthCheck } from '@nestjs/terminus';
import type { HealthStatus } from '@link-shortener/shared-types';
import { PrismaService } from '../prisma/prisma.service';

@Controller('health')
export class HealthController {
  constructor(
    private health: HealthCheckService,
    private prisma: PrismaService,
  ) {}

  @Get()
  @HealthCheck()
  async check(): Promise<HealthStatus> {
    return this.health.check([
      async () => {
        try {
          // Check database connection with a simple query
          await (this.prisma as any).$queryRawUnsafe('SELECT 1');
          return { database: { status: 'up' } };
        } catch (error) {
          throw new Error('Database connection failed');
        }
      },
    ]);
  }
}
