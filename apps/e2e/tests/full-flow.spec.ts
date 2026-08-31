import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { loginAs } from './auth-helper';

// Objective, deterministic a11y baseline via axe-core - complements (not replaces)
// frontend-reviewer's LLM accessibility review in push-gate, the same way security-reviewer
// pairs its own LLM judgment with Semgrep for a second, rule-based opinion. Scoped to
// serious/critical impact only - moderate/minor axe findings are frequently debatable
// (color-contrast on decorative elements, etc.) and would make this assertion too brittle to
// stay green; serious/critical are the ones worth failing a build over.
async function expectNoSeriousA11yViolations(page: import('@playwright/test').Page) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa'])
    .analyze();
  const seriousOrWorse = results.violations.filter(
    (v) => v.impact === 'serious' || v.impact === 'critical',
  );
  expect(seriousOrWorse, JSON.stringify(seriousOrWorse, null, 2)).toEqual([]);
}

// Full flow: login -> create link -> follow the short link (redirect confirmed) -> analytics
// page shows the click. Login uses a seeded JWT rather than a real Google OAuth round trip -
// see auth-helper.ts for why and how.
test('login, create a link, follow it, see the click in analytics', async ({ page, request }) => {
  const email = `e2e-${Date.now()}@example.com`;
  await loginAs(page, email);

  // Now on the Dashboard, authenticated.
  await expect(page.getByText(email)).toBeVisible();
  await expectNoSeriousA11yViolations(page);

  const targetUrl = `https://example.com/e2e-target-${Date.now()}`;
  await page.getByLabel('URL').fill(targetUrl);
  await page.getByRole('button', { name: 'Create link' }).click();

  await expect(page.getByText('Link created!')).toBeVisible();

  const linkRow = page.locator('a[href^="http://localhost:4000/"]').first();
  await expect(linkRow).toBeVisible();
  const shortUrl = await linkRow.getAttribute('href');
  expect(shortUrl).toBeTruthy();

  // Follow the short link via a direct API request (not a page navigation, since that would
  // leave the app and load example.com) - confirms the backend actually redirects correctly
  // and records the click, which is what this scenario is really verifying end-to-end.
  const redirectResponse = await request.get(shortUrl!, { maxRedirects: 0 });
  expect(redirectResponse.status()).toBe(302);
  expect(redirectResponse.headers()['location']).toBe(targetUrl);

  // Open the link's analytics page and confirm the click that redirect just recorded shows up.
  // Scoped to the specific totalClicks element (LinkDetail.tsx's "text-4xl" count) rather than
  // a bare getByText('1') - a chart axis tick can also render the text "1" and match ambiguously.
  await page.getByRole('link', { name: 'Analytics' }).first().click();
  await expect(page.getByText('total clicks')).toBeVisible();
  await expect(page.locator('p.text-4xl')).toHaveText('1');
  await expectNoSeriousA11yViolations(page);
});

test('unauthenticated visitor is redirected to /login', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole('link', { name: 'Sign in with Google' })).toBeVisible();
  await expectNoSeriousA11yViolations(page);
});
