import { Test, TestingModule } from '@nestjs/testing';
import { User } from '@prisma/client';
import { UsersService } from './users.service';
import { PrismaService } from '../prisma/prisma.service';
import type { GoogleProfile } from '../auth/strategies/google.strategy';

describe('UsersService', () => {
  let service: UsersService;
  let prisma: {
    user: {
      upsert: jest.Mock;
      findUnique: jest.Mock;
    };
  };

  const makeUser = (overrides: Partial<User> = {}): User => ({
    id: 'user-1',
    googleId: 'google-123',
    email: 'alice@example.com',
    displayName: 'Alice',
    avatarUrl: 'https://example.com/avatar.png',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  });

  beforeEach(async () => {
    prisma = {
      user: {
        upsert: jest.fn(),
        findUnique: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [UsersService, PrismaService],
    })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .compile();

    service = module.get<UsersService>(UsersService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('findById', () => {
    it('returns the user when prisma finds one (happy path)', async () => {
      const user = makeUser();
      prisma.user.findUnique.mockResolvedValue(user);

      const result = await service.findById('user-1');

      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: 'user-1' },
      });
      expect(result).toEqual(user);
    });

    it('returns null when no user matches the id (edge case)', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      const result = await service.findById('nonexistent-id');

      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: 'nonexistent-id' },
      });
      expect(result).toBeNull();
    });
  });

  describe('findOrCreateByGoogleProfile', () => {
    const profile: GoogleProfile = {
      googleId: 'google-456',
      email: 'bob@example.com',
      displayName: 'Bob',
      avatarUrl: 'https://example.com/bob.png',
    };

    it('calls prisma.user.upsert with the correct where/update/create shape and returns its result (happy path)', async () => {
      const upsertedUser = makeUser({
        id: 'user-2',
        googleId: profile.googleId,
        email: profile.email,
        displayName: profile.displayName,
        avatarUrl: profile.avatarUrl,
      });
      prisma.user.upsert.mockResolvedValue(upsertedUser);

      const result = await service.findOrCreateByGoogleProfile(profile);

      expect(prisma.user.upsert).toHaveBeenCalledWith({
        where: { googleId: profile.googleId },
        update: {
          email: profile.email,
          displayName: profile.displayName,
          avatarUrl: profile.avatarUrl,
        },
        create: {
          googleId: profile.googleId,
          email: profile.email,
          displayName: profile.displayName,
          avatarUrl: profile.avatarUrl,
        },
      });
      expect(result).toEqual(upsertedUser);
    });

    it('passes undefined displayName/avatarUrl through to upsert when the Google profile omits them (edge case)', async () => {
      const minimalProfile: GoogleProfile = {
        googleId: 'google-789',
        email: 'carol@example.com',
      };
      const upsertedUser = makeUser({
        id: 'user-3',
        googleId: minimalProfile.googleId,
        email: minimalProfile.email,
        displayName: null,
        avatarUrl: null,
      });
      prisma.user.upsert.mockResolvedValue(upsertedUser);

      const result = await service.findOrCreateByGoogleProfile(minimalProfile);

      expect(prisma.user.upsert).toHaveBeenCalledWith({
        where: { googleId: minimalProfile.googleId },
        update: {
          email: minimalProfile.email,
          displayName: undefined,
          avatarUrl: undefined,
        },
        create: {
          googleId: minimalProfile.googleId,
          email: minimalProfile.email,
          displayName: undefined,
          avatarUrl: undefined,
        },
      });
      expect(result).toEqual(upsertedUser);
    });

    it('propagates a rejection from prisma.user.upsert (error path, e.g. unique email conflict)', async () => {
      const dbError = new Error(
        'Unique constraint failed on the fields: (`email`)',
      );
      prisma.user.upsert.mockRejectedValue(dbError);

      await expect(
        service.findOrCreateByGoogleProfile(profile),
      ).rejects.toThrow('Unique constraint failed on the fields: (`email`)');
    });
  });
});
