import { IsOptional, IsString, IsUrl, Length, Matches } from 'class-validator';

export class CreateLinkDto {
  @IsUrl({ require_protocol: true })
  originalUrl!: string;

  // If omitted, LinksService generates a random URL-safe code via nanoid.
  @IsOptional()
  @IsString()
  @Length(3, 20)
  @Matches(/^[a-zA-Z0-9]+$/, {
    message: 'customCode must contain only letters and digits',
  })
  customCode?: string;

  @IsOptional()
  @IsString()
  title?: string;
}
