import { ConfigService } from '@nestjs/config';

// Single source of truth for JWT_SECRET, used by BOTH the signing side (AuthModule's
// JwtModule.registerAsync) and the verification side (JwtStrategy) - they must use the exact
// same value or tokens signed by one would never verify against the other.
//
// An earlier security review flagged that both sides previously fell back to a shared
// hardcoded string when JWT_SECRET was unset: if that env var were ever
// missing in a real deployment, the app would keep running and silently sign/verify tokens
// with a value that's public in this repo's source - anyone could forge a valid JWT for any
// user offline and fully bypass authentication. Fail fast instead: refuse to start.
export function getRequiredJwtSecret(config: ConfigService): string {
  const secret = config.get<string>('JWT_SECRET');
  if (!secret) {
    throw new Error(
      'JWT_SECRET is not set in apps/api/.env - generate one: ' +
        `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`,
    );
  }
  return secret;
}
