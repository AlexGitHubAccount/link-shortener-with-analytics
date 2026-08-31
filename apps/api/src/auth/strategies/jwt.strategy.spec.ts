import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtStrategy } from './jwt.strategy';
import { PrismaService } from '../../prisma/prisma.service';

describe('JwtStrategy', () => {
  function buildConfig(
    secret: unknown = 'a-real-jwt-secret-value',
  ): ConfigService {
    return {
      get: jest.fn().mockReturnValue(secret),
    } as unknown as ConfigService;
  }

  function buildPrisma(revokedTokenFound: unknown = null): {
    prisma: PrismaService;
    findUnique: jest.Mock;
  } {
    const findUnique = jest.fn().mockResolvedValue(revokedTokenFound);
    const prisma = {
      revokedToken: { findUnique },
    } as unknown as PrismaService;
    return { prisma, findUnique };
  }

  describe('constructor', () => {
    it('constructs successfully when JWT_SECRET is configured', () => {
      const config = buildConfig();
      const { prisma } = buildPrisma();

      expect(() => new JwtStrategy(config, prisma)).not.toThrow();
      expect(config.get).toHaveBeenCalledWith('JWT_SECRET');
    });

    it('throws when JWT_SECRET is not configured (fail-fast via getRequiredJwtSecret)', () => {
      // null, not undefined - a default parameter only kicks in for an omitted/undefined
      // argument, so passing undefined here would silently fall back to the "real secret"
      // default instead of exercising the missing-secret path this test means to cover.
      const config = buildConfig(null);
      const { prisma } = buildPrisma();

      expect(() => new JwtStrategy(config, prisma)).toThrow(
        /JWT_SECRET is not set in apps\/api\/\.env/,
      );
    });
  });

  describe('validate', () => {
    it('maps a valid JWT payload to a RequestUser when the token is not revoked', async () => {
      const { prisma, findUnique } = buildPrisma(null);
      const strategy = new JwtStrategy(buildConfig(), prisma);

      const result = await strategy.validate({
        sub: 'user-123',
        email: 'alice@example.com',
        jti: 'token-abc',
        exp: 1900000000,
      });

      expect(findUnique).toHaveBeenCalledWith({ where: { jti: 'token-abc' } });
      expect(result).toEqual({
        userId: 'user-123',
        email: 'alice@example.com',
        jti: 'token-abc',
        exp: 1900000000,
      });
    });

    it('throws UnauthorizedException when the token jti has been revoked (real server-side logout)', async () => {
      const { prisma } = buildPrisma({
        jti: 'token-abc',
        expiresAt: new Date(),
      });
      const strategy = new JwtStrategy(buildConfig(), prisma);

      await expect(
        strategy.validate({
          sub: 'user-123',
          email: 'alice@example.com',
          jti: 'token-abc',
        }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('does not look up revocation for a token issued before jti existed (backward compatible)', async () => {
      const { prisma, findUnique } = buildPrisma(null);
      const strategy = new JwtStrategy(buildConfig(), prisma);

      const result = await strategy.validate({
        sub: 'user-456',
        email: '',
        jti: undefined as unknown as string,
      });

      expect(findUnique).not.toHaveBeenCalled();
      expect(result).toEqual({
        userId: 'user-456',
        email: '',
        jti: undefined,
        exp: undefined,
      });
    });
  });
});
