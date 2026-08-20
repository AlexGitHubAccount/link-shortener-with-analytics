import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { RequestUser } from '../../auth/strategies/jwt.strategy';

// Pulls the authenticated user's id out of req.user (set by JwtStrategy.validate() after
// JwtAuthGuard passes). Only valid on routes behind JwtAuthGuard - req.user is undefined
// otherwise, which would make this decorator return undefined rather than throw; every private
// links.controller.ts route is guarded, so this is safe there.
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string => {
    const request = ctx
      .switchToHttp()
      .getRequest<Request & { user: RequestUser }>();
    return request.user.userId;
  },
);
