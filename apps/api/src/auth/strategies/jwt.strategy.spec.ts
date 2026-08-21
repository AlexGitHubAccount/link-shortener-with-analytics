import { ConfigService } from '@nestjs/config';
import { JwtStrategy } from './jwt.strategy';

describe('JwtStrategy', () => {
  describe('constructor', () => {
    it('constructs successfully when JWT_SECRET is configured', () => {
      const config = {
        get: jest.fn().mockReturnValue('a-real-jwt-secret-value'),
      } as unknown as ConfigService;

      expect(() => new JwtStrategy(config)).not.toThrow();
      expect(config.get).toHaveBeenCalledWith('JWT_SECRET');
    });

    it('throws when JWT_SECRET is not configured (fail-fast via getRequiredJwtSecret)', () => {
      const config = {
        get: jest.fn().mockReturnValue(undefined),
      } as unknown as ConfigService;

      expect(() => new JwtStrategy(config)).toThrow(
        /JWT_SECRET is not set in apps\/api\/\.env/,
      );
    });
  });

  describe('validate', () => {
    const config = {
      get: jest.fn().mockReturnValue('a-real-jwt-secret-value'),
    } as unknown as ConfigService;
    const strategy = new JwtStrategy(config);

    it('maps a valid JWT payload to a RequestUser (happy path)', () => {
      const result = strategy.validate({
        sub: 'user-123',
        email: 'alice@example.com',
      });

      expect(result).toEqual({
        userId: 'user-123',
        email: 'alice@example.com',
      });
    });

    it('passes through payload fields verbatim, including an empty email (edge case)', () => {
      const result = strategy.validate({ sub: 'user-456', email: '' });

      expect(result).toEqual({ userId: 'user-456', email: '' });
    });
  });
});
