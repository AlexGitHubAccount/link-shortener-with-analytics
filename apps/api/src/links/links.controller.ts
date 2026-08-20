import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import type { Link } from '@link-shortener/shared-types';
import { LinksService } from './links.service';
import { CreateLinkDto } from './dto/create-link.dto';
import { UpdateLinkDto } from './dto/update-link.dto';

// TODO(stage-4): add an auth guard once Google OAuth lands — these endpoints are intentionally
// public for now, and LinksService attributes everything to one placeholder user in the meantime.
@Controller('links')
export class LinksController {
  constructor(private readonly linksService: LinksService) {}

  // LinksService returns @prisma/client's Link (expiresAt: Date, not the JSON-serialized
  // string shared-types documents for the frontend) — cast at this boundary, same pattern
  // as HealthController, rather than fight the type mismatch or return `any`.
  @Post()
  create(@Body() dto: CreateLinkDto): Promise<Link> {
    return this.linksService.create(dto) as unknown as Promise<Link>;
  }

  @Get()
  findAll(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ): Promise<Link[]> {
    return this.linksService.findAll(
      parsePositiveInt(page),
      parsePositiveInt(limit),
    ) as unknown as Promise<Link[]>;
  }

  @Get(':id')
  findOne(@Param('id') id: string): Promise<Link> {
    return this.linksService.findOne(id) as unknown as Promise<Link>;
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateLinkDto): Promise<Link> {
    return this.linksService.update(id, dto) as unknown as Promise<Link>;
  }

  @Delete(':id')
  remove(@Param('id') id: string): Promise<Link> {
    return this.linksService.remove(id) as unknown as Promise<Link>;
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
