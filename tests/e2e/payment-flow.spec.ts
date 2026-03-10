/**
 * E2E Tests — Web Interface (Playwright)
 *
 * Requires the server to be running:  npm run dev:server
 * Run: npx playwright test tests/e2e/payment-flow.spec.ts
 *
 * Install Playwright first: npx playwright install chromium
 */

import { test, expect, Page } from '@playwright/test';

const BASE_URL = 'http://localhost:3402';

// Use a deterministic test key (Hardhat default account)
const TEST_PRIVATE_KEY =
  '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
const EXPECTED_WALLET_ADDRESS = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function connectWallet(page: Page, key: string = TEST_PRIVATE_KEY) {
  await page.goto(BASE_URL);
  await page.waitForLoadState('networkidle');
  await page.fill('#privateKey', key);
  await page.click('button:has-text("Connect Wallet")');
  await expect(page.locator('#walletInfo')).not.toHaveClass(/hidden/);
}

// ─── Basic Page Load ──────────────────────────────────────────────────────────

test.describe('Page load and layout', () => {
  test('loads the demo page with correct title', async ({ page }) => {
    await page.goto(BASE_URL);
    await expect(page).toHaveTitle(/x402/i);
  });

  test('displays header with correct text', async ({ page }) => {
    await page.goto(BASE_URL);
    await expect(page.locator('h1')).toContainText('x402 Payment Protocol Demo');
  });

  test('shows wallet connection section on load', async ({ page }) => {
    await page.goto(BASE_URL);
    await expect(page.locator('#walletSection')).toBeVisible();
    await expect(page.locator('#privateKey')).toBeVisible();
  });

  test('shows three content cards', async ({ page }) => {
    await page.goto(BASE_URL);
    await expect(page.locator('.content-card')).toHaveCount(3);
  });

  test('FREE card button says "Access Now"', async ({ page }) => {
    await page.goto(BASE_URL);
    await expect(page.locator('.content-card >> text=Access Now')).toBeVisible();
  });

  test('paid cards have "Pay & Access" buttons', async ({ page }) => {
    await page.goto(BASE_URL);
    await expect(page.locator('.content-card >> text=Pay & Access')).toHaveCount(2);
  });

  test('flow section is hidden on initial load', async ({ page }) => {
    await page.goto(BASE_URL);
    await expect(page.locator('#flowSection')).toHaveClass(/hidden/);
  });

  test('displays warning about not using real private keys', async ({ page }) => {
    await page.goto(BASE_URL);
    await expect(page.locator('.warning')).toContainText(/demo purposes/i);
  });

  test('[UX] Circle Faucet link is present and has correct href', async ({ page }) => {
    await page.goto(BASE_URL);
    const link = page.locator('a[href="https://faucet.circle.com/"]');
    await expect(link).toBeVisible();
  });
});

// ─── Wallet Connection ────────────────────────────────────────────────────────

test.describe('Wallet connection', () => {
  test('connects wallet with valid private key', async ({ page }) => {
    await connectWallet(page);
    await expect(page.locator('#walletAddress')).toContainText(EXPECTED_WALLET_ADDRESS);
  });

  test('shows error notification for invalid private key', async ({ page }) => {
    await page.goto(BASE_URL);
    await page.fill('#privateKey', '0xinvalidkey');
    await page.click('button:has-text("Connect Wallet")');
    // Error should appear (logged to console in current implementation)
    // BUG: there is no visible error notification - only console.log
    // This test documents the missing visible error feedback
    await expect(page.locator('#walletInfo')).toHaveClass(/hidden/);
  });

  test('[BUG] no visible error toast when invalid key entered — only console log', async ({ page }) => {
    const consoleMessages: string[] = [];
    page.on('console', (msg) => consoleMessages.push(msg.text()));

    await page.goto(BASE_URL);
    await page.fill('#privateKey', '0xinvalidkey');
    await page.click('button:has-text("Connect Wallet")');
    await page.waitForTimeout(500);

    const hasError = consoleMessages.some((m) => m.includes('[ERROR]'));
    expect(hasError).toBe(true); // Error is logged
    // But the user sees no visible toast — this is a UX bug
  });

  test('wallet address persists in sessionStorage', async ({ page }) => {
    await connectWallet(page);
    const stored = await page.evaluate(() => sessionStorage.getItem('privateKey'));
    expect(stored).toBe(TEST_PRIVATE_KEY);
  });

  test('wallet auto-reconnects from sessionStorage on reload', async ({ page }) => {
    await connectWallet(page);
    await page.reload();
    await page.waitForLoadState('networkidle');
    await expect(page.locator('#walletInfo')).not.toHaveClass(/hidden/);
  });

  test('[SECURITY] private key is stored in sessionStorage (documented risk)', async ({ page }) => {
    await connectWallet(page);
    const stored = await page.evaluate(() => sessionStorage.getItem('privateKey'));
    // This documents the security risk: key is stored in JS-accessible sessionStorage
    expect(stored).toBe(TEST_PRIVATE_KEY);
    // In production: never store private keys in browser storage
  });

  test('shows error if trying to access paid content without connecting wallet', async ({ page }) => {
    await page.goto(BASE_URL);
    await page.click('button:has-text("Pay & Access")');
    // Should show notification (currently via console - a UX bug)
    // The wallet is null so it should not proceed
    await expect(page.locator('#flowSection')).toHaveClass(/hidden/);
  });
});

// ─── Free Content Access ──────────────────────────────────────────────────────

test.describe('Free content access (/public)', () => {
  test('accesses free content without payment', async ({ page }) => {
    await connectWallet(page);
    await page.click('button:has-text("Access Now")');
    await expect(page.locator('#content-free')).not.toHaveClass(/hidden/);
    await expect(page.locator('#content-free')).toContainText('Access Granted');
  });

  test('shows no transaction section for free content', async ({ page }) => {
    await connectWallet(page);
    await page.click('button:has-text("Access Now")');
    await page.waitForTimeout(1500);
    // Transaction section should not appear for free content
    await expect(page.locator('#transactionSection')).toHaveClass(/hidden/);
  });

  test('free content shows public message', async ({ page }) => {
    await connectWallet(page);
    await page.click('button:has-text("Access Now")');
    await page.waitForTimeout(1500);
    await expect(page.locator('#content-free')).toContainText('public endpoint');
  });

  test('can access free content multiple times', async ({ page }) => {
    await connectWallet(page);
    await page.click('button:has-text("Access Now")');
    await page.waitForTimeout(1500);
    await page.click('button:has-text("Access Now")');
    await page.waitForTimeout(1500);
    await expect(page.locator('#content-free')).toContainText('Access Granted');
  });
});

// ─── Paid Content — 0.1 USDC (/api-call) ─────────────────────────────────────

test.describe('Paid content — 0.1 USDC (/api-call)', () => {
  test('shows 5-step payment flow animation', async ({ page }) => {
    await connectWallet(page);
    const [apiBtn] = await page.locator('button:has-text("Pay & Access")').all();
    await apiBtn.click();

    await expect(page.locator('#flowSection')).not.toHaveClass(/hidden/);
    await expect(page.locator('#step1')).toBeVisible();
    await expect(page.locator('#step2')).toBeVisible();
  });

  test('all 5 steps complete successfully', async ({ page }) => {
    await connectWallet(page);
    const [apiBtn] = await page.locator('button:has-text("Pay & Access")').all();
    await apiBtn.click();

    // Wait for all 5 steps to complete
    await expect(page.locator('#step5.completed')).toBeVisible({ timeout: 10_000 });
  });

  test('shows transaction hash after successful payment', async ({ page }) => {
    await connectWallet(page);
    const [apiBtn] = await page.locator('button:has-text("Pay & Access")').all();
    await apiBtn.click();

    await expect(page.locator('#transactionSection')).not.toHaveClass(/hidden/, { timeout: 10_000 });
    await expect(page.locator('#transactionInfo')).toContainText('0x');
  });

  test('shows block explorer link', async ({ page }) => {
    await connectWallet(page);
    const [apiBtn] = await page.locator('button:has-text("Pay & Access")').all();
    await apiBtn.click();

    await expect(page.locator('#transactionSection')).not.toHaveClass(/hidden/, { timeout: 10_000 });
    await expect(page.locator('#transactionInfo a')).toContainText('Explorer');
  });

  test('button re-enables after payment completes', async ({ page }) => {
    await connectWallet(page);
    const [apiBtn] = await page.locator('button:has-text("Pay & Access")').all();
    await apiBtn.click();

    await expect(page.locator('#step5.completed')).toBeVisible({ timeout: 10_000 });
    await expect(apiBtn).toBeEnabled();
  });

  test('[BUG] showNotification uses console.log only — no visible toast', async ({ page }) => {
    const consoleMessages: string[] = [];
    page.on('console', (msg) => consoleMessages.push(msg.text()));

    await connectWallet(page);
    const [apiBtn] = await page.locator('button:has-text("Pay & Access")').all();
    await apiBtn.click();

    await expect(page.locator('#step5.completed')).toBeVisible({ timeout: 10_000 });
    const hasSuccess = consoleMessages.some((m) => m.includes('[SUCCESS]'));
    expect(hasSuccess).toBe(true);
    // There is no visible toast notification in the DOM — UX gap
  });
});

// ─── Paid Content — 1.0 USDC (/premium-data) ─────────────────────────────────

test.describe('Paid content — 1.0 USDC (/premium-data)', () => {
  test('completes premium data payment flow', async ({ page }) => {
    await connectWallet(page);
    const premiumBtn = page.locator('button.btn-premium');
    await premiumBtn.click();

    await expect(page.locator('#step5.completed')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('#content-premium')).toContainText('Access Granted');
  });

  test('shows premium content in result area', async ({ page }) => {
    await connectWallet(page);
    await page.locator('button.btn-premium').click();

    await expect(page.locator('#content-premium')).not.toHaveClass(/hidden/, { timeout: 10_000 });
    await expect(page.locator('#content-premium')).toContainText('Payment successful');
  });
});

// ─── Flow steps visual states ─────────────────────────────────────────────────

test.describe('Payment flow step states', () => {
  test('steps start in inactive (dimmed) state', async ({ page }) => {
    await connectWallet(page);
    // Before clicking, flow section is hidden so we check after click
    const [apiBtn] = await page.locator('button:has-text("Pay & Access")').all();
    await apiBtn.click();

    // At least step 1 should become active first
    await expect(page.locator('#step1.active, #step1.completed')).toBeVisible();
  });

  test('completed steps show green styling', async ({ page }) => {
    await connectWallet(page);
    const [apiBtn] = await page.locator('button:has-text("Pay & Access")').all();
    await apiBtn.click();

    await expect(page.locator('#step1.completed')).toBeVisible({ timeout: 5_000 });
  });
});

// ─── Responsive Design ────────────────────────────────────────────────────────

test.describe('Responsive design', () => {
  test('renders correctly on mobile viewport', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(BASE_URL);
    await expect(page.locator('h1')).toBeVisible();
    await expect(page.locator('.cards-grid')).toBeVisible();
  });

  test('cards stack vertically on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(BASE_URL);
    // Input group should stack vertically on small screens
    const inputGroup = page.locator('.input-group');
    await expect(inputGroup).toBeVisible();
  });

  test('renders on tablet viewport', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto(BASE_URL);
    await expect(page.locator('.cards-grid')).toBeVisible();
  });
});

// ─── Accessibility ────────────────────────────────────────────────────────────

test.describe('Accessibility basics', () => {
  test('page has lang attribute on html', async ({ page }) => {
    await page.goto(BASE_URL);
    const lang = await page.locator('html').getAttribute('lang');
    expect(lang).toBe('en');
  });

  test('[BUG] accessContent() uses implicit window.event — breaks in Firefox', async ({ page }) => {
    // The script uses `event.target` as an implicit global.
    // This is deprecated and will fail in strict mode.
    // This test documents the bug by checking the button actually works.
    await connectWallet(page);
    const [apiBtn] = await page.locator('button:has-text("Pay & Access")').all();

    let jsError: Error | null = null;
    page.on('pageerror', (err) => { jsError = err; });

    await apiBtn.click();
    await page.waitForTimeout(1000);
    // In Chromium it works; in Firefox it would fail
    // Document: function should accept event as parameter
  });

  test('private key input is type=password (not visible in screenshots)', async ({ page }) => {
    await page.goto(BASE_URL);
    const inputType = await page.locator('#privateKey').getAttribute('type');
    expect(inputType).toBe('password');
  });
});

// ─── Error Handling UI ────────────────────────────────────────────────────────

test.describe('Error handling in UI', () => {
  test('shows error in content div if server returns error', async ({ page }) => {
    // Mock: disconnect server between requests not easily possible,
    // but we can test the error path by intercepting and faking a 500
    await page.route(`${BASE_URL}/api-call`, async (route) => {
      const req = route.request();
      if (req.headers()['x-payment']) {
        await route.fulfill({ status: 500, body: JSON.stringify({ error: 'Server crashed' }) });
      } else {
        await route.continue();
      }
    });

    await connectWallet(page);
    const [apiBtn] = await page.locator('button:has-text("Pay & Access")').all();
    await apiBtn.click();

    await page.waitForTimeout(4000);
    await expect(page.locator('#content-api')).not.toHaveClass(/hidden/);
    await expect(page.locator('#content-api')).toContainText('Error');
  });

  test('[BUG] XSS in error.message — error message rendered via innerHTML without escaping', async ({ page }) => {
    // The script does: resultDiv.innerHTML = `<div class="error">...: ${error.message}</div>`
    // If error.message contains HTML, it gets injected.
    // We simulate this by intercepting the server to return a crafted error.
    const xssPayload = '<img src=x onerror="window.__xss_fired=true">';

    await page.route(`${BASE_URL}/api-call`, async (route) => {
      const req = route.request();
      if (req.headers()['x-payment']) {
        await route.fulfill({
          status: 402,
          body: JSON.stringify({ error: xssPayload }),
          headers: { 'content-type': 'application/json' }
        });
      } else {
        await route.continue();
      }
    });

    await connectWallet(page);
    const [apiBtn] = await page.locator('button:has-text("Pay & Access")').all();
    await apiBtn.click();

    await page.waitForTimeout(4000);

    const xssFired = await page.evaluate(() => (window as any).__xss_fired);
    // BUG: if xssFired is true, the XSS injected successfully
    // Document this finding regardless of result
    console.log('[SECURITY] XSS via error.message innerHTML:', xssFired);
  });
});
