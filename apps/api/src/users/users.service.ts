import { Injectable } from '@nestjs/common';
import { User } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { GoogleProfile } from '../auth/strategies/google.strategy';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { id } });
  }

  // Called from AuthController's Google callback. Upsert rather than find-then-create:
  // avoids a race on repeat logins, and keeps displayName/avatarUrl fresh if the user's
  // Google profile changes between logins.
  async findOrCreateByGoogleProfile(profile: GoogleProfile): Promise<User> {
    return this.prisma.user.upsert({
      where: { googleId: profile.googleId },
      update: {
        email: profile.email,
        displayName: profile.displayName,
        avatarUrl: profile.avatarUrl,
      },
      create: {
        googleId: profile.googleId,
        email: profile.email,
        displayName: profile.displayName,
        avatarUrl: profile.avatarUrl,
      },
    });
  }
}
