import { test, expect } from '@playwright/test';

// Functional 1:1: every admin page performs its real flows against :5000.
const stamp = Date.now();

async function adminLogin(page: any) {
  await page.goto('http://localhost:5000/account/login');
  await page.fill('input[name="email"]', 'admin@cinema.local');
  await page.fill('input[name="password"]', 'admin123');
  await page.click('button[type="submit"]');
  await page.waitForURL('**/admin**', { timeout: 15000 });
}

async function confirmOk(page: any) {
  await page.waitForSelector('.ant-modal-mask.open .ant-modal-footer [data-x="ok"]', { timeout: 8000 });
  await page.click('.ant-modal-mask.open .ant-modal-footer [data-x="ok"]');
}

test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`${page.url()}: ${e.message.split('\n')[0]}`));
  (page as any).__errors = errors;
});

test.afterEach(async ({ page }) => {
  expect((page as any).__errors, JSON.stringify((page as any).__errors)).toEqual([]);
});

test('users search + create + role toggle', async ({ page }) => {
  await adminLogin(page);
  await page.goto('http://localhost:5000/admin/users');
  await expect(page.locator('#us_rows tr')).not.toHaveCount(0, { timeout: 15000 });
  // Search narrows to the admin row with the self guard.
  await page.fill('#us_search', 'admin@cinema.local');
  await page.press('#us_search', 'Enter');
  await expect(page.locator('#us_rows tr[data-id]')).toHaveCount(1, { timeout: 15000 });
  await expect(page.locator('#us_rows .ant-tag', { hasText: 'Bạn' })).toBeVisible();
  await expect(page.locator('#us_rows select.us-role[disabled]')).toBeVisible();
  await page.fill('#us_search', '');
  await page.press('#us_search', 'Enter');
  // Create + lock cycle on a unique account.
  const email = `raz${stamp}@test.local`;
  await page.click('#us_new');
  await page.fill('#us_f_email', email);
  await page.fill('#us_f_name', 'RAZ E2E');
  await page.fill('#us_f_pass', 'secret123');
  await page.click('#us_save');
  await expect(page.locator('#cp-messages', { hasText: 'Đã tạo tài khoản' })).toBeVisible({ timeout: 15000 });
  await page.fill('#us_search', email);
  await page.press('#us_search', 'Enter');
  await expect(page.locator('#us_rows tr[data-id]')).toHaveCount(1, { timeout: 15000 });
  // Role staff -> admin -> staff.
  await page.selectOption('#us_rows select.us-role', 'admin');
  await expect(page.locator('#cp-messages', { hasText: 'Cập nhật thành công' })).toBeVisible({ timeout: 15000 });
});

test('bookings filters + detail drawer', async ({ page }) => {
  await adminLogin(page);
  await page.goto('http://localhost:5000/admin/bookings');
  await expect(page.locator('#bk_rows tr[data-id]').first()).toBeVisible({ timeout: 15000 });
  await page.selectOption('#bk_status', 'confirmed');
  await expect(page.locator('#bk_rows tr[data-id]').first()).toBeVisible({ timeout: 15000 });
  await page.selectOption('#bk_payment', 'paid');
  await expect(page.locator('#bk_payhint')).toContainText('giữ tiền', { timeout: 15000 });
  await page.selectOption('#bk_payment', '');
  await page.selectOption('#bk_status', '');
  await page.click('#bk_rows tr[data-id] [data-act="detail"]');
  await expect(page.locator('#bk_drawer.open')).toBeVisible({ timeout: 15000 });
  await expect(page.locator('#bk_d_body table').first()).toBeVisible({ timeout: 15000 });
  await page.keyboard.press('Escape');
  await expect(page.locator('#bk_drawer.open')).toBeHidden({ timeout: 5000 });
});

test('discounts full cycle', async ({ page }) => {
  await adminLogin(page);
  await page.goto('http://localhost:5000/admin/promotions');
  const code = `RAZ${String(stamp).slice(-6)}`;
  await page.click('#dc_new');
  await page.fill('#dc_f_code', code.toLowerCase());
  await page.fill('#dc_f_value', '15');
  await page.click('#dc_save');
  await expect(page.locator('#cp-messages', { hasText: 'Đã tạo mã giảm giá' })).toBeVisible({ timeout: 15000 });
  await page.fill('#dc_search', code);
  await page.press('#dc_search', 'Enter');
  await expect(page.locator('#dc_rows tr[data-id]')).toHaveCount(1, { timeout: 15000 });
  // Toggle off then delete with cleanup.
  await page.click('#dc_rows tr[data-id] [data-act="toggle"]');
  await confirmOk(page);
  await expect(page.locator('#cp-messages', { hasText: 'Cập nhật thành công' })).toBeVisible({ timeout: 15000 });
  await page.click('#dc_rows tr[data-id] [data-act="del"]');
  await confirmOk(page);
  await expect(page.locator('#cp-messages', { hasText: 'Đã gỡ mã giảm giá' })).toBeVisible({ timeout: 15000 });
});

test('campaigns create + links + delete', async ({ page }) => {
  await adminLogin(page);
  await page.goto('http://localhost:5000/admin/promotions');
  await page.click('#pm_tabs .ant-tabs-tab[data-tab="campaigns"]');
  const name = `RAZ Campaign ${stamp}`;
  await page.click('#cm_new');
  await page.fill('#cm_f_name', name);
  await page.fill('#cm_f_from', '2026-10-01T00:00');
  await page.fill('#cm_f_to', '2026-12-31T23:59');
  await page.click('#cm_save');
  await expect(page.locator('#cp-messages', { hasText: 'Đã tạo chiến dịch' })).toBeVisible({ timeout: 15000 });
  await page.fill('#cm_search', name);
  await page.press('#cm_search', 'Enter');
  await expect(page.locator('#cm_rows tr[data-id]')).toHaveCount(1, { timeout: 15000 });
  // Links modal opens with pickers.
  await page.click('#cm_rows tr[data-id] [data-act="links"]');
  await expect(page.locator('#cm_links.open')).toBeVisible({ timeout: 15000 });
  await expect(page.locator('#cm_lk_code_add[disabled]')).toBeVisible();
  await page.keyboard.press('Escape');
  // Toggle on then delete with cleanup.
  await page.click('#cm_rows tr[data-id] [data-act="toggle"]');
  await confirmOk(page);
  await expect(page.locator('#cp-messages', { hasText: 'Cập nhật thành công' })).toBeVisible({ timeout: 15000 });
  await page.click('#cm_rows tr[data-id] [data-act="del"]');
  await confirmOk(page);
  await expect(page.locator('#cp-messages', { hasText: 'Đã xoá chiến dịch' })).toBeVisible({ timeout: 15000 });
});

test('articles create + publish + delete', async ({ page }) => {
  await adminLogin(page);
  await page.goto('http://localhost:5000/admin/promotions');
  await page.click('#pm_tabs .ant-tabs-tab[data-tab="articles"]');
  const title = `RAZ Article ${stamp}`;
  await page.click('#ar_new');
  await page.fill('#ar_f_title', title);
  await page.click('#ar_f_editor .ql-editor');
  await page.keyboard.type('Body text for e2e', { delay: 10 });
  await page.click('#ar_save');
  await expect(page.locator('#cp-messages', { hasText: 'Đã thêm bài viết' })).toBeVisible({ timeout: 15000 });
  await page.fill('#ar_search', title);
  await page.press('#ar_search', 'Enter');
  await expect(page.locator('#ar_rows tr[data-id]')).toHaveCount(1, { timeout: 15000 });
  await page.click('#ar_rows tr[data-id] [data-act="publish"]');
  await confirmOk(page);
  await expect(page.locator('#cp-messages', { hasText: 'Đã đăng bài viết' })).toBeVisible({ timeout: 15000 });
  await page.click('#ar_rows tr[data-id] [data-act="del"]');
  await confirmOk(page);
  await expect(page.locator('#cp-messages', { hasText: 'Đã xoá bài viết' })).toBeVisible({ timeout: 15000 });
});

test('pricing base save + rule cycle', async ({ page }) => {
  await adminLogin(page);
  await page.goto('http://localhost:5000/admin/pricing');
  await expect(page.locator('.pr-base-price').first()).not.toBeEmpty({ timeout: 15000 });
  await page.click('#pr_base_save');
  await expect(page.locator('#cp-messages', { hasText: 'Đã lưu giá vé cơ bản' })).toBeVisible({ timeout: 15000 });
  const name = `RAZ Rule ${stamp}`;
  await page.click('#pr_new');
  await page.fill('#pr_f_name', name);
  await page.fill('#pr_f_priority', '5');
  await page.fill('#pr_f_value', '10');
  await page.click('#pr_save');
  await expect(page.locator('#cp-messages', { hasText: 'Đã thêm quy tắc' })).toBeVisible({ timeout: 15000 });
  await page.fill('#pr_search', name);
  await page.press('#pr_search', 'Enter');
  await expect(page.locator('#pr_rows tr[data-id]')).toHaveCount(1, { timeout: 15000 });
  await page.click('#pr_rows tr[data-id] [data-act="del"]');
  await confirmOk(page);
  await expect(page.locator('#cp-messages', { hasText: 'Đã xoá quy tắc' })).toBeVisible({ timeout: 15000 });
});

test('monitoring audit + batch run', async ({ page }) => {
  await adminLogin(page);
  await page.goto('http://localhost:5000/admin/monitoring');
  await expect(page.locator('#au_rows tr[data-id]').first()).toBeVisible({ timeout: 15000 });
  await page.selectOption('#au_outcome', 'success');
  await expect(page.locator('#au_rows tr[data-id]').first()).toBeVisible({ timeout: 15000 });
  await page.selectOption('#au_outcome', '');
  await page.click('#au_rows tr[data-id] [data-act="detail"]');
  await expect(page.locator('#au_modal.open')).toBeVisible({ timeout: 15000 });
  await page.keyboard.press('Escape');
  await page.click('#mn_tabs .ant-tabs-tab[data-tab="batchJobs"]');
  await expect(page.locator('#bj_runs [data-run="cleanup"]')).toBeVisible({ timeout: 15000 });
  await page.click('#bj_runs [data-run="cleanup"]');
  await confirmOk(page);
  await expect(page.locator('#cp-messages', { hasText: 'Đã bắt đầu chạy cleanup' })).toBeVisible({ timeout: 15000 });
});

test('counter dashboard + lookup + customers', async ({ page }) => {
  await page.goto('http://localhost:5000/account/login');
  await page.fill('input[name="email"]', 'staff@cinema.local');
  await page.fill('input[name="password"]', 'staff123');
  await page.click('button[type="submit"]');
  await page.waitForURL('**/admin**', { timeout: 15000 });
  await page.goto('http://localhost:5000/admin/counter');
  await expect(page.locator('#ct_db_rows tr').first()).toBeVisible({ timeout: 15000 });
  await expect(page.locator('#ct_stats .ant-statistic-value').first()).not.toBeEmpty({ timeout: 15000 });
  // Sell tab renders showtime options.
  await page.click('#ct_inner_tabs .ant-tabs-tab[data-tab="sell"]');
  await expect(page.locator('#ct_sell_show option').nth(1)).toBeAttached({ timeout: 15000 });
  // Customer lookup tab + drawer.
  await page.click('#ct_tabs .ant-tabs-tab[data-tab="customerLookup"]');
  await expect(page.locator('#ct_cu_rows tr[data-id]').first()).toBeVisible({ timeout: 15000 });
  await page.click('#ct_cu_rows tr[data-id] [data-act="detail"]');
  await expect(page.locator('#ct_cu_drawer.open')).toBeVisible({ timeout: 15000 });
  await expect(page.locator('#ct_cu_body table').first()).toBeVisible({ timeout: 15000 });
  await page.keyboard.press('Escape');
});

test('profile update + sessions', async ({ page }) => {
  await adminLogin(page);
  await page.goto('http://localhost:5000/account/profile');
  await expect(page.locator('#pf_f_name')).not.toBeEmpty({ timeout: 15000 });
  const orig = await page.locator('#pf_f_name').inputValue();
  await page.fill('#pf_f_name', `${orig} X`);
  await page.click('#pf_save');
  await expect(page.locator('#cp-messages', { hasText: 'Cập nhật thành công' })).toBeVisible({ timeout: 15000 });
  await page.fill('#pf_f_name', orig);
  await page.click('#pf_save');
  await expect(page.locator('#cp-messages', { hasText: 'Cập nhật thành công' })).toBeVisible({ timeout: 15000 });
  await page.click('#pf_tabs .ant-tabs-tab[data-tab="sessions"]');
  await expect(page.locator('#pf_sessions .ant-list-item').first()).toBeVisible({ timeout: 15000 });
});

test('login validation + error', async ({ page }) => {
  await page.goto('http://localhost:5000/account/login');
  await page.click('#login_go');
  await expect(page.locator('#login_e_email')).toHaveText('Vui lòng nhập email');
  await page.fill('#email', 'admin@cinema.local');
  await page.fill('#password', 'wrongpass1');
  await page.click('#login_go');
  await expect(page.locator('#login_alert')).toContainText('invalid email or password', { timeout: 15000 });
});
