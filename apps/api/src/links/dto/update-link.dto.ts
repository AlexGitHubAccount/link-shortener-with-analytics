import { IsBoolean, IsISO8601, IsOptional, IsString } from 'class-validator';

export class UpdateLinkDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsISO8601()
  expiresAt?: string;
}
