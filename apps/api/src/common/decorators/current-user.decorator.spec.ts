import type { Request } from 'express';
import { extractCurrentUserId } from './current-user.decorator';
import type { RequestUser } from '../../auth/strategies/jwt.strategy';

describe('extractCurrentUserId', () => {
  it('returns the userId from req.user (set by JwtStrategy.validate())', () => {
    const req = {
      user: { userId: 'user-42', email: 'a@b.com' },
    } as Request & {
      user: RequestUser;
    };

    expect(extractCurrentUserId(req)).toBe('user-42');
  });
});
