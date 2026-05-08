import { test, expect } from '@playwright/test';

test.describe('Attendance page (smoke)', () => {
  test('loads /attendance with the page heading and history widget', async ({ page }) => {
    await page.goto('/attendance');

    await expect(page.getByRole('heading', { name: /my attendance/i })).toBeVisible();
    await expect(page.getByText(/check.?in|check.?out|history|range/i).first()).toBeVisible();
  });

  test('does not flood the console with errors on /attendance', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });
    page.on('pageerror', (err) => errors.push(err.message));

    await page.goto('/attendance');
    await page.waitForLoadState('networkidle').catch(() => {});

    // We allow a small number of benign 3rd-party / dev-overlay errors but
    // fail loudly if the page is genuinely broken.
    expect(
      errors.filter((e) => !/favicon|chunk-load|hydration/i.test(e)),
      `Console errors:\n${errors.join('\n')}`
    ).toHaveLength(0);
  });
});

test.describe('Team attendance (manager view)', () => {
  test('loads /attendance/team if the user has access', async ({ page }) => {
    const res = await page.goto('/attendance/team');
    test.skip(
      res?.status() === 403 || page.url().includes('/unauthorized'),
      'logged-in user does not have manager access — skipping'
    );
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });
});
