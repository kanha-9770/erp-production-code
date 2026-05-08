import { test, expect } from '@playwright/test';

test.describe('Payroll page (read-only)', () => {
  test('loads /payroll without crashing and shows tabs', async ({ page }) => {
    const res = await page.goto('/payroll');
    test.skip(
      res?.status() === 403 || page.url().includes('/unauthorized'),
      'logged-in user does not have payroll access — skipping'
    );

    await expect(page.getByRole('tab').first()).toBeVisible({ timeout: 15_000 });
  });

  // Payroll endpoints recompute live across attendance + leave + holidays, so
  // a cold-cache hit can take 30+ seconds on a real org. The 60s cap is
  // deliberately generous — anything slower than that is a perf regression
  // worth reporting separately.
  const PAYROLL_API_TIMEOUT = 60_000;

  test('GET /api/payroll responds 200 with json for the current org', async ({ request }) => {
    const res = await request.get('/api/payroll', { timeout: PAYROLL_API_TIMEOUT });
    test.skip(res.status() === 403, 'no access to payroll API — skipping');
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toBeTruthy();
  });

  test('GET /api/payroll/stats responds 200', async ({ request }) => {
    const res = await request.get('/api/payroll/stats', { timeout: PAYROLL_API_TIMEOUT });
    test.skip(res.status() === 403, 'no access to payroll stats — skipping');
    expect(res.status()).toBe(200);
  });
});
