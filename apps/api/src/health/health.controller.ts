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
    const result = await this.health.check([
      async () => {
        try {
          // Check database connection with a simple query
          await this.prisma.$queryRawUnsafe('SELECT 1');
          return { database: { status: 'up' } };
        } catch (error) {
          throw new Error('Database connection failed', { cause: error });
        }
      },
    ]);
    // Terminus's HealthCheckResult generic is structurally awkward to match against a hand-written
    // interface (optional/possibly-undefined nested indicator fields). The actual JSON it serializes
    // does match HealthStatus (that's what shared-types documents for the frontend) — cast at this
    // one boundary rather than fight the generic or fall back to returning `any`.
    return result as HealthStatus;
  }
}
