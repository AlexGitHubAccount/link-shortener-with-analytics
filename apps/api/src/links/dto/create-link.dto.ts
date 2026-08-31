import { IsOptional, IsString, IsUrl, Length, Matches } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateLinkDto {
  // require_protocol + an explicit http/https allowlist (validator.js's default also permits
  // ftp: - no legitimate use case for a link shortener, just needless surface). Redirecting to
  // an arbitrary http(s) URL is the product's entire purpose (Semgrep's generic
  // nestjs-open-redirect rule flags this pattern - accepted by design, see the Semgrep
  // entry in CLAUDE.md's Troubleshooting section for the full reasoning), so the mitigation
  // here is protocol allowlisting, not blocking dynamic redirects altogether.
  @ApiProperty({
    example: 'https://example.com/some/long/path',
    description: 'Must be http(s) with an explicit protocol',
  })
  @IsUrl({ require_protocol: true, protocols: ['http', 'https'] })
  originalUrl!: string;

  // If omitted, LinksService generates a random URL-safe code via nanoid.
  @ApiPropertyOptional({
    example: 'my-link',
    minLength: 3,
    maxLength: 20,
    description: 'Letters and digits only. Random if omitted.',
  })
  @IsOptional()
  @IsString()
  @Length(3, 20)
  @Matches(/^[a-zA-Z0-9]+$/, {
    message: 'customCode must contain only letters and digits',
  })
  customCode?: string;

  @ApiPropertyOptional({ example: 'My homepage' })
  @IsOptional()
  @IsString()
  title?: string;
}
