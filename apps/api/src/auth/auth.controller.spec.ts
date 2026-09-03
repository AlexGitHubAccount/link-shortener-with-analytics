import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, Logger, NotFoundException } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import type { User } from '@prisma/client';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { PrismaService } from '../prisma/prisma.service';
import type { GoogleProfile } from './strategies/google.strategy';
import type { RequestUser } from './strategies/jwt.strategy';

describe('AuthController', () => {
  let controller: AuthController;
  let jwtService: { sign: jest.Mock };
  let usersService: {
    findById: jest.Mock;
    findOrCreateByGoogleProfile: jest.Mock;
  };
  let configService: { get: jest.Mock };
  let prismaService: {
    revokedToken: { upsert: jest.Mock; deleteMany: jest.Mock };
  };
  let authService: { register: jest.Mock; login: jest.Mock };

  const baseUser: User = {
    id: 'user-1',
    googleId: 'google-1',
    email: 'user@example.com',
    passwordHash: null,
    displayName: 'Jane Doe',
    avatarUrl: 'https://example.com/avatar.png',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  };

  beforeEach(async () => {
    jwtService = { sign: jest.fn() };
    usersService = {
      findById: jest.fn(),
      findOrCreateByGoogleProfile: jest.fn(),
    };
    configService = { get: jest.fn() };
    prismaService = {
      revokedToken: {
        upsert: jest.fn().mockResolvedValue(undefined),
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
    };
    authService = { register: jest.fn(), login: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: JwtService, useValue: jwtService },
        { provide: UsersService, useValue: usersService },
        { provide: ConfigService, useValue: configService },
        { provide: PrismaService, useValue: prismaService },
        { provide: AuthService, useValue: authService },
      ],
    })
      // ThrottlerGuard (on /register and /login) needs ThrottlerModule's storage/options wired
      // up - irrelevant to what this suite tests (delegation to AuthService).
      .overrideGuard(ThrottlerGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<AuthController>(AuthController);
  });

  describe('register', () => {
    it('delegates to AuthService.register and returns the token response', async () => {
      authService.register.mockResolvedValue({ token: 'new.jwt' });

      const result = await controller.register({
        email: 'new@example.com',
        password: 'a-good-password',
        displayName: 'New User',
      });

      expect(authService.register).toHaveBeenCalledWith({
        email: 'new@example.com',
        password: 'a-good-password',
        displayName: 'New User',
      });
      expect(result).toEqual({ token: 'new.jwt' });
    });
  });

  describe('login', () => {
    it('delegates to AuthService.login and returns the token response', async () => {
      authService.login.mockResolvedValue({ token: 'session.jwt' });

      const result = await controller.login({
        email: 'user@example.com',
        password: 'secret',
      });

      expect(authService.login).toHaveBeenCalledWith({
        email: 'user@example.com',
        password: 'secret',
      });
      expect(result).toEqual({ token: 'session.jwt' });
    });
  });

  describe('me', () => {
    it('returns the AuthUser shape for an existing user', async () => {
      usersService.findById.mockResolvedValue(baseUser);

      const result = await controller.me('user-1');

      expect(usersService.findById).toHaveBeenCalledWith('user-1');
      expect(result).toEqual({
        id: baseUser.id,
        email: baseUser.email,
        displayName: baseUser.displayName,
        avatarUrl: baseUser.avatarUrl,
      });
    });

    it('throws NotFoundException when the user does not exist', async () => {
      usersService.findById.mockResolvedValue(null);

      await expect(controller.me('missing-id')).rejects.toThrow(
        NotFoundException,
      );
      expect(usersService.findById).toHaveBeenCalledWith('missing-id');
    });
  });

  describe('googleAuth', () => {
    it('does not throw when invoked directly (Passport intercepts before this body runs)', () => {
      expect(() => controller.googleAuth()).not.toThrow();
    });
  });

  describe('googleAuthCallback', () => {
    const googleProfile: GoogleProfile = {
      googleId: 'google-1',
      email: 'user@example.com',
      displayName: 'Jane Doe',
      avatarUrl: 'https://example.com/avatar.png',
    };

    function buildReq() {
      return { user: googleProfile } as unknown as Parameters<
        AuthController['googleAuthCallback']
      >[0];
    }

    function buildRes(): { redirect: jest.Mock } {
      return { redirect: jest.fn() };
    }

    it('upserts the user, signs a JWT, and redirects with the token in the URL fragment', async () => {
      usersService.findOrCreateByGoogleProfile.mockResolvedValue(baseUser);
      jwtService.sign.mockReturnValue('signed.jwt.token');
      configService.get.mockReturnValue('http://localhost:5173');

      const req = buildReq();
      const res = buildRes();

      await controller.googleAuthCallback(req, res as unknown as Response);

      expect(usersService.findOrCreateByGoogleProfile).toHaveBeenCalledWith(
        googleProfile,
      );
      // jti is a fresh randomUUID() per call - assert its shape/presence, not an exact value.
      expect(jwtService.sign).toHaveBeenCalledWith({
        sub: baseUser.id,
        email: baseUser.email,
        jti: expect.stringMatching(/^[0-9a-f-]{36}$/) as string,
      });
      expect(res.redirect).toHaveBeenCalledWith(
        'http://localhost:5173/auth/callback#token=signed.jwt.token',
      );

      const redirectUrl = res.redirect.mock.calls[0][0] as string;
      expect(redirectUrl).toContain('/auth/callback#token=signed.jwt.token');
      expect(redirectUrl).not.toContain('?token=');
    });

    it('falls back to http://localhost:5173 when FRONTEND_URL is not configured', async () => {
      usersService.findOrCreateByGoogleProfile.mockResolvedValue(baseUser);
      jwtService.sign.mockReturnValue('another.token');
      configService.get.mockReturnValue(undefined);

      const req = buildReq();
      const res = buildRes();

      await controller.googleAuthCallback(req, res as unknown as Response);

      expect(configService.get).toHaveBeenCalledWith('FRONTEND_URL');
      expect(res.redirect).toHaveBeenCalledWith(
        'http://localhost:5173/auth/callback#token=another.token',
      );
    });

    it('redirects to /login?error=account_exists when a password account already owns the email', async () => {
      usersService.findOrCreateByGoogleProfile.mockRejectedValue(
        new ConflictException('An account with this email already exists.'),
      );
      configService.get.mockReturnValue('http://localhost:5173');

      const req = buildReq();
      const res = buildRes();

      await controller.googleAuthCallback(req, res as unknown as Response);

      expect(jwtService.sign).not.toHaveBeenCalled();
      expect(res.redirect).toHaveBeenCalledWith(
        'http://localhost:5173/login?error=account_exists',
      );
    });

    it('rethrows a non-Conflict error from findOrCreateByGoogleProfile', async () => {
      usersService.findOrCreateByGoogleProfile.mockRejectedValue(
        new Error('db down'),
      );
      configService.get.mockReturnValue('http://localhost:5173');

      await expect(
        controller.googleAuthCallback(
          buildReq(),
          buildRes() as unknown as Response,
        ),
      ).rejects.toThrow('db down');
    });
  });

  describe('logout', () => {
    function buildReq(user: RequestUser) {
      return { user } as unknown as Parameters<AuthController['logout']>[0];
    }

    it('revokes the current token by jti and sweeps expired revoked-token rows', async () => {
      const req = buildReq({
        userId: 'user-1',
        email: 'user@example.com',
        jti: 'token-abc',
        exp: 1900000000,
      });

      await controller.logout(req);

      expect(prismaService.revokedToken.upsert).toHaveBeenCalledWith({
        where: { jti: 'token-abc' },
        create: { jti: 'token-abc', expiresAt: new Date(1900000000 * 1000) },
        update: {},
      });
      expect(prismaService.revokedToken.deleteMany).toHaveBeenCalledWith({
        where: { expiresAt: { lt: expect.any(Date) as Date } },
      });
    });

    it('is a no-op when the token predates the jti field (nothing to revoke by id)', async () => {
      const req = buildReq({
        userId: 'user-1',
        email: 'user@example.com',
        jti: undefined,
      });

      await controller.logout(req);

      expect(prismaService.revokedToken.upsert).not.toHaveBeenCalled();
      expect(prismaService.revokedToken.deleteMany).not.toHaveBeenCalled();
    });

    it('defaults expiresAt to now + 24h when the token carries no exp claim', async () => {
      const now = new Date('2026-09-01T00:00:00.000Z');
      jest.useFakeTimers().setSystemTime(now);
      const req = buildReq({
        userId: 'user-1',
        email: 'user@example.com',
        jti: 'token-noexp',
      });

      await controller.logout(req);

      expect(prismaService.revokedToken.upsert).toHaveBeenCalledWith({
        where: { jti: 'token-noexp' },
        create: {
          jti: 'token-noexp',
          expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
        },
        update: {},
      });
      jest.useRealTimers();
    });

    it('still succeeds (does not throw) when the lazy revoked-token sweep fails', async () => {
      const warn = jest
        .spyOn(Logger.prototype, 'warn')
        .mockImplementation(() => undefined);
      prismaService.revokedToken.deleteMany.mockRejectedValueOnce(
        new Error('db unavailable'),
      );
      const req = buildReq({
        userId: 'user-1',
        email: 'user@example.com',
        jti: 'token-abc',
        exp: 1900000000,
      });

      await expect(controller.logout(req)).resolves.toBeUndefined();

      expect(prismaService.revokedToken.upsert).toHaveBeenCalled();
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('Lazy RevokedToken cleanup failed'),
      );
      warn.mockRestore();
    });
  });
});
