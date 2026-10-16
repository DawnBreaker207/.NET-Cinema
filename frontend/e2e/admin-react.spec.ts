import { test, expect } from '@playwright/test';

test('react login then dashboard', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message.split('\n')[0]));
  await page.goto('http://localhost:5173/login');
  await expect(page.getByPlaceholder('admin@cinema.local')).toBeVisible({ timeout: 15000 });
  await page.getByPlaceholder('admin@cinema.local').fill('admin@cinema.local');
  await page.locator('input[type="password"]').fill('admin123');
  await page.screenshot({ path: 'test-results/r-login.png' });
  await page.locator('button[type="submit"]').click();
  await page.waitForTimeout(4000);
  await page.screenshot({ path: 'test-results/r-after-login.png' });
  await page.goto('http://localhost:5173/dashboard');
  await page.waitForTimeout(5000);
  await page.screenshot({ path: 'test-results/r-dashboard.png', fullPage: true });
  expect(errors, JSON.stringify(errors)).toEqual([]);
});
