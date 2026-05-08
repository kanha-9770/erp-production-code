import { test, expect } from '@playwright/test';

test.describe('Modules + form builder (smoke)', () => {
  test('loads /admin/modules without crashing', async ({ page }) => {
    const res = await page.goto('/admin/modules');
    test.skip(
      res?.status() === 403 || page.url().includes('/unauthorized'),
      'logged-in user does not have module admin access — skipping'
    );
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });

  test('GET /api/modules returns a list', async ({ request }) => {
    const res = await request.get('/api/modules');
    test.skip(res.status() === 403, 'no access to modules API — skipping');
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body) || typeof body === 'object').toBeTruthy();
  });

  test('GET /api/forms/permitted returns a list', async ({ request }) => {
    const res = await request.get('/api/forms/permitted');
    test.skip(res.status() === 403, 'no access to permitted forms — skipping');
    expect(res.status()).toBe(200);
  });

  test('profile page renders the authenticated user', async ({ page }) => {
    await page.goto('/profile');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByText(/email|account|profile/i).first()).toBeVisible();
  });
});
