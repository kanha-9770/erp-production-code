import { test as setup, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const authDir = path.join(here, '.auth');
const authFile = path.join(authDir, 'user.json');

setup('authenticate', async ({ page }) => {
  const email = process.env.TEST_USER_EMAIL;
  const password = process.env.TEST_USER_PASSWORD;

  if (!email || !password) {
    throw new Error(
      'TEST_USER_EMAIL and TEST_USER_PASSWORD must be set. ' +
        'Copy tests/.env.test.example to .env.test and fill them in, ' +
        'then run with `dotenv -e .env.test -- npm run test:e2e` ' +
        'or export them in your shell.'
    );
  }

  await page.goto('/login');

  await page.getByPlaceholder('you@company.com').fill(email);
  await page.getByPlaceholder('Leave empty for OTP login').fill(password);

  // Capture the login API response so we know exactly what the server decided.
  const loginResp = page.waitForResponse(
    (r) => r.url().includes('/api/auth/login') && r.request().method() === 'POST',
    { timeout: 20_000 }
  );

  await page.getByRole('button', { name: /sign in/i }).click();

  const resp = await loginResp.catch(() => null);
  const status = resp?.status();
  let body: any = null;
  try {
    body = await resp?.json();
  } catch {
    body = null;
  }

  if (!resp) {
    throw new Error('Login API did not respond within 20s. Check the network / VPN / URL.');
  }

  if (status === 404 || (body && /not found|not registered/i.test(body.error || ''))) {
    throw new Error(`User ${email} not found on the target server.`);
  }

  if (status === 400 && /invalid/i.test(body?.error || '')) {
    throw new Error(`Login failed: ${body.error}. Wrong password?`);
  }

  if (status === 429) {
    throw new Error(`Rate-limited / locked: ${body?.error || 'too many attempts'}. Wait and retry.`);
  }

  if (body?.requiresOTP) {
    throw new Error(
      'Login required an OTP (server returned requiresOTP=true).\n' +
        'Options:\n' +
        '  1. Use a test account that does not require OTP\n' +
        '  2. Implement OTP retrieval (IMAP / DB poll) in tests/auth.setup.ts\n' +
        '  3. Run `npx playwright codegen` once to log in manually and save storageState'
    );
  }

  if (status !== 200) {
    throw new Error(`Login API returned ${status}: ${JSON.stringify(body)}`);
  }

  // 200 + no requiresOTP = a real session was issued via httpOnly cookie.
  // The frontend redirects after a 1.2s setTimeout — wait for navigation off /login.
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 15_000 });

  if (!fs.existsSync(authDir)) fs.mkdirSync(authDir, { recursive: true });
  await page.context().storageState({ path: authFile });
});
