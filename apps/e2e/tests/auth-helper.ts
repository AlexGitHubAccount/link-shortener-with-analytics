import { createHmac, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import type { Page } from '@playwright/test';

// E2E can't drive a real Google OAuth consent screen (no real Google account is available in
// this environment - see docs/stage-4-authentication.md). Instead, this mints a real,
// correctly-signed JWT using the SAME JWT_SECRET the locally-running backend verifies against
// (read from apps/api/.env), and seeds it directly into the frontend's localStorage the same
// way AuthCallback.tsx would after a real login - the token is genuinely verified server-side
// on every subsequent API call, this only skips the Google redirect round trip itself.
// This is a standard, widely-used pattern for E2E-testing OAuth-gated apps without depending on
// a live third-party identity provider in CI.

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function readJwtSecret(): string {
  const fs = require('node:fs') as typeof import('node:fs');
  const path = require('node:path') as typeof import('node:path');
  const envPath = path.resolve(__dirname, '../../api/.env');
  const content = fs.readFileSync(envPath, 'utf-8');
  const match = content.match(/^JWT_SECRET=(.+)$/m);
  if (!match) {
    throw new Error(`JWT_SECRET not found in ${envPath} - is the backend .env set up? See docs/stage-4-authentication.md.`);
  }
  return match[1].trim();
}

export function mintTestJwt(userId: string, email: string): string {
  const secret = readJwtSecret();
  const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const now = Math.floor(Date.now() / 1000);
  const payload = base64url(JSON.stringify({ sub: userId, email, iat: now, exp: now + 3600 }));
  const signingInput = `${header}.${payload}`;
  const signature = createHmac('sha256', secret).update(signingInput).digest('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${signingInput}.${signature}`;
}

// AuthCallback.tsx (the real frontend code this helper drives) calls GET /auth/me after
// picking up the token, which does a real Prisma lookup by user id - a JWT signed for a
// nonexistent user would 404 there and bounce back to /login. So this must seed a real User
// row first via psql (same technique used for manual verification throughout this project's
// development) - a fresh random id/email per test run, never colliding with real or
// previously-seeded data.
function seedTestUser(userId: string, email: string): void {
  // Values are passed as psql variables (-v) and referenced via :'name', which psql quotes
  // and escapes as SQL string literals - avoids building SQL via raw string interpolation
  // (stage-review's security-reviewer flagged the original raw-interpolation version).
  //
  // Important: psql's :'var' substitution only runs on SQL it reads via stdin/script/interactive
  // input, NOT on the argument passed to -c (confirmed directly against this psql 16.15 build -
  // `-c "SELECT :'x'"` errors with "syntax error at or near \":\"" even with -v set, while the
  // exact same query piped via stdin substitutes correctly). So the SQL must be piped in via
  // `input`, not passed as a `-c` argument.
  const sql = `INSERT INTO "User" (id, "googleId", email, "displayName", "createdAt", "updatedAt") VALUES (:'userId', :'googleId', :'email', 'E2E Test User', now(), now()) ON CONFLICT (id) DO NOTHING;`;
  execFileSync(
    'docker',
    [
      'exec', '-i', 'link-shortener-db',
      'psql', '-U', 'linkshortener', '-d', 'linkshortener',
      '-v', `userId=${userId}`,
      '-v', `googleId=e2e-${userId}`,
      '-v', `email=${email}`,
    ],
    { input: sql },
  );
}

// Logs the page in by driving the SAME code path the frontend uses after a real OAuth
// callback (navigate to /auth/callback#token=... and let AuthCallback.tsx do its real work:
// call GET /auth/me, populate the auth store, redirect to /) - not a shortcut that bypasses
// app code, just a shortcut around the external Google redirect itself.
export async function loginAs(page: Page, email: string): Promise<{ userId: string }> {
  const userId = randomUUID();
  seedTestUser(userId, email);
  const token = mintTestJwt(userId, email);
  await page.goto(`/auth/callback#token=${token}`);
  await page.waitForURL('/');
  return { userId };
}
