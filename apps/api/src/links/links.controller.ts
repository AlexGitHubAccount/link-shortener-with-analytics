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
import { Link } from '@prisma/client';
import { LinksService } from './links.service';
import { CreateLinkDto } from './dto/create-link.dto';
import { UpdateLinkDto } from './dto/update-link.dto';

// TODO(stage-4): add an auth guard once Google OAuth lands — these endpoints are intentionally
// public for now, and LinksService attributes everything to one placeholder user in the meantime.
@Controller('links')
export class LinksController {
  constructor(private readonly linksService: LinksService) {}

  @Post()
  create(@Body() dto: CreateLinkDto): Promise<Link> {
    return this.linksService.create(dto);
  }

  @Get()
  findAll(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ): Promise<Link[]> {
    return this.linksService.findAll(
      page ? Number(page) : undefined,
      limit ? Number(limit) : undefined,
    );
  }

  @Get(':id')
  findOne(@Param('id') id: string): Promise<Link> {
    return this.linksService.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateLinkDto): Promise<Link> {
    return this.linksService.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string): Promise<Link> {
    return this.linksService.remove(id);
  }
}
