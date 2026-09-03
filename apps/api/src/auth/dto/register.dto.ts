import { Transform } from 'class-transformer';
import { IsEmail, IsOptional, IsString, Length } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

const toCanonicalEmail = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;

// Mirrors registerRequestSchema in @link-shortener/shared-types - one validation contract for
// the React form and this endpoint. The password policy (8-128) applies here, at registration
// only; LoginDto validates presence alone.
export class RegisterDto {
  // Canonicalised (trim + lowercase) before validation so the API and the form agree on the
  // stored form; UsersService normalises again at the data layer as the real guarantee.
  @ApiProperty({ example: 'jane@example.com' })
  @Transform(toCanonicalEmail)
  @IsEmail()
  email!: string;

  @ApiProperty({
    example: 'correct horse battery staple',
    minLength: 8,
    maxLength: 128,
  })
  @IsString()
  @Length(8, 128)
  password!: string;

  // An empty string from an untouched form field means "not provided" - normalise it to
  // undefined before validation so it doesn't trip @Length(1, ...). Matches the zod schema's
  // `.or(z.literal('').transform(() => undefined))`.
  @ApiPropertyOptional({ example: 'Jane Doe', minLength: 1, maxLength: 80 })
  @Transform(({ value }: { value: unknown }) =>
    value === '' ? undefined : value,
  )
  @IsOptional()
  @IsString()
  @Length(1, 80)
  displayName?: string;
}
