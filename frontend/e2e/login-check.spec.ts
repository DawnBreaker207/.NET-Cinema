import { test, expect } from '@playwright/test';

test('login pages render', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`${page.url()}: ${e.message.split('\n')[0]}`));
  for (const p of ['/customer-login', '/register', '/']) {
    await page.goto(`http://localhost:5173${p}`);
    await page.waitForTimeout(2500);
    await page.screenshot({ path: `test-results/check-${p.replaceAll('/', '_')}.png` });
  }
  expect(errors, JSON.stringify(errors)).toEqual([]);
});
