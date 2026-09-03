import {
  ConflictException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { Link } from '@prisma/client';
import { customAlphabet } from 'nanoid';
import { PrismaService } from '../prisma/prisma.service';
import { isUniqueConstraintViolation } from '../common/prisma-errors';
import { CreateLinkDto } from './dto/create-link.dto';
import { UpdateLinkDto } from './dto/update-link.dto';

// URL-safe alphabet without visually ambiguous characters (0/O, 1/l/I) — short codes are
// user-facing and typed/copied by hand, so avoiding lookalikes reduces misclicks/typos.
const generateShortCode = customAlphabet(
  '23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz',
  7,
);

const MAX_SHORT_CODE_GENERATION_ATTEMPTS = 5;

// RedirectController serves GET /:code at the app root — a single-segment wildcard that
// collides with every other single-segment top-level route (/links, /health, ...). NestJS/Express
// match routes in registration order, so as long as those modules are imported before
// RedirectModule in app.module.ts, the specific routes win. But a user-supplied customCode could
// still collide by explicit choice, so reject anything matching a real top-level route name.
const RESERVED_SHORT_CODES = new Set([
  'links',
  'health',
  'redirect',
  'auth',
  'users',
  'analytics',
  'api',
]);

@Injectable()
export class LinksService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, dto: CreateLinkDto): Promise<Link> {
    if (dto.customCode) {
      if (RESERVED_SHORT_CODES.has(dto.customCode.toLowerCase())) {
        throw new ConflictException(
          `"${dto.customCode}" is a reserved word and can't be used as a custom code`,
        );
      }
      return this.createWithCode(userId, dto, dto.customCode, true);
    }

    for (
      let attempt = 0;
      attempt < MAX_SHORT_CODE_GENERATION_ATTEMPTS;
      attempt++
    ) {
      try {
        return await this.createWithCode(
          userId,
          dto,
          generateShortCode(),
          false,
        );
      } catch (error) {
        if (!isUniqueConstraintViolation(error, 'shortCode')) {
          throw error;
        }
        // extremely rare collision on a random code — just try a new one
      }
    }

    throw new InternalServerErrorException(
      'Could not generate a unique short code, please try again',
    );
  }

  private async createWithCode(
    userId: string,
    dto: CreateLinkDto,
    shortCode: string,
    isCustomAlias: boolean,
  ): Promise<Link> {
    try {
      return await this.prisma.link.create({
        data: {
          userId,
          originalUrl: dto.originalUrl,
          shortCode,
          isCustomAlias,
          title: dto.title,
        },
      });
    } catch (error) {
      if (isUniqueConstraintViolation(error, 'shortCode')) {
        if (isCustomAlias) {
          throw new ConflictException(
            `Short code "${shortCode}" is already taken`,
          );
        }
        throw error; // let the generation retry loop in create() handle it
      }
      throw error;
    }
  }

  async findAll(userId: string, page = 1, limit = 20): Promise<Link[]> {
    const safePage = Math.max(1, Number.isFinite(page) ? page : 1);
    const safeLimit = Math.min(
      Math.max(1, Number.isFinite(limit) ? limit : 20),
      100,
    );

    return this.prisma.link.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      skip: (safePage - 1) * safeLimit,
      take: safeLimit,
    });
  }

  async findOne(userId: string, id: string): Promise<Link> {
    const link = await this.prisma.link.findFirst({
      where: { id, userId },
    });
    if (!link) {
      throw new NotFoundException(`Link "${id}" not found`);
    }
    return link;
  }

  // Used by RedirectModule — deliberately NOT scoped to a userId: the public redirect must
  // resolve any shortCode regardless of owner, unlike the private CRUD methods above.
  // Returns null instead of throwing so the caller can distinguish 404 (no such code) from
  // 410 Gone (code exists but inactive/expired).
  async findByShortCode(shortCode: string): Promise<Link | null> {
    return this.prisma.link.findUnique({ where: { shortCode } });
  }

  async update(userId: string, id: string, dto: UpdateLinkDto): Promise<Link> {
    await this.findOne(userId, id); // 404 if missing / not owned, before attempting the update

    // updateMany (not update) so the WRITE itself is scoped by { id, userId } - not just the
    // preceding findOne check. Prisma's update() requires a unique `where`, which id alone
    // satisfies but id+userId together don't (no compound unique constraint on the schema) -
    // updateMany accepts a plain filter instead, closing the gap between "checked ownership"
    // and "wrote the row" a check-then-act pattern would otherwise leave open. Flagged by
    // an earlier security review as defense-in-depth, not an active exploit as written.
    const result = await this.prisma.link.updateMany({
      where: { id, userId },
      data: {
        ...(dto.title !== undefined && { title: dto.title }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
        ...(dto.expiresAt !== undefined && {
          expiresAt: new Date(dto.expiresAt),
        }),
      },
    });
    if (result.count === 0) {
      throw new NotFoundException(`Link "${id}" not found`);
    }
    return this.findOne(userId, id);
  }

  // Soft-delete: keep the row (and its Click history) around, just deactivate it.
  // Redirect treats isActive=false as 410 Gone rather than resolving it.
  async remove(userId: string, id: string): Promise<Link> {
    await this.findOne(userId, id);
    const result = await this.prisma.link.updateMany({
      where: { id, userId }, // see update() above for why updateMany, not update
      data: { isActive: false },
    });
    if (result.count === 0) {
      throw new NotFoundException(`Link "${id}" not found`);
    }
    return this.findOne(userId, id);
  }
}
