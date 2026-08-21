import { IsBoolean, IsISO8601, IsOptional, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateLinkDto {
  @ApiPropertyOptional({ example: 'My homepage' })
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional({
    description:
      'Soft-disable a link without deleting it - redirect returns 404 while false',
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({
    example: '2026-12-31T23:59:59.000Z',
    description: 'ISO 8601 timestamp; redirect 404s after this date',
  })
  @IsOptional()
  @IsISO8601()
  expiresAt?: string;
}
