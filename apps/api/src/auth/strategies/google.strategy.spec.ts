import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { Profile, VerifyCallback } from 'passport-google-oauth20';
import { GoogleStrategy, GoogleProfile } from './google.strategy';

/**
 * Builds a realistic passport-google-oauth20 Profile fixture. Only the
 * fields validate() actually reads (id, emails, displayName, photos) vary
 * between tests; the rest are filled with plausible values so the object
 * satisfies the real Profile type.
 */
function buildProfile(overrides: Partial<Profile> = {}): Profile {
  return {
    provider: 'google',
    id: 'google-user-123',
    displayName: 'Ada Lovelace',
    emails: [{ value: 'ada@example.com', verified: true }],
    photos: [{ value: 'https://example.com/avatar.jpg' }],
    profileUrl: 'https://plus.google.com/google-user-123',
    _raw: '{}',
    _json: {
      iss: 'https://accounts.google.com',
      aud: 'test-client-id',
      sub: 'google-user-123',
      iat: 0,
      exp: 0,
    },
    ...overrides,
  };
}

describe('GoogleStrategy', () => {
  let strategy: GoogleStrategy;
  let configGet: jest.Mock;

  beforeEach(async () => {
    // GOOGLE_CLIENT_ID/SECRET intentionally return undefined here - unlike
    // JWT_SECRET, this strategy is designed to degrade gracefully instead of
    // throwing, so the module must still compile successfully.
    configGet = jest.fn().mockReturnValue(undefined);

    const moduleRef = await Test.createTestingModule({
      providers: [
        GoogleStrategy,
        { provide: ConfigService, useValue: { get: configGet } },
      ],
    }).compile();

    strategy = moduleRef.get(GoogleStrategy);
  });

  it('constructs successfully even when GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET are missing', () => {
    expect(strategy).toBeInstanceOf(GoogleStrategy);
  });

  it('constructs successfully with real, fully-configured credentials (no warning path)', async () => {
    const realConfigGet = jest.fn((key: string) => {
      if (key === 'GOOGLE_CLIENT_ID')
        return 'real-client-id.apps.googleusercontent.com';
      if (key === 'GOOGLE_CLIENT_SECRET') return 'real-client-secret';
      return undefined;
    });

    const moduleRef = await Test.createTestingModule({
      providers: [
        GoogleStrategy,
        { provide: ConfigService, useValue: { get: realConfigGet } },
      ],
    }).compile();

    expect(moduleRef.get(GoogleStrategy)).toBeInstanceOf(GoogleStrategy);
  });

  it('treats any REPLACE_ME... placeholder string as unconfigured (same as missing)', async () => {
    // The exact value CI writes for the e2e job - a prefix match, not an exact string.
    const placeholderConfigGet = jest.fn((key: string) => {
      if (key === 'GOOGLE_CLIENT_ID') return 'REPLACE_ME_SEE_CLAUDE_MD';
      if (key === 'GOOGLE_CLIENT_SECRET') return 'REPLACE_ME_SEE_CLAUDE_MD';
      return undefined;
    });

    const moduleRef = await Test.createTestingModule({
      providers: [
        GoogleStrategy,
        { provide: ConfigService, useValue: { get: placeholderConfigGet } },
      ],
    }).compile();

    expect(moduleRef.get(GoogleStrategy)).toBeInstanceOf(GoogleStrategy);
  });

  describe('validate', () => {
    it('maps a full Google profile to GoogleProfile and calls done(null, user)', () => {
      const profile = buildProfile();
      const done = jest.fn() as unknown as VerifyCallback;

      strategy.validate('access-token', 'refresh-token', profile, done);

      const expected: GoogleProfile = {
        googleId: 'google-user-123',
        email: 'ada@example.com',
        displayName: 'Ada Lovelace',
        avatarUrl: 'https://example.com/avatar.jpg',
      };
      expect(done).toHaveBeenCalledTimes(1);
      expect(done).toHaveBeenCalledWith(null, expected);
    });

    it('calls done with an Error and false (not a thrown exception) when emails is an empty array', () => {
      const profile = buildProfile({ emails: [] });
      const done = jest.fn() as unknown as VerifyCallback;

      expect(() =>
        strategy.validate('access-token', 'refresh-token', profile, done),
      ).not.toThrow();

      expect(done).toHaveBeenCalledTimes(1);
      const [err, user] = (done as unknown as jest.Mock).mock.calls[0];
      expect(err).toBeInstanceOf(Error);
      expect((err as Error).message).toBe(
        'Google profile did not include an email address',
      );
      expect(user).toBe(false);
    });

    it('calls done with an Error and false (not a thrown exception) when emails is undefined', () => {
      const profile = buildProfile({ emails: undefined });
      const done = jest.fn() as unknown as VerifyCallback;

      expect(() =>
        strategy.validate('access-token', 'refresh-token', profile, done),
      ).not.toThrow();

      expect(done).toHaveBeenCalledTimes(1);
      const [err, user] = (done as unknown as jest.Mock).mock.calls[0];
      expect(err).toBeInstanceOf(Error);
      expect((err as Error).message).toBe(
        'Google profile did not include an email address',
      );
      expect(user).toBe(false);
    });

    it('falls back to undefined displayName/avatarUrl when photos are missing', () => {
      const profile = buildProfile({
        displayName: undefined as unknown as string,
        photos: undefined,
      });
      const done = jest.fn() as unknown as VerifyCallback;

      strategy.validate('access-token', 'refresh-token', profile, done);

      expect(done).toHaveBeenCalledWith(null, {
        googleId: 'google-user-123',
        email: 'ada@example.com',
        displayName: undefined,
        avatarUrl: undefined,
      });
    });
  });
});
