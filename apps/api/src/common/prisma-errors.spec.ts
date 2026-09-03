import { Prisma } from '@prisma/client';
import { isUniqueConstraintViolation } from './prisma-errors';

const p2002 = (
  target?: string[] | string,
): Prisma.PrismaClientKnownRequestError =>
  new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: '6.0.0',
    ...(target === undefined ? {} : { meta: { target } }),
  });

describe('isUniqueConstraintViolation', () => {
  it('returns false for non-Prisma errors', () => {
    expect(isUniqueConstraintViolation(new Error('boom'))).toBe(false);
    expect(isUniqueConstraintViolation('nope')).toBe(false);
    expect(isUniqueConstraintViolation(undefined)).toBe(false);
  });

  it('returns false for a Prisma error that is not P2002', () => {
    const p2025 = new Prisma.PrismaClientKnownRequestError('Not found', {
      code: 'P2025',
      clientVersion: '6.0.0',
    });
    expect(isUniqueConstraintViolation(p2025)).toBe(false);
    expect(isUniqueConstraintViolation(p2025, 'email')).toBe(false);
  });

  it('returns true for any P2002 when no field is given', () => {
    expect(isUniqueConstraintViolation(p2002(['email']))).toBe(true);
    expect(isUniqueConstraintViolation(p2002())).toBe(true);
  });

  it('matches the column-name array shape (Postgres + Prisma 6)', () => {
    expect(isUniqueConstraintViolation(p2002(['email']), 'email')).toBe(true);
    expect(isUniqueConstraintViolation(p2002(['googleId']), 'googleId')).toBe(
      true,
    );
  });

  it('matches the constraint-name shape (documented cross-version variance)', () => {
    expect(
      isUniqueConstraintViolation(p2002(['User_email_key']), 'email'),
    ).toBe(true);
    expect(
      isUniqueConstraintViolation(p2002(['User_googleId_key']), 'googleId'),
    ).toBe(true);
    // no cross-match between the two User unique constraints
    expect(
      isUniqueConstraintViolation(p2002(['User_email_key']), 'googleId'),
    ).toBe(false);
    expect(
      isUniqueConstraintViolation(p2002(['User_googleId_key']), 'email'),
    ).toBe(false);
  });

  it('matches a plain-string target', () => {
    expect(isUniqueConstraintViolation(p2002('User_email_key'), 'email')).toBe(
      true,
    );
  });

  it('cannot satisfy a field-specific check when target is absent', () => {
    expect(isUniqueConstraintViolation(p2002(), 'email')).toBe(false);
  });
});
