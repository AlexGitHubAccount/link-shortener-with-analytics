import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

// Standard NestJS + Prisma v6 pattern: extend PrismaClient directly.
// Gives full Prisma-generated types on every model access (this.link, this.click, this.user, ...)
// across the app — no proxy/require hackery needed. Project is pinned to Prisma v6 (see CLAUDE.md),
// so there's no need for the v6/v7-compat runtime detection this file used to carry.
@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
