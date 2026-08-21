import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import type { User } from '@prisma/client';
import { AuthController } from './auth.controller';
import { UsersService } from '../users/users.service';
import type { GoogleProfile } from './strategies/google.strategy';

describe('AuthController', () => {
  let controller: AuthController;
  let jwtService: { sign: jest.Mock };
  let usersService: {
    findById: jest.Mock;
    findOrCreateByGoogleProfile: jest.Mock;
  };
  let configService: { get: jest.Mock };

  const baseUser: User = {
    id: 'user-1',
    googleId: 'google-1',
    email: 'user@example.com',
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

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: JwtService, useValue: jwtService },
        { provide: UsersService, useValue: usersService },
        { provide: ConfigService, useValue: configService },
      ],
    }).compile();

    controller = module.get<AuthController>(AuthController);
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
      expect(jwtService.sign).toHaveBeenCalledWith({
        sub: baseUser.id,
        email: baseUser.email,
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
  });
});
