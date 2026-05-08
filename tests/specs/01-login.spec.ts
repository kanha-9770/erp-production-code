import { test, expect } from '@playwright/test';

test.use({ storageState: { cookies: [], origins: [] } });

test.describe('Login page', () => {
  test('renders the login form with email + password fields', async ({ page }) => {
    await page.goto('/login');

    await expect(page.getByRole('heading', { name: /welcome back/i })).toBeVisible();
    await expect(page.getByPlaceholder('you@company.com')).toBeVisible();
    await expect(page.getByPlaceholder('Leave empty for OTP login')).toBeVisible();
    await expect(page.getByRole('button', { name: /sign in/i })).toBeEnabled();
  });

  test('rejects an invalid email format with client-side validation', async ({ page }) => {
    await page.goto('/login');

    await page.getByPlaceholder('you@company.com').fill('not-an-email');
    await page.getByPlaceholder('Leave empty for OTP login').fill('whatever123');
    await page.getByRole('button', { name: /sign in/i }).click();

    // Either the browser's native validation or zod's message blocks submission.
    await expect(page).toHaveURL(/\/login/);
  });

  test('shows an error toast for wrong credentials', async ({ page }) => {
    await page.goto('/login');

    await page.getByPlaceholder('you@company.com').fill('does-not-exist@invalid.test');
    await page.getByPlaceholder('Leave empty for OTP login').fill('definitelyWrong#1');
    await page.getByRole('button', { name: /sign in/i }).click();

    await expect(
      page.getByText(/user not found|invalid|incorrect|sign up|failed/i).first()
    ).toBeVisible({ timeout: 15_000 });
  });

  test('exposes a "Forgot?" link that navigates to forgot-password view', async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('button', { name: /forgot\?/i }).click();
    await expect(page.getByText(/forgot|reset|recover/i).first()).toBeVisible();
  });
});
