import { Test, TestingModule } from '@nestjs/testing';
import {
  ConflictException,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { LinksService } from './links.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateLinkDto } from './dto/create-link.dto';
import { UpdateLinkDto } from './dto/update-link.dto';

// A 7-char short code drawn from the URL-safe alphabet defined in links.service.ts
// (digits 2-9, uppercase without I/O, lowercase without l/o).
const SHORT_CODE_PATTERN =
  /^[23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz]{7}$/;

function makeUniqueConstraintError(target: string[]) {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: '6.0.0',
    meta: { target },
  });
}

describe('LinksService', () => {
  let service: LinksService;
  let prisma: {
    link: {
      create: jest.Mock;
      findMany: jest.Mock;
      findFirst: jest.Mock;
      findUnique: jest.Mock;
      updateMany: jest.Mock;
    };
  };

  const userId = 'user-1';

  beforeEach(async () => {
    prisma = {
      link: {
        create: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        updateMany: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [LinksService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get<LinksService>(LinksService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('generates a URL-safe 7-char shortCode when no customCode is given', async () => {
      const dto: CreateLinkDto = { originalUrl: 'https://example.com' };
      prisma.link.create.mockResolvedValue({
        id: 'link-1',
        userId,
        originalUrl: dto.originalUrl,
        shortCode: 'abc1234',
        isCustomAlias: false,
        title: undefined,
      });

      await service.create(userId, dto);

      expect(prisma.link.create).toHaveBeenCalledTimes(1);
      const callArg = prisma.link.create.mock.calls[0][0];
      expect(callArg.data.userId).toBe(userId);
      expect(callArg.data.originalUrl).toBe(dto.originalUrl);
      expect(callArg.data.isCustomAlias).toBe(false);
      expect(callArg.data.shortCode).toMatch(SHORT_CODE_PATTERN);
    });

    it('rejects a reserved-word customCode with ConflictException, without touching prisma', async () => {
      const dto: CreateLinkDto = {
        originalUrl: 'https://example.com',
        customCode: 'Health', // reserved set stores lowercase; check is case-insensitive
      };

      await expect(service.create(userId, dto)).rejects.toThrow(
        ConflictException,
      );
      expect(prisma.link.create).not.toHaveBeenCalled();
    });

    it('maps a P2002 unique-constraint violation on shortCode to ConflictException for a custom code', async () => {
      const dto: CreateLinkDto = {
        originalUrl: 'https://example.com',
        customCode: 'mycode',
      };
      prisma.link.create.mockRejectedValue(
        makeUniqueConstraintError(['shortCode']),
      );

      await expect(service.create(userId, dto)).rejects.toThrow(
        ConflictException,
      );
      expect(prisma.link.create).toHaveBeenCalledTimes(1);
      expect(prisma.link.create.mock.calls[0][0].data.shortCode).toBe('mycode');
    });

    it('retries random-code generation on collision and eventually gives up with InternalServerErrorException', async () => {
      const dto: CreateLinkDto = { originalUrl: 'https://example.com' };
      prisma.link.create.mockRejectedValue(
        makeUniqueConstraintError(['shortCode']),
      );

      await expect(service.create(userId, dto)).rejects.toThrow(
        InternalServerErrorException,
      );
      // MAX_SHORT_CODE_GENERATION_ATTEMPTS = 5
      expect(prisma.link.create).toHaveBeenCalledTimes(5);
    });
  });

  describe('findAll', () => {
    it('computes skip/take from page and limit and scopes to userId', async () => {
      prisma.link.findMany.mockResolvedValue([]);

      await service.findAll(userId, 3, 10);

      expect(prisma.link.findMany).toHaveBeenCalledWith({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        skip: 20, // (3 - 1) * 10
        take: 10,
      });
    });

    it('falls back to defaults for a non-finite page and clamps limit above 100', async () => {
      prisma.link.findMany.mockResolvedValue([]);

      await service.findAll(userId, Number.NaN, 500);

      expect(prisma.link.findMany).toHaveBeenCalledWith({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        skip: 0, // page falls back to 1
        take: 100, // clamped
      });
    });
  });

  describe('findOne', () => {
    it('returns the link when prisma finds it', async () => {
      const link = { id: 'link-1', userId, shortCode: 'abc1234' };
      prisma.link.findFirst.mockResolvedValue(link);

      const result = await service.findOne(userId, 'link-1');

      expect(result).toBe(link);
      expect(prisma.link.findFirst).toHaveBeenCalledWith({
        where: { id: 'link-1', userId },
      });
    });

    it('throws NotFoundException when prisma returns null', async () => {
      prisma.link.findFirst.mockResolvedValue(null);

      await expect(service.findOne(userId, 'missing-id')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('update', () => {
    it('scopes the update write by { id, userId } via updateMany and returns the refreshed link', async () => {
      const existing = { id: 'link-1', userId, title: 'old' };
      const updated = { id: 'link-1', userId, title: 'new' };
      prisma.link.findFirst
        .mockResolvedValueOnce(existing) // pre-update ownership check
        .mockResolvedValueOnce(updated); // post-update refetch
      prisma.link.updateMany.mockResolvedValue({ count: 1 });

      const dto: UpdateLinkDto = { title: 'new' };
      const result = await service.update(userId, 'link-1', dto);

      expect(prisma.link.updateMany).toHaveBeenCalledWith({
        where: { id: 'link-1', userId },
        data: { title: 'new' },
      });
      expect(result).toBe(updated);
    });

    it('throws NotFoundException when the pre-check findOne fails to find the link', async () => {
      prisma.link.findFirst.mockResolvedValue(null);

      await expect(
        service.update(userId, 'missing-id', { title: 'new' }),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.link.updateMany).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when updateMany matches zero rows despite passing the pre-check', async () => {
      // Simulates a race: the row existed at findOne time but is gone/reassigned by the write.
      prisma.link.findFirst.mockResolvedValue({ id: 'link-1', userId });
      prisma.link.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        service.update(userId, 'link-1', { title: 'new' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('remove', () => {
    it('soft-deletes by setting isActive false via updateMany scoped to { id, userId }', async () => {
      const existing = { id: 'link-1', userId, isActive: true };
      const deactivated = { id: 'link-1', userId, isActive: false };
      prisma.link.findFirst
        .mockResolvedValueOnce(existing)
        .mockResolvedValueOnce(deactivated);
      prisma.link.updateMany.mockResolvedValue({ count: 1 });

      const result = await service.remove(userId, 'link-1');

      expect(prisma.link.updateMany).toHaveBeenCalledWith({
        where: { id: 'link-1', userId },
        data: { isActive: false },
      });
      expect(result).toBe(deactivated);
    });

    it('throws NotFoundException when updateMany matches zero rows', async () => {
      prisma.link.findFirst.mockResolvedValue({ id: 'link-1', userId });
      prisma.link.updateMany.mockResolvedValue({ count: 0 });

      await expect(service.remove(userId, 'link-1')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('findByShortCode', () => {
    it('looks up by shortCode only, unscoped by userId', async () => {
      const link = { id: 'link-1', shortCode: 'abc1234' };
      prisma.link.findUnique.mockResolvedValue(link);

      const result = await service.findByShortCode('abc1234');

      expect(prisma.link.findUnique).toHaveBeenCalledWith({
        where: { shortCode: 'abc1234' },
      });
      expect(result).toBe(link);
    });

    it('returns null instead of throwing when no link matches', async () => {
      prisma.link.findUnique.mockResolvedValue(null);

      const result = await service.findByShortCode('nope');

      expect(result).toBeNull();
    });
  });
});
