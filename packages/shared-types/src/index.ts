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
  // passes something the server then rejects (see Stage 6's Semgrep sweep / stage-6-testing-qa.md
  // for why http/https-only, not a broader allowlist).
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
