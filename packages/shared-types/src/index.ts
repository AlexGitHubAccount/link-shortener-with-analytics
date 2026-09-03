/**
 * Shared types and DTOs for link-shortener application
 *
 * This package contains type definitions shared between frontend and backend.
 * DTO validation (class-validator for Nest, zod for React) will be added as features are implemented.
 */

import { z } from 'zod';

// Matches the actual shape returned by @nestjs/terminus's HealthCheckService.check()
// (GET /health) — NOT a placeholder shape, this is what the backend really sends.
export interface HealthStatus {
  status: 'ok' | 'error' | 'shutting_down';
  info?: Record<string, { status: string }>;
  error?: Record<string, { status: string }>;
  details?: Record<string, { status: string }>;
}

// Matches the actual JSON shape returned by apps/api's AuthController (GET /auth/me).
export interface AuthUser {
  id: string;
  email: string;
  displayName: string | null;
  avatarUrl: string | null;
}

// Matches the actual JSON shape returned by apps/api's LinksController (Prisma's Link model
// serialized over HTTP) — title/expiresAt are nullable columns, not absent-optional ones.
export interface Link {
  id: string;
  userId: string;
  originalUrl: string;
  shortCode: string;
  isCustomAlias: boolean;
  title: string | null;
  isActive: boolean;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
}

// Will be implemented in Stage 2 (Redirect tracking)
export interface Click {
  id: string;
  linkId: string;
  clickedAt: string;
  referrer?: string;
  userAgentRaw?: string;
  browser?: string;
  os?: string;
  deviceType: 'DESKTOP' | 'MOBILE' | 'TABLET' | 'BOT' | 'UNKNOWN';
}

// Single source of truth for "create a link" validation on the frontend (mirrored by
// apps/api/src/links/dto/create-link.dto.ts's class-validator rules on the backend).
// Empty-string optional fields transform to undefined, matching the backend's ValidationPipe
// (forbidNonWhitelisted:true, but no reject-empty-string) treating "" as "not provided".
export const createLinkRequestSchema = z.object({
  // protocol allowlist matches the backend's CreateLinkDto exactly (@IsUrl({protocols:
  // ['http','https']})) - both sides accept the same set, so client-side validation never
  // passes something the server then rejects. http/https-only (not a broader allowlist) keeps
  // javascript:/data: URLs out - confirmed by an earlier Semgrep sweep.
  originalUrl: z.url({
    protocol: /^https?$/,
    error: 'Enter a valid URL, including http:// or https://',
  }),
  customCode: z
    .string()
    .regex(/^[a-zA-Z0-9]+$/, 'Only letters and digits allowed')
    .min(3, 'At least 3 characters')
    .max(20, 'At most 20 characters')
    .optional()
    .or(z.literal('').transform(() => undefined)),
  title: z
    .literal('')
    .transform(() => undefined)
    .or(z.string().optional()),
});

export type CreateLinkRequest = z.infer<typeof createLinkRequestSchema>;

// Single source of truth for email+password auth validation, shared by the frontend forms and
// mirrored by apps/api/src/auth/dto/{register,login}.dto.ts's class-validator rules. These two
// endpoints (POST /auth/register, POST /auth/login) are public and issue the same JWT the
// Google OAuth flow does.
//
// Password policy (min 8 / max 128) is applied ONLY at registration. Login validates presence
// only (min 1) - never reject an existing user's stored password for failing a policy that may
// have changed, and never leak the policy as a login-time signal.
//
// Email is trimmed + lowercased to a canonical form before the format check (piped, so the
// check sees the normalised value) - the API's DTOs do the same and UsersService normalises
// once more at the data layer. Case/whitespace variants of one address must resolve to one
// account.
const canonicalEmail = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email({ error: 'Enter a valid email address' }));

export const registerRequestSchema = z.object({
  email: canonicalEmail,
  password: z
    .string()
    .min(8, 'At least 8 characters')
    .max(128, 'At most 128 characters'),
  // Optional display name; an empty string from an untouched form field is treated as "not
  // provided", matching the backend ValidationPipe's handling of "" as absent.
  displayName: z
    .string()
    .min(1, 'At least 1 character')
    .max(80, 'At most 80 characters')
    .optional()
    .or(z.literal('').transform(() => undefined)),
});

export type RegisterRequest = z.infer<typeof registerRequestSchema>;

export const loginRequestSchema = z.object({
  email: canonicalEmail,
  password: z.string().min(1, 'Enter your password').max(128),
});

export type LoginRequest = z.infer<typeof loginRequestSchema>;

// JSON body returned by both POST /auth/register and POST /auth/login. The Google OAuth flow
// hands the same token to the SPA via a URL fragment instead - these endpoints return it in the
// response body because the client drives the request directly.
export interface AuthTokenResponse {
  token: string;
}

// Will be implemented in Stage 5 (Analytics)
export interface LinkAnalytics {
  linkId: string;
  totalClicks: number;
  clicksByDay: Array<{
    date: string;
    count: number;
  }>;
  topReferrers: Array<{
    referrer: string;
    count: number;
  }>;
  deviceBreakdown: {
    desktop: number;
    mobile: number;
    tablet: number;
    bot: number;
    unknown: number;
  };
}
