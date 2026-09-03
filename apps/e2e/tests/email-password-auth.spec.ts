import { randomUUID } from 'node:crypto';
import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

// Email + password auth, driven through the real UI (unlike auth-helper.ts, which mints a JWT
// directly and skips every screen). This is the first real end-to-end check that the new
// /auth/register + /auth/login endpoints, the rewritten /login page, and the shared
// completeLogin() sequence actually wire together against a running backend + Postgres.
//
// The run harness starts `pnpm dev` + `docker compose up -d postgres` first - same as
// full-flow.spec.ts. A fresh random email per run means registration always creates its own
// row and never collides with real or previously-seeded data, so no psql seeding here.

// Same objective, deterministic axe-core baseline used in full-flow.spec.ts - serious/critical
// impact only (moderate/minor are frequently debatable and would make this too brittle).
async function expectNoSeriousA11yViolations(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa'])
    .analyze();
  const seriousOrWorse = results.violations.filter(
    (v) => v.impact === 'serious' || v.impact === 'critical',
  );
  expect(seriousOrWorse, JSON.stringify(seriousOrWorse, null, 2)).toEqual([]);
}

// The toggle buttons animate their background (`transition-all`, ~150ms) on :hover, and a
// click leaves the pointer parked on the button. axe sampling a button mid-transition reports
// a false color-contrast failure on a control that meets contrast at rest - so before an a11y
// scan that follows a click, park the pointer off any control and let the transition settle.
async function settleHoverState(page: Page) {
  await page.mouse.move(0, 0);
  // Park somewhere inert, then wait past the ~150ms transition so axe samples the resting colors.
  await page.waitForFunction('!document.querySelector("button:hover")');
  await page.waitForTimeout(300);
}

// Password comfortably over the >=8 policy (registerRequestSchema in shared-types).
const PASSWORD = 'e2e-Str0ng-pass';

// Budget check: this test makes exactly 2 POST /auth/login calls (one valid in step 3, one
// wrong in step 4). The login throttle is 5/60s per IP - safe for one suite run, and still
// safe under CI's single retry (4 total). Don't add more login attempts here without raising
// that ceiling in mind.
test('register through the UI, sign out, sign back in, and reject a wrong password', async ({
  page,
}) => {
  const email = `e2e-${randomUUID()}@example.test`;

  // 1. Create a brand-new account through the "Create account" form.
  await page.goto('/login');
  const toggle = page.getByRole('group', { name: 'Choose sign in or create account' });
  await toggle.getByRole('button', { name: 'Create account' }).click();

  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByLabel('Display name (optional)').fill('E2E Ada');
  await page.locator('form').getByRole('button', { name: 'Create account' }).click();

  // Registration issues a JWT, completeLogin() confirms it against /auth/me, then lands on the
  // dashboard - the same path the Google callback takes.
  await page.waitForURL('/');
  await expect(page.getByText(email)).toBeVisible();

  // 2. Sign out (dashboard control, same as full-flow.spec.ts relies on AuthGuard to bounce).
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/login$/);

  // 3. Sign back in with the same credentials via the "Sign in" form (the default toggle state).
  await expect(
    toggle.getByRole('button', { name: 'Sign in' }),
  ).toHaveAttribute('aria-pressed', 'true');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.locator('form').getByRole('button', { name: 'Sign in' }).click();

  await page.waitForURL('/');
  await expect(page.getByText(email)).toBeVisible();

  // 4. Sign out again, then a wrong password must be rejected generically - no hint that the
  //    account exists, and no navigation away from /login.
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/login$/);

  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill('totally-wrong-password');
  await page.locator('form').getByRole('button', { name: 'Sign in' }).click();

  const alert = page.getByRole('alert');
  await expect(alert).toHaveText('Invalid email or password.');
  // The message must not leak whether the email is registered.
  await expect(alert).not.toContainText(email);
  await expect(page).toHaveURL(/\/login$/);
});

test('the /login toggle switches between the sign-in and create-account forms', async ({
  page,
}) => {
  await page.goto('/login');
  const toggle = page.getByRole('group', { name: 'Choose sign in or create account' });
  const signIn = toggle.getByRole('button', { name: 'Sign in' });
  const createAccount = toggle.getByRole('button', { name: 'Create account' });

  // Default state: the sign-in form (no display-name field), toggle reflects it.
  await expect(signIn).toHaveAttribute('aria-pressed', 'true');
  await expect(createAccount).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByLabel('Display name (optional)')).toHaveCount(0);

  // Switch to create-account: the display-name field appears, aria-pressed flips.
  await createAccount.click();
  await expect(createAccount).toHaveAttribute('aria-pressed', 'true');
  await expect(signIn).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByLabel('Display name (optional)')).toBeVisible();

  // Switch back to sign-in: the display-name field is gone again.
  await signIn.click();
  await expect(signIn).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByLabel('Display name (optional)')).toHaveCount(0);
});

test('the rewritten /login page has no serious a11y violations in either toggle state', async ({
  page,
}) => {
  await page.goto('/login');
  const createAccount = page
    .getByRole('group', { name: 'Choose sign in or create account' })
    .getByRole('button', { name: 'Create account' });

  // Sign-in form shown (default).
  await expect(page.getByLabel('Password', { exact: true })).toBeVisible();
  await settleHoverState(page);
  await expectNoSeriousA11yViolations(page);

  // Create-account form shown.
  await createAccount.click();
  await expect(page.getByLabel('Display name (optional)')).toBeVisible();
  await settleHoverState(page);
  await expectNoSeriousA11yViolations(page);
});
