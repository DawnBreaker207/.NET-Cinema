import { test, expect } from '@playwright/test';

// Client -> admin navigation: avatar menu console link per role.
test('client to admin nav', async ({ page }) => {
  for (const [email, pass, dest] of [
    ['admin@cinema.local', 'admin123', 'http://localhost:5000/admin'],
    ['staff@cinema.local', 'staff123', 'http://localhost:5000/admin/counter'],
  ] as const) {
    await page.goto('http://localhost:5173/customer-login');
    await page.locator('input[placeholder="ban@email.com"]').fill(email);
    await page.locator('input[type="password"]').fill(pass);
    await page.getByRole('button', { name: 'Đăng nhập' }).click();
    await page.waitForTimeout(2500);
    await page.locator('button[aria-label="Tài khoản"], button[aria-label*="ccount" i]').first().click({ timeout: 10000 }).catch(async () => {
      await page.locator('button').filter({ hasText: /^$/ }).last().click();
    });
    const link = page.locator(`a[href="${dest}"]`);
    await expect(link.first()).toBeVisible({ timeout: 10000 });
    await link.first().click();
    // No Razor cookie yet -> login form, then lands on dest via returnUrl.
    await page.waitForURL('**/account/login**', { timeout: 15000 });
    await page.fill('input[name="email"]', email);
    await page.fill('input[name="password"]', pass);
    await page.click('button[type="submit"]');
    await page.waitForURL(`**${dest.replace('http://localhost:5000', '')}*`, { timeout: 15000 });
    await page.context().clearCookies();
  }
});
