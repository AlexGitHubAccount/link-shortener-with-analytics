import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface RecordClickInput {
  referrer?: string;
  userAgentRaw?: string;
}

// Stage 2: just persists the raw click, no parsing yet.
// Stage 5 adds User-Agent parsing (browser/os/deviceType) on top of this.
@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async recordClick(linkId: string, input: RecordClickInput): Promise<void> {
    try {
      await this.prisma.click.create({
        data: {
          linkId,
          referrer: input.referrer,
          userAgentRaw: input.userAgentRaw,
          deviceType: 'UNKNOWN', // real parsing arrives in Stage 5
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
}
