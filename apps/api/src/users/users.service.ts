import { ConflictException, Injectable } from '@nestjs/common';
import { User } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { isUniqueConstraintViolation } from '../common/prisma-errors';
import type { GoogleProfile } from '../auth/strategies/google.strategy';

// Canonical email form. Applied at every data-access path (register, login, Google callback) so
// case/whitespace variants of the same address resolve to one row - both for "let me back into
// my own account" and so the case-sensitive Postgres unique index can't be sidestepped to
// create a duplicate (which would also defeat the anti-pre-hijacking check below). The DTOs and
// the shared zod schema normalise too, but this is the guarantee that must hold - the Google
// email never passes through a DTO.
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { id } });
  }

  // Used by AuthService for the email+password login/register flow.
  async findByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findUnique({
      where: { email: normalizeEmail(email) },
    });
  }

  // Creates a password-only account (no googleId). AuthService guarantees passwordHash is a
  // real argon2 hash here, so the "at least one credential" invariant holds.
  async createPasswordUser(input: {
    email: string;
    passwordHash: string;
    displayName?: string;
  }): Promise<User> {
    return this.prisma.user.create({
      data: {
        email: normalizeEmail(input.email),
        passwordHash: input.passwordHash,
        displayName: input.displayName ?? null,
      },
    });
  }

  // Called from AuthController's Google callback. Deliberately does NOT auto-link a Google
  // identity onto an existing password account that happens to share the email: an attacker who
  // pre-registers victim@example.com with a password would otherwise keep a working credential
  // (passwordHash is never cleared) after the real owner's first Google login - account
  // pre-hijacking. Safe linking needs an explicit, authenticated step (password re-auth or a
  // verification email) and is a deferred feature. For now: match by googleId or create fresh;
  // an email collision with a password account surfaces as a ConflictException the caller turns
  // into a redirect back to /login.
  async findOrCreateByGoogleProfile(profile: GoogleProfile): Promise<User> {
    const email = normalizeEmail(profile.email);

    const byGoogleId = await this.prisma.user.findUnique({
      where: { googleId: profile.googleId },
    });
    if (byGoogleId) {
      try {
        return await this.prisma.user.update({
          where: { id: byGoogleId.id },
          data: {
            // Refresh email too: Google is the identity provider for this row, so a Google-side
            // email change should propagate, and a row left non-canonical by a
            // migrate-deploy-then-code-swap window self-heals on the owner's next login.
            email,
            displayName: profile.displayName,
            avatarUrl: profile.avatarUrl,
          },
        });
      } catch (error) {
        // The refreshed email now collides with another account (a password user already owns
        // it). Surface it the same way the create path does rather than a raw Prisma 500.
        if (isUniqueConstraintViolation(error)) {
          throw new ConflictException(
            'An account with this email already exists. Sign in with your password to access it.',
          );
        }
        throw error;
      }
    }

    try {
      return await this.prisma.user.create({
        data: {
          googleId: profile.googleId,
          email,
          displayName: profile.displayName,
          avatarUrl: profile.avatarUrl,
        },
      });
    } catch (error) {
      if (!isUniqueConstraintViolation(error)) {
        throw error;
      }
      // A P2002 on this insert is one of exactly two unique constraints: googleId or email.
      // Rather than trust the (version-dependent) meta.target shape to tell them apart, re-read
      // by googleId: present now => a concurrent Google login for the same account won the race,
      // return it; still absent => the collision was on email => a password account owns it, and
      // we must NOT link.
      const raced = await this.prisma.user.findUnique({
        where: { googleId: profile.googleId },
      });
      if (raced) {
        return raced;
      }
      throw new ConflictException(
        'An account with this email already exists. Sign in with your password to access it.',
      );
    }
  }
}
