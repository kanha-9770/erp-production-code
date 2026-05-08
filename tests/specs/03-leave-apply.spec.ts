import { test, expect } from '@playwright/test';

const QA_TAG = 'QA_E2E_AUTOMATION';

test.describe('Leave page', () => {
  test('loads /leave with balances and Apply Leave button visible', async ({ page }) => {
    await page.goto('/leave');

    await expect(page.getByRole('button', { name: /apply leave/i })).toBeVisible();
    await expect(page.getByText(/balance|available|requests|calendar/i).first()).toBeVisible();
  });

  test('opens Apply Leave sheet, reaches submit step, then cancels safely', async ({ page }) => {
    // This test is read-only by default. To exercise the full submit flow,
    // run with TEST_LEAVE_SUBMIT=1 — but ONLY against a non-prod environment.
    await page.goto('/leave');
    await page.getByRole('button', { name: /apply leave/i }).click();

    // The sheet/dialog should reveal a reason field and a submit button.
    await expect(page.getByText(/leave type|reason|date/i).first()).toBeVisible({
      timeout: 10_000,
    });

    if (process.env.TEST_LEAVE_SUBMIT !== '1') {
      // Bail out — close the sheet to avoid creating data.
      await page.keyboard.press('Escape');
      return;
    }

    // Optional submit path (gated). Keep the reason recognisable so it can be
    // cleaned up later by searching audit log for QA_TAG.
    const reasonField = page.getByLabel(/reason/i).first();
    await reasonField.fill(`${QA_TAG} — automated leave application, please reject`);

    const submit = page.getByRole('button', { name: /submit|apply/i }).last();
    await submit.click();

    await expect(
      page.getByText(/submitted|pending|success|applied/i).first()
    ).toBeVisible({ timeout: 15_000 });
  });
});
