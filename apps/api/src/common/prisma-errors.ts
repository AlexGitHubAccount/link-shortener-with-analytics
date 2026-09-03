import { Prisma } from '@prisma/client';

// True when `error` is a Prisma P2002 (unique constraint violation). With `field`, also checks
// the violation was on that column.
//
// `error.meta.target` shape is NOT stable across Prisma versions / DB adapters: it can be the
// column-name array (`['email']`), a constraint-name array (`['User_email_key']`), or a plain
// string - and it can be absent entirely. Postgres + Prisma 6 (`prisma-client-js`) returns the
// column-name array here (verified against the running DB), but callers that branch on the
// field must not 500 if a future upgrade changes it. So: stringify whatever target is and
// substring-match the field name. `'User_email_key'.includes('email')` is true and
// `'User_googleId_key'.includes('googleId')` is true, with no cross-match between the two.
// If `target` is absent, a field-specific check can't be satisfied - callers that need to
// attribute an unattributable P2002 should fall back to a re-read (see
// UsersService.findOrCreateByGoogleProfile).
export function isUniqueConstraintViolation(
  error: unknown,
  field?: string,
): boolean {
  if (
    !(error instanceof Prisma.PrismaClientKnownRequestError) ||
    error.code !== 'P2002'
  ) {
    return false;
  }
  if (field === undefined) {
    return true;
  }
  const target = error.meta?.target;
  const asString = Array.isArray(target)
    ? target.join(',')
    : typeof target === 'string'
      ? target
      : '';
  return asString.includes(field);
}
