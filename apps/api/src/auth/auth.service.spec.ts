import { Test, TestingModule } from '@nestjs/testing';
import {
  ConflictException,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { hash, verify } from '@node-rs/argon2';
import { Prisma, User } from '@prisma/client';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';

// Real argon2 is slow (by design) - unit tests mock it and assert on the calls instead.
jest.mock('@node-rs/argon2', () => ({
  hash: jest.fn().mockResolvedValue('argon2-hash'),
  verify: jest.fn(),
}));

const hashMock = hash as jest.MockedFunction<typeof hash>;
const verifyMock = verify as jest.MockedFunction<typeof verify>;

describe('AuthService', () => {
  let service: AuthService;
  let usersService: {
    findByEmail: jest.Mock;
    createPasswordUser: jest.Mock;
  };
  let jwtService: { sign: jest.Mock };

  const passwordUser = (overrides: Partial<User> = {}): User => ({
    id: 'user-1',
    googleId: null,
    email: 'jane@example.com',
    passwordHash: 'stored-hash',
    displayName: 'Jane',
    avatarUrl: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  });

  beforeEach(async () => {
    usersService = {
      findByEmail: jest.fn(),
      createPasswordUser: jest.fn(),
    };
    jwtService = { sign: jest.fn().mockReturnValue('signed.jwt.token') };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UsersService, useValue: usersService },
        { provide: JwtService, useValue: jwtService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('register', () => {
    it('hashes the password, creates the user, and returns a signed token (happy path)', async () => {
      usersService.findByEmail.mockResolvedValue(null);
      const created = passwordUser({ passwordHash: 'argon2-hash' });
      usersService.createPasswordUser.mockResolvedValue(created);

      const result = await service.register({
        email: 'jane@example.com',
        password: 'a-good-password',
        displayName: 'Jane',
      });

      expect(hashMock).toHaveBeenCalledWith('a-good-password');
      expect(usersService.createPasswordUser).toHaveBeenCalledWith({
        email: 'jane@example.com',
        passwordHash: 'argon2-hash',
        displayName: 'Jane',
      });
      expect(jwtService.sign).toHaveBeenCalledWith({
        sub: created.id,
        email: created.email,
        jti: expect.stringMatching(/^[0-9a-f-]{36}$/) as string,
      });
      expect(result).toEqual({ token: 'signed.jwt.token' });
    });

    it('throws ConflictException when the email is already registered (error path)', async () => {
      usersService.findByEmail.mockResolvedValue(passwordUser());

      await expect(
        service.register({
          email: 'jane@example.com',
          password: 'a-good-password',
        }),
      ).rejects.toThrow(ConflictException);
      expect(usersService.createPasswordUser).not.toHaveBeenCalled();
      expect(hashMock).not.toHaveBeenCalled();
    });

    it.each([
      ['column-name target', ['email']],
      ['constraint-name target', ['User_email_key']],
      ['absent target', undefined],
    ])(
      'collapses a create-time unique race (P2002, %s) to the same ConflictException, not a 500',
      async (_label, target) => {
        usersService.findByEmail.mockResolvedValue(null); // pre-check passes
        usersService.createPasswordUser.mockRejectedValue(
          new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
            code: 'P2002',
            clientVersion: '6.0.0',
            ...(target ? { meta: { target } } : {}),
          }),
        );

        await expect(
          service.register({
            email: 'jane@example.com',
            password: 'a-good-password',
          }),
        ).rejects.toThrow(new ConflictException('Email already registered'));
      },
    );

    it('rethrows a non-P2002 error from createPasswordUser', async () => {
      usersService.findByEmail.mockResolvedValue(null);
      usersService.createPasswordUser.mockRejectedValue(
        new Error('connection lost'),
      );

      await expect(
        service.register({
          email: 'jane@example.com',
          password: 'a-good-password',
        }),
      ).rejects.toThrow('connection lost');
    });
  });

  describe('login', () => {
    // NOTE: must be the first test in this block - it relies on getDummyHash()'s module-level
    // memo being pristine (no earlier login test has warmed it yet; register tests never touch
    // it). Verifies a dummy-hash failure funnels to the same generic 401 as the real-password
    // branch (never a 500 - that asymmetry would itself be the enumeration oracle) and that a
    // transient failure isn't cached forever.
    it('returns 401 (not 500) when the dummy hash rejects, and retries the hash on the next call', async () => {
      usersService.findByEmail.mockResolvedValue(null);
      hashMock.mockRejectedValueOnce(new Error('argon2 unavailable'));
      verifyMock.mockResolvedValue(false);

      await expect(
        service.login({ email: 'ghost@example.com', password: 'x' }),
      ).rejects.toThrow(new UnauthorizedException('Invalid email or password'));

      // memo was cleared after the rejection -> the next unknown-email login attempts hash again
      await expect(
        service.login({ email: 'ghost@example.com', password: 'x' }),
      ).rejects.toThrow(new UnauthorizedException('Invalid email or password'));
      expect(hashMock).toHaveBeenCalledTimes(2);
    });

    it('treats a rejecting dummy verify as a failed login (401), mirroring the real-password branch', async () => {
      usersService.findByEmail.mockResolvedValue(null);
      verifyMock.mockRejectedValue(new Error('argon2 verify blew up'));

      await expect(
        service.login({ email: 'ghost@example.com', password: 'x' }),
      ).rejects.toThrow(new UnauthorizedException('Invalid email or password'));
      expect(jwtService.sign).not.toHaveBeenCalled();
    });

    it('returns a signed token when the password verifies (happy path)', async () => {
      const user = passwordUser();
      usersService.findByEmail.mockResolvedValue(user);
      verifyMock.mockResolvedValue(true);

      const result = await service.login({
        email: 'jane@example.com',
        password: 'a-good-password',
      });

      expect(verifyMock).toHaveBeenCalledWith('stored-hash', 'a-good-password');
      expect(jwtService.sign).toHaveBeenCalledWith({
        sub: user.id,
        email: user.email,
        jti: expect.stringMatching(/^[0-9a-f-]{36}$/) as string,
      });
      expect(result).toEqual({ token: 'signed.jwt.token' });
    });

    it('throws a generic UnauthorizedException when the password is wrong (error path)', async () => {
      usersService.findByEmail.mockResolvedValue(passwordUser());
      verifyMock.mockResolvedValue(false);

      await expect(
        service.login({ email: 'jane@example.com', password: 'wrong' }),
      ).rejects.toThrow(new UnauthorizedException('Invalid email or password'));
      expect(jwtService.sign).not.toHaveBeenCalled();
    });

    it('runs a dummy verify and throws the same generic error for an unknown email (enumeration defence)', async () => {
      usersService.findByEmail.mockResolvedValue(null);

      await expect(
        service.login({ email: 'ghost@example.com', password: 'whatever' }),
      ).rejects.toThrow(new UnauthorizedException('Invalid email or password'));
      // dummy verify still runs so this path isn't measurably faster than a real check
      expect(verifyMock).toHaveBeenCalledWith('argon2-hash', 'whatever');
      expect(jwtService.sign).not.toHaveBeenCalled();
    });

    it('runs a dummy verify and rejects a Google-only account (no passwordHash) with the same error', async () => {
      usersService.findByEmail.mockResolvedValue(
        passwordUser({ googleId: 'google-1', passwordHash: null }),
      );

      await expect(
        service.login({ email: 'jane@example.com', password: 'whatever' }),
      ).rejects.toThrow(new UnauthorizedException('Invalid email or password'));
      expect(verifyMock).toHaveBeenCalledWith('argon2-hash', 'whatever');
      expect(jwtService.sign).not.toHaveBeenCalled();
    });

    it('treats a throwing verify as a failed login rather than a 500', async () => {
      usersService.findByEmail.mockResolvedValue(passwordUser());
      verifyMock.mockRejectedValue(new Error('malformed hash'));

      await expect(
        service.login({ email: 'jane@example.com', password: 'x' }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });
});
