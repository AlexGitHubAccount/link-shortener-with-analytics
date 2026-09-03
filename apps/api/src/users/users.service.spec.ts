import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException } from '@nestjs/common';
import { Prisma, User } from '@prisma/client';
import { UsersService } from './users.service';
import { PrismaService } from '../prisma/prisma.service';
import type { GoogleProfile } from '../auth/strategies/google.strategy';

describe('UsersService', () => {
  let service: UsersService;
  let prisma: {
    user: {
      findUnique: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
  };

  const makeUser = (overrides: Partial<User> = {}): User => ({
    id: 'user-1',
    googleId: 'google-123',
    email: 'alice@example.com',
    passwordHash: null,
    displayName: 'Alice',
    avatarUrl: 'https://example.com/avatar.png',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  });

  beforeEach(async () => {
    prisma = {
      user: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
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

      expect(result).toBeNull();
    });
  });

  describe('findByEmail', () => {
    it('looks the user up by unique email', async () => {
      const user = makeUser();
      prisma.user.findUnique.mockResolvedValue(user);

      const result = await service.findByEmail('alice@example.com');

      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { email: 'alice@example.com' },
      });
      expect(result).toEqual(user);
    });

    it('normalizes (trim + lowercase) the email before the lookup', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await service.findByEmail('  Alice@Example.COM  ');

      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { email: 'alice@example.com' },
      });
    });

    it('returns null when no user has that email', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      const result = await service.findByEmail('nobody@example.com');

      expect(result).toBeNull();
    });
  });

  describe('createPasswordUser', () => {
    it('creates a password-only user (no googleId) with a normalized email and the given hash', async () => {
      const created = makeUser({
        googleId: null,
        passwordHash: 'argon2-hash',
        displayName: 'Bob',
      });
      prisma.user.create.mockResolvedValue(created);

      const result = await service.createPasswordUser({
        email: '  Bob@Example.COM ',
        passwordHash: 'argon2-hash',
        displayName: 'Bob',
      });

      expect(prisma.user.create).toHaveBeenCalledWith({
        data: {
          email: 'bob@example.com',
          passwordHash: 'argon2-hash',
          displayName: 'Bob',
        },
      });
      expect(result).toEqual(created);
    });

    it('stores null displayName when none is provided', async () => {
      prisma.user.create.mockResolvedValue(makeUser());

      await service.createPasswordUser({
        email: 'bob@example.com',
        passwordHash: 'argon2-hash',
      });

      expect(prisma.user.create).toHaveBeenCalledWith({
        data: {
          email: 'bob@example.com',
          passwordHash: 'argon2-hash',
          displayName: null,
        },
      });
    });
  });

  describe('findOrCreateByGoogleProfile', () => {
    const profile: GoogleProfile = {
      googleId: 'google-456',
      email: 'bob@example.com',
      displayName: 'Bob',
      avatarUrl: 'https://example.com/bob.png',
    };

    const p2002 = (target?: string[]): Prisma.PrismaClientKnownRequestError =>
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: '6.0.0',
        ...(target === undefined ? {} : { meta: { target } }),
      });

    it('refreshes email (normalized) + displayName + avatarUrl when a user already matches by googleId (happy path)', async () => {
      const existing = makeUser({
        id: 'user-2',
        googleId: profile.googleId,
        email: 'old@example.com',
      });
      const updated = makeUser({ id: 'user-2', ...profile });
      prisma.user.findUnique.mockResolvedValueOnce(existing); // by googleId
      prisma.user.update.mockResolvedValue(updated);

      const result = await service.findOrCreateByGoogleProfile({
        ...profile,
        email: '  Bob@Example.COM ', // Google-side change, non-canonical
      });

      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { googleId: profile.googleId },
      });
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-2' },
        data: {
          email: 'bob@example.com',
          displayName: profile.displayName,
          avatarUrl: profile.avatarUrl,
        },
      });
      expect(prisma.user.create).not.toHaveBeenCalled();
      expect(result).toEqual(updated);
    });

    it('maps a P2002 on the googleId-match email refresh to ConflictException (not a raw 500)', async () => {
      const existing = makeUser({ id: 'user-2', googleId: profile.googleId });
      prisma.user.findUnique.mockResolvedValueOnce(existing); // by googleId
      prisma.user.update.mockRejectedValue(p2002(['email']));

      await expect(
        service.findOrCreateByGoogleProfile(profile),
      ).rejects.toThrow(ConflictException);
    });

    it('rethrows a non-P2002 error from the googleId-match update', async () => {
      const existing = makeUser({ id: 'user-2', googleId: profile.googleId });
      prisma.user.findUnique.mockResolvedValueOnce(existing);
      prisma.user.update.mockRejectedValue(new Error('connection lost'));

      await expect(
        service.findOrCreateByGoogleProfile(profile),
      ).rejects.toThrow('connection lost');
    });

    it('never looks up by email and creates a fresh user with a normalized email', async () => {
      const mixedCase: GoogleProfile = {
        ...profile,
        email: '  Bob@Example.COM ',
      };
      const created = makeUser({ id: 'user-4', ...profile });
      prisma.user.findUnique.mockResolvedValueOnce(null); // by googleId
      prisma.user.create.mockResolvedValue(created);

      const result = await service.findOrCreateByGoogleProfile(mixedCase);

      // exactly one findUnique, keyed on googleId - no email lookup
      expect(prisma.user.findUnique).toHaveBeenCalledTimes(1);
      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { googleId: profile.googleId },
      });
      expect(prisma.user.update).not.toHaveBeenCalled();
      expect(prisma.user.create).toHaveBeenCalledWith({
        data: {
          googleId: profile.googleId,
          email: 'bob@example.com',
          displayName: profile.displayName,
          avatarUrl: profile.avatarUrl,
        },
      });
      expect(result).toEqual(created);
    });

    it('throws ConflictException when create fails and no row exists by googleId (email collision with a password account)', async () => {
      prisma.user.findUnique
        .mockResolvedValueOnce(null) // by googleId, before create
        .mockResolvedValueOnce(null); // by googleId, after the failed create -> must be email
      prisma.user.create.mockRejectedValue(p2002(['email']));

      await expect(
        service.findOrCreateByGoogleProfile(profile),
      ).rejects.toThrow(ConflictException);
    });

    it('still throws ConflictException when the P2002 target is a constraint name, not a column name', async () => {
      // A mixed-case Google email whose lower(trim()) already belongs to a password account -
      // the exact pre-hijacking case finding #1 says slips through case-sensitively. The insert
      // now hits the email unique index; attribution must not depend on meta.target's shape.
      prisma.user.findUnique
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null);
      prisma.user.create.mockRejectedValue(p2002(['User_email_key']));

      await expect(
        service.findOrCreateByGoogleProfile({
          ...profile,
          email: 'Bob@Example.com',
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('recovers from a concurrent-Google-login race by re-reading the row that won (P2002, target shape irrelevant)', async () => {
      const raced = makeUser({ id: 'user-5', ...profile });
      prisma.user.findUnique
        .mockResolvedValueOnce(null) // by googleId, before create
        .mockResolvedValueOnce(raced); // by googleId, after the failed create
      prisma.user.create.mockRejectedValue(p2002()); // no meta.target at all

      const result = await service.findOrCreateByGoogleProfile(profile);

      expect(result).toEqual(raced);
    });

    it('rethrows a non-P2002 error from create', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockRejectedValue(new Error('connection lost'));

      await expect(
        service.findOrCreateByGoogleProfile(profile),
      ).rejects.toThrow('connection lost');
    });
  });
});
