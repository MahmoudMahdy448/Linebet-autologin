import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'fs';
import path from 'path';
import { test, expect } from '@playwright/test';

const loginUrl = 'https://linebet.com/en/user/login';
const rechargeUrl = 'https://linebet.com/en/office/recharge';
const accountsFilePath = path.resolve(process.cwd(), 'accounts.csv');
const failuresLogPath = path.resolve(process.cwd(), 'logs', 'failed-accounts.log');

function parseCsvLine(line) {
  const values = [];
  let current = '';
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];

    if (character === '"') {
      const nextCharacter = line[index + 1];

      if (inQuotes && nextCharacter === '"') {
        current += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (character === ',' && !inQuotes) {
      values.push(current.trim());
      current = '';
    } else {
      current += character;
    }
  }

  values.push(current.trim());
  return values;
}

function parseCsv(text) {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (!lines.length) {
    return [];
  }

  const headers = parseCsvLine(lines[0]).map((header) => header.toLowerCase());

  return lines.slice(1).map((line) => {
    const values = parseCsvLine(line);

    return headers.reduce((row, header, index) => {
      row[header] = values[index] || '';
      return row;
    }, {});
  });
}

function loadAccounts() {
  if (!existsSync(accountsFilePath)) {
    return [];
  }

  const csvText = readFileSync(accountsFilePath, 'utf8');
  const rows = parseCsv(csvText);

  return rows
    .map((row) => ({
      username: row.username || row.email || '',
      password: row.password || ''
    }))
    .filter((account) => account.username && account.password);
}

function getAccountsToProcess() {
  const accountsFromCsv = loadAccounts();

  if (accountsFromCsv.length > 0) {
    return accountsFromCsv;
  }

  return [
    {
      username: process.env.LINEBET_USERNAME || '',
      password: process.env.LINEBET_PASSWORD || ''
    }
  ];
}

function logFailure(account, error) {
  const timestamp = new Date().toISOString();
  const message = `[${timestamp}] ${account.username} | ${error.message}\n`;

  mkdirSync(path.dirname(failuresLogPath), { recursive: true });
  appendFileSync(failuresLogPath, message, 'utf8');
}

const phoneCounts = new Map();

function uniquePhoneFilename(phone) {
  const count = phoneCounts.get(phone) || 0;
  phoneCounts.set(phone, count + 1);

  if (count === 0) {
    return `screenshots/${phone}.jpg`;
  }

  return `screenshots/${phone} (${count + 1}).jpg`;
}

async function waitForLoginForm(page) {
  const selectors = [
    'input#username',
    'input[name="username"]',
    'input[placeholder*="username" i]',
    'input[placeholder*="email" i]',
    'input[placeholder*="phone" i]',
    'input[type="text"]'
  ];

  for (const selector of selectors) {
    const input = page.locator(selector);
    if (await input.count() > 0 && await input.first().isVisible().catch(() => false)) {
      return input.first();
    }
  }

  return null;
}

async function waitForPasswordInput(page) {
  const selectors = [
    'input#username-password',
    'input[name="password"]',
    'input[type="password"]'
  ];

  for (const selector of selectors) {
    const input = page.locator(selector);
    if (await input.count() > 0 && await input.first().isVisible().catch(() => false)) {
      return input.first();
    }
  }

  return null;
}

async function runAccountFlow(page, account, index, total) {
  const { username, password } = account;

  if (!username || !password) {
    throw new Error(
      'Set LINEBET_USERNAME and LINEBET_PASSWORD in your environment or .env file, or add rows to accounts.csv.'
    );
  }

  console.log(`[${index + 1}/${total}] Signing in with ${username}`);

  await page.goto(loginUrl, { waitUntil: 'networkidle' });

  let loginInput = null;
  let passwordInput = null;

  for (let attempt = 0; attempt < 5; attempt++) {
    loginInput = await waitForLoginForm(page);
    passwordInput = await waitForPasswordInput(page);
    if (loginInput && passwordInput) break;
    await page.waitForTimeout(2000);
  }

  if (!loginInput || !passwordInput) {
    throw new Error('Could not find login or password input fields.');
  }

  const submitButton = page.locator('button[type="submit"]').first();

  await loginInput.fill(username);
  await passwordInput.fill(password);

  await page.waitForTimeout(500);

  if (await submitButton.isVisible().catch(() => false)) {
    await submitButton.click();
  } else {
    await passwordInput.press('Enter');
  }

  let loginErrorFromToast = '';

  const redirectPromise = page.waitForURL(
    (url) => !url.toString().includes('/user/login'),
    { timeout: 15000 }
  );

  const toastPromise = (async () => {
    try {
      const handle = await page.waitForSelector(
        '.notification-alert__content, .ui-popup--status-error, .error-message, .auth-error',
        { state: 'visible', timeout: 15000 }
      );
      if (handle) {
        loginErrorFromToast = (await handle.textContent().catch(() => '')).trim();
      }
    } catch {
      // toast did not appear - login may have succeeded
    }
  })();

  await Promise.race([redirectPromise, toastPromise]).catch(() => {});

  await page.waitForTimeout(2000);

  const currentUrl = page.url();
  const loginFormStillVisible = await loginInput.isVisible().catch(() => false);

  if (currentUrl.includes('/user/login') && loginFormStillVisible) {
    throw new Error(
      loginErrorFromToast
        ? `Login failed: ${loginErrorFromToast}`
        : 'Login failed; the credentials may be invalid or the site rejected the login attempt.'
    );
  }

  console.log(`[${index + 1}/${total}] Login successful, navigating to deposit page`);

  await page.goto(rechargeUrl, { waitUntil: 'domcontentloaded' });

  await page.waitForTimeout(5000);

  let paymentFrame = null;
  const searchDeadline = Date.now() + 30000;

  while (Date.now() < searchDeadline) {
    for (const frame of page.frames()) {
      try {
        const count = await frame.locator('#vodafone_cash_linebet_3').count();
        if (count > 0) {
          paymentFrame = frame;
          break;
        }
      } catch {
        // frame may be detached or cross-origin - skip
      }
    }
    if (paymentFrame) break;
    await page.waitForTimeout(1000);
  }

  if (!paymentFrame) {
    throw new Error('Payment frame with Vodafone option (#vodafone_cash_linebet_3) not found within 30 seconds.');
  }

  const vodafoneOption = paymentFrame.locator('#vodafone_cash_linebet_3');
  const paymentModal = paymentFrame.locator('#payment_modal_container');

  await vodafoneOption.click();

  await expect(paymentModal).toBeVisible({ timeout: 15000 });

  const closePopup = paymentFrame.locator('a.message-close');
  if (await closePopup.isVisible({ timeout: 3000 }).catch(() => false)) {
    await closePopup.click();
    await page.waitForTimeout(500);
  }

  await expect(paymentFrame.locator('#amount')).toBeVisible({ timeout: 15000 });
  await page.waitForTimeout(1000);

  const modalBox = await paymentModal.boundingBox();
  const viewport = await page.evaluate(() => ({
    width: window.innerWidth,
    height: window.innerHeight
  }));

  if (!modalBox) {
    throw new Error('Could not determine the Vodafone payment window position.');
  }

  const copyBtn = paymentFrame.locator('span.copy_content_btn.modal-message-btn[title="Copy"]');
  const modalText = await copyBtn.locator('..').textContent().catch(() => '');
  const phoneMatch = modalText.match(/01\d{9}/);
  const filename = phoneMatch
    ? uniquePhoneFilename(phoneMatch[0])
    : `screenshots/vodafone-deposit-${new Date().toISOString().replace(/[:.]/g, '-')}.jpg`;

  mkdirSync(path.dirname(filename), { recursive: true });

  await page.screenshot({
    path: filename,
    type: 'jpeg',
    quality: 80,
    clip: {
      x: 0,
      y: 0,
      width: viewport.width,
      height: Math.ceil(modalBox.y + modalBox.height)
    }
  });

  console.log(`[${index + 1}/${total}] Screenshot saved to ${filename}`);
}

test('sign in to Linebet', async ({ browser }) => {
  test.setTimeout(0);

  const accounts = getAccountsToProcess();
  console.log(`Loaded ${accounts.length} account(s) from accounts.csv`);

  if (!accounts.length) {
    throw new Error('No accounts available. Add rows to accounts.csv or set environment variables.');
  }

  const startIndex = parseInt(process.env.START_INDEX, 10) || 1;
  const startOffset = startIndex - 1;

  if (startOffset > 0 && startOffset < accounts.length) {
    console.log(`Starting execution from account #${startIndex} (${accounts[startOffset].username})`);
  }

  for (const [index, account] of accounts.entries()) {
    if (index < startOffset) {
      continue;
    }

    const context = await browser.newContext();
    const page = await context.newPage();

    try {
      await runAccountFlow(page, account, index, accounts.length);
    } catch (error) {
      console.error(
        `[${index + 1}/${accounts.length}] Failed for ${account.username}: ${error.message}`
      );
      logFailure(account, error);
    } finally {
      if (index < accounts.length - 1 && !page.isClosed()) {
        await page.waitForTimeout(2000);
      }

      await page.close().catch(() => {});
      await context.close().catch(() => {});
    }
  }
});
