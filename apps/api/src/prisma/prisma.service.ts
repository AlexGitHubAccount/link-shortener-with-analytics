import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';

// Prisma v7 compatibility: use require to get PrismaClient
let PrismaClientImpl: any;
try {
  // Try v7+ first (PrismaClient as default export)
  PrismaClientImpl = require('@prisma/client').PrismaClient || require('@prisma/client').default;
} catch {
  // Fallback for other versions
  PrismaClientImpl = require('@prisma/client');
}

@Injectable()
export class PrismaService implements OnModuleInit, OnModuleDestroy {
  private prisma: any;

  constructor() {
    this.prisma = new PrismaClientImpl();
  }

  async onModuleInit() {
    // Prisma v7 connects automatically
  }

  async onModuleDestroy() {
    await this.prisma.$disconnect();
  }

  // Proxy all prisma calls
  __getProxyHandler() {
    return {
      get: (target: any, prop: string) => {
        if (prop === 'prisma') return this.prisma;
        return (this.prisma as any)[prop];
      },
    };
  }

  // Direct access to prisma instance methods
  [Symbol.toPrimitive]() {
    return this.prisma;
  }

  // Make PrismaService act like PrismaClient
  get $connect() {
    return this.prisma.$connect.bind(this.prisma);
  }

  get $disconnect() {
    return this.prisma.$disconnect.bind(this.prisma);
  }

  get $transaction() {
    return this.prisma.$transaction.bind(this.prisma);
  }

  get $queryRaw() {
    return this.prisma.$queryRaw.bind(this.prisma);
  }

  get $queryRawUnsafe() {
    return this.prisma.$queryRawUnsafe.bind(this.prisma);
  }

  get $executeRaw() {
    return this.prisma.$executeRaw.bind(this.prisma);
  }

  get $executeRawUnsafe() {
    return this.prisma.$executeRawUnsafe.bind(this.prisma);
  }

  // Proxy model access
  get user() {
    return this.prisma.user;
  }

  get link() {
    return this.prisma.link;
  }

  get click() {
    return this.prisma.click;
  }
}
