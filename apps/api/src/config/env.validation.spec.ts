import { envValidationSchema } from './env.validation';

// envValidationSchema is what ConfigModule.forRoot({ validate }) runs against process.env at
// boot. These tests exercise it directly the same way ConfigModule would: schema.validate(obj).

const MINIMAL_VALID = {
  DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
};

describe('envValidationSchema', () => {
  describe('happy path', () => {
    it('accepts a fully-specified environment and coerces PORT to a number', () => {
      const { error, value } = envValidationSchema.validate({
        NODE_ENV: 'production',
        PORT: '8080',
        DATABASE_URL: 'postgres://u:p@db.example.com:5432/prod',
        JWT_EXPIRES_IN: '1h',
        FRONTEND_URL: 'https://app.example.com',
        GOOGLE_CALLBACK_URL: 'https://api.example.com/auth/google/callback',
        GOOGLE_CLIENT_ID: 'client-id',
        GOOGLE_CLIENT_SECRET: 'client-secret',
        ALLOWED_ORIGINS: 'https://app.example.com,https://example.com',
      });

      expect(error).toBeUndefined();
      expect(value.PORT).toBe(8080);
      expect(typeof value.PORT).toBe('number');
      expect(value.NODE_ENV).toBe('production');
    });

    it('fills every optional variable with its documented default when only DATABASE_URL is given', () => {
      const { error, value } = envValidationSchema.validate({
        ...MINIMAL_VALID,
      });

      expect(error).toBeUndefined();
      expect(value).toMatchObject({
        NODE_ENV: 'development',
        PORT: 4000,
        JWT_EXPIRES_IN: '7d',
        FRONTEND_URL: 'http://localhost:5173',
        GOOGLE_CALLBACK_URL: 'http://localhost:4000/auth/google/callback',
        GOOGLE_CLIENT_ID: '',
        GOOGLE_CLIENT_SECRET: '',
        ALLOWED_ORIGINS: 'http://localhost:5173,http://localhost:3000',
      });
    });

    it('passes through unrelated env vars the host/CI/shell sets (unknown: true)', () => {
      const { error, value } = envValidationSchema.validate({
        ...MINIMAL_VALID,
        HOME: '/home/runner',
        CI: 'true',
      });

      expect(error).toBeUndefined();
      expect(value.HOME).toBe('/home/runner');
    });

    it('allows GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET to be explicitly empty', () => {
      const { error } = envValidationSchema.validate({
        ...MINIMAL_VALID,
        GOOGLE_CLIENT_ID: '',
        GOOGLE_CLIENT_SECRET: '',
      });

      expect(error).toBeUndefined();
    });
  });

  describe('error paths', () => {
    it('rejects a missing DATABASE_URL and names the variable', () => {
      const { error } = envValidationSchema.validate({});

      expect(error).toBeDefined();
      expect(error?.message).toContain('DATABASE_URL');
    });

    it('rejects a DATABASE_URL whose scheme is not postgres/postgresql', () => {
      const { error } = envValidationSchema.validate({
        DATABASE_URL: 'mysql://user:pass@localhost:3306/db',
      });

      expect(error).toBeDefined();
      expect(error?.message).toContain('DATABASE_URL');
    });

    it('rejects an unknown NODE_ENV value', () => {
      const { error } = envValidationSchema.validate({
        ...MINIMAL_VALID,
        NODE_ENV: 'staging',
      });

      expect(error).toBeDefined();
      expect(error?.message).toContain('NODE_ENV');
    });

    it('rejects a non-numeric PORT', () => {
      const { error } = envValidationSchema.validate({
        ...MINIMAL_VALID,
        PORT: 'not-a-port',
      });

      expect(error).toBeDefined();
      expect(error?.message).toContain('PORT');
    });

    it('does NOT require JWT_SECRET (owned by jwt-secret.ts, intentionally left out)', () => {
      const { error } = envValidationSchema.validate({ ...MINIMAL_VALID });

      expect(error).toBeUndefined();
    });
  });
});
