import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

// Applied to all private endpoints (links CRUD). redirect stays deliberately unguarded -
// see apps/api/src/redirect/redirect.controller.ts.
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}
