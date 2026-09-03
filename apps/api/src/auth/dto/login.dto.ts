import { Transform } from 'class-transformer';
import { IsEmail, IsString, Length } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

// Mirrors loginRequestSchema in @link-shortener/shared-types. Password is validated for
// PRESENCE only (1-128) - never apply the registration policy at login, and never let the
// policy become a login-time signal about whether an account exists.
export class LoginDto {
  // Canonicalised (trim + lowercase) so a mixed-case login still matches the stored row;
  // UsersService.findByEmail normalises again at the data layer.
  @ApiProperty({ example: 'jane@example.com' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail()
  email!: string;

  @ApiProperty({
    example: 'correct horse battery staple',
    minLength: 1,
    maxLength: 128,
  })
  @IsString()
  @Length(1, 128)
  password!: string;
}
