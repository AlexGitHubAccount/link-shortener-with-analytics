import {
  ConflictException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { Link, Prisma } from '@prisma/client';
import { customAlphabet } from 'nanoid';
import { PrismaService } from '../prisma/prisma.service';
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

// TODO(stage-4): replace this module-wide placeholder user with the real authenticated user
// (via @CurrentUser()) once Google OAuth lands. Link.userId is a required FK in the schema —
// every link must belong to someone even before real login exists, so we seed one service
// account and attribute all pre-auth links to it. See docs/stage-2-backend-core.md.
const PLACEHOLDER_USER = {
  googleId: 'stage2-placeholder',
  email: 'placeholder@local',
  displayName: 'Stage 2 placeholder user',
};

@Injectable()
export class LinksService implements OnModuleInit {
  private placeholderUserId!: string;

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    const user = await this.prisma.user.upsert({
      where: { googleId: PLACEHOLDER_USER.googleId },
      update: {},
      create: PLACEHOLDER_USER,
    });
    this.placeholderUserId = user.id;
  }

  async create(dto: CreateLinkDto): Promise<Link> {
    if (dto.customCode) {
      if (RESERVED_SHORT_CODES.has(dto.customCode.toLowerCase())) {
        throw new ConflictException(
          `"${dto.customCode}" is a reserved word and can't be used as a custom code`,
        );
      }
      return this.createWithCode(dto, dto.customCode, true);
    }

    for (
      let attempt = 0;
      attempt < MAX_SHORT_CODE_GENERATION_ATTEMPTS;
      attempt++
    ) {
      try {
        return await this.createWithCode(dto, generateShortCode(), false);
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
    dto: CreateLinkDto,
    shortCode: string,
    isCustomAlias: boolean,
  ): Promise<Link> {
    try {
      return await this.prisma.link.create({
        data: {
          userId: this.placeholderUserId,
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

  async findAll(page = 1, limit = 20): Promise<Link[]> {
    const safePage = Math.max(1, Number.isFinite(page) ? page : 1);
    const safeLimit = Math.min(
      Math.max(1, Number.isFinite(limit) ? limit : 20),
      100,
    );

    return this.prisma.link.findMany({
      where: { userId: this.placeholderUserId },
      orderBy: { createdAt: 'desc' },
      skip: (safePage - 1) * safeLimit,
      take: safeLimit,
    });
  }

  async findOne(id: string): Promise<Link> {
    const link = await this.prisma.link.findFirst({
      where: { id, userId: this.placeholderUserId },
    });
    if (!link) {
      throw new NotFoundException(`Link "${id}" not found`);
    }
    return link;
  }

  // Used by RedirectModule — deliberately NOT scoped to placeholderUserId: the public redirect
  // must resolve any shortCode regardless of owner, unlike the private CRUD methods above.
  // Returns null instead of throwing so the caller can distinguish 404 (no such code) from
  // 410 Gone (code exists but inactive/expired).
  async findByShortCode(shortCode: string): Promise<Link | null> {
    return this.prisma.link.findUnique({ where: { shortCode } });
  }

  async update(id: string, dto: UpdateLinkDto): Promise<Link> {
    await this.findOne(id); // 404 if missing / not owned, before attempting the update

    return this.prisma.link.update({
      where: { id },
      data: {
        ...(dto.title !== undefined && { title: dto.title }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
        ...(dto.expiresAt !== undefined && {
          expiresAt: new Date(dto.expiresAt),
        }),
      },
    });
  }

  // Soft-delete: keep the row (and its Click history) around, just deactivate it.
  // Redirect treats isActive=false as 410 Gone rather than resolving it.
  async remove(id: string): Promise<Link> {
    await this.findOne(id);
    return this.prisma.link.update({
      where: { id },
      data: { isActive: false },
    });
  }
}

function isUniqueConstraintViolation(error: unknown, target: string): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002' &&
    (error.meta?.target as string[] | undefined)?.includes(target) === true
  );
}
