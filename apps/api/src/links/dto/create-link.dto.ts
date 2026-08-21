import { IsOptional, IsString, IsUrl, Length, Matches } from 'class-validator';

export class CreateLinkDto {
  // require_protocol + an explicit http/https allowlist (validator.js's default also permits
  // ftp: - no legitimate use case for a link shortener, just needless surface). Redirecting to
  // an arbitrary http(s) URL is the product's entire purpose (Semgrep's generic
  // nestjs-open-redirect rule flags this pattern - accepted by design, see
  // docs/stage-6-testing-qa.md's Semgrep section for the full reasoning), so the mitigation
  // here is protocol allowlisting, not blocking dynamic redirects altogether.
  @IsUrl({ require_protocol: true, protocols: ['http', 'https'] })
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
