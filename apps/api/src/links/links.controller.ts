import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Link } from '@prisma/client';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { LinksService } from './links.service';
import { CreateLinkDto } from './dto/create-link.dto';
import { UpdateLinkDto } from './dto/update-link.dto';

// Every route here requires a valid JWT (see JwtAuthGuard/JwtStrategy) and is scoped to the
// requesting user via @CurrentUser() - RedirectController is the one public exception.
@ApiTags('links')
@ApiBearerAuth()
@Controller('links')
@UseGuards(JwtAuthGuard)
export class LinksController {
  constructor(private readonly linksService: LinksService) {}

  // Rate limited more tightly than ThrottlerModule's app-wide default (30/60s, tuned for the
  // public redirect) - link creation is the actual abuse surface (spam/phishing link mass
  // creation), not just the redirect that follows it. Tracked per-IP like the redirect guard,
  // same ThrottlerModule storage - a real improvement over no limit at all, though a genuinely
  // malicious authenticated user behind rotating IPs would need per-user tracking (a custom
  // ThrottlerGuard.getTracker() override) to fully close, not done here.
  @ApiOperation({ summary: 'Create a short link owned by the current user' })
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @UseGuards(ThrottlerGuard)
  @Post()
  create(
    @CurrentUser() userId: string,
    @Body() dto: CreateLinkDto,
  ): Promise<Link> {
    return this.linksService.create(userId, dto);
  }

  @ApiOperation({ summary: "List the current user's links, newest first" })
  @Get()
  findAll(
    @CurrentUser() userId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ): Promise<Link[]> {
    return this.linksService.findAll(
      userId,
      parsePositiveInt(page),
      parsePositiveInt(limit),
    );
  }

  @ApiOperation({
    summary: 'Get a single link by id (404 if not owned by the current user)',
  })
  @Get(':id')
  findOne(
    @CurrentUser() userId: string,
    @Param('id') id: string,
  ): Promise<Link> {
    return this.linksService.findOne(userId, id);
  }

  @ApiOperation({ summary: "Update a link's title/active flag/expiry" })
  @Patch(':id')
  update(
    @CurrentUser() userId: string,
    @Param('id') id: string,
    @Body() dto: UpdateLinkDto,
  ): Promise<Link> {
    return this.linksService.update(userId, id, dto);
  }

  @ApiOperation({ summary: 'Soft-delete a link' })
  @Delete(':id')
  remove(
    @CurrentUser() userId: string,
    @Param('id') id: string,
  ): Promise<Link> {
    return this.linksService.remove(userId, id);
  }
}

// Rejects non-integer/fractional query values (e.g. "1.5") instead of silently truncating —
// LinksService.findAll clamps to a safe range, but a fractional page/limit reaching it
// unnoticed would still be a caller mistake worth falling back to the default, not honoring.
function parsePositiveInt(value?: string): number | undefined {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}
