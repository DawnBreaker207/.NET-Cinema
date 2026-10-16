import { test, expect } from '@playwright/test';

test('operator login hop renders', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`${page.url()}: ${e.message.split('\n')[0]}`));
  await page.goto('http://localhost:5173/login');
  await page.waitForTimeout(3000);
  await page.screenshot({ path: 'test-results/check-react-login-hop.png' });
  await page.goto('http://localhost:5000/account/login');
  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'test-results/check-razor-login.png' });
  expect(errors, JSON.stringify(errors)).toEqual([]);
});
