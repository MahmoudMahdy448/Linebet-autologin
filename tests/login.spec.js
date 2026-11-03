import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import path from 'path';
import { test, expect } from '@playwright/test';
import * as XLSX from 'xlsx';

const PHONE_PATTERN = /^01\d{9}$/;
const loginUrl = 'https://linebet.com/en/user/login';
const rechargeUrl = 'https://linebet.com/en/office/recharge';
const accountsFilePath = path.resolve(process.cwd(), 'accounts.csv');
const failuresLogPath = process.env.FAILED_LOG
  ? path.resolve(process.cwd(), process.env.FAILED_LOG)
  : path.resolve(process.cwd(), 'logs', 'failed-accounts.log');
// Demo runs point these at isolated demo files; production keeps the defaults.
const screenshotsDir = process.env.SCREENSHOTS_DIR || 'screenshots';
const numbersJsonPath = process.env.NUMBERS_JSON_FILE
  ? path.resolve(process.cwd(), process.env.NUMBERS_JSON_FILE)
  : path.resolve(process.cwd(), 'extracted_numbers.json');
// Only written when a caller asks for it (the demo panel does); production
// keeps its current behaviour.
const runSummaryPath = process.env.RUN_SUMMARY_FILE
  ? path.resolve(process.cwd(), process.env.RUN_SUMMARY_FILE)
  : null;

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
const uniqueNumbers = new Set();

function uniquePhoneFilename(phone) {
  const count = phoneCounts.get(phone) || 0;
  phoneCounts.set(phone, count + 1);

  if (count === 0) {
    return path.join(screenshotsDir, `${phone}.jpg`);
  }

  return path.join(screenshotsDir, `${phone} (${count + 1}).jpg`);
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

  await page.goto(loginUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(5000);

  const loginTab = page.locator('text=Log in').first();
  if (await loginTab.isVisible({ timeout: 3000 }).catch(() => false)) {
    await loginTab.click();
    await page.waitForTimeout(2000);
  }

  let loginInput = null;
  let passwordInput = null;

  for (let attempt = 0; attempt < 10; attempt++) {
    loginInput = await waitForLoginForm(page);
    passwordInput = await waitForPasswordInput(page);
    if (loginInput && passwordInput) break;
    console.log(`  Attempt ${attempt + 1}: form not ready, waiting...`);
    await page.waitForTimeout(3000);
  }

  if (!loginInput || !passwordInput) {
    await page.screenshot({ path: path.join(screenshotsDir, `debug-login-${index + 1}.jpg`), type: 'jpeg', quality: 80 });
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
        loginErrorFromToast = (await handle.textContent().catch(() => '')).trim()
          .replace(/^Error/i, '')
          .replace(/Ok$/i, '')
          .trim();
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

  const vodafoneSelector = '[id^="vodafone_cash_linebet_"]';
  const paymentModal = '#payment_modal_container';
  const amountField = '#amount';
  let scope = null;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (attempt > 0) {
      console.log(`  Payment option not ready, reloading recharge page (attempt ${attempt + 1})`);
    }

    await page.goto(rechargeUrl, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(5000);

    let vodafoneFound = false;
    let paymentFrame = null;

    const searchDeadline = Date.now() + 30000;

    while (Date.now() < searchDeadline) {
      const mainCount = await page.locator(vodafoneSelector).count();
      if (mainCount > 0) {
        vodafoneFound = true;
        break;
      }

      for (const frame of page.frames()) {
        try {
          const count = await frame.locator(vodafoneSelector).count();
          if (count > 0) {
            paymentFrame = frame;
            vodafoneFound = true;
            break;
          }
        } catch {
          // frame may be detached or cross-origin - skip
        }
      }
      if (vodafoneFound) break;
      await page.waitForTimeout(1000);
    }

    if (!vodafoneFound) {
      const allIds = await page.evaluate(() => {
        return [...document.querySelectorAll('[id]')].map(el => el.id).filter(id => id.toLowerCase().includes('voda') || id.toLowerCase().includes('payment') || id.toLowerCase().includes('modal'));
      });
      console.log('  Found IDs on page:', allIds);
      for (const frame of page.frames()) {
        try {
          const frameIds = await frame.evaluate(() => {
            return [...document.querySelectorAll('[id]')].map(el => el.id).filter(id => id.toLowerCase().includes('voda') || id.toLowerCase().includes('payment') || id.toLowerCase().includes('modal'));
          });
          if (frameIds.length) console.log('  Found IDs in frame:', frameIds);
        } catch {}
      }
      mkdirSync(screenshotsDir, { recursive: true });
      await page.screenshot({ path: path.join(screenshotsDir, `debug-deposit-${index + 1}.jpg`), type: 'jpeg', quality: 80, fullPage: true });
      throw new Error('Vodafone option (#vodafone_cash_linebet_3) not found within 30 seconds.');
    }

    scope = paymentFrame || page;
    const vodafoneOption = scope.locator(vodafoneSelector).first();
    const modalLocator = scope.locator(paymentModal);

    await vodafoneOption.click().catch(() => {});

    await expect(modalLocator).toBeVisible({ timeout: 15000 });

    const closePopup = scope.locator('a.message-close');
    if (await closePopup.isVisible({ timeout: 3000 }).catch(() => false)) {
      await closePopup.click();
      await page.waitForTimeout(500);
    }

    try {
      await expect(scope.locator(amountField)).toBeVisible({ timeout: 15000 });
      break;
    } catch {
      mkdirSync(screenshotsDir, { recursive: true });
      await page.screenshot({ path: path.join(screenshotsDir, `debug-modal-${index + 1}-${attempt + 1}.jpg`), type: 'jpeg', quality: 80, fullPage: true });
      const modalHtml = await modalLocator.evaluate((el) => el.outerHTML).catch(() => '');
      console.log(`  #amount not found (attempt ${attempt + 1}). Modal HTML snippet:`, modalHtml.slice(0, 2000));
      if (attempt === 2) {
        throw new Error('Payment modal opened but amount field (#amount) never appeared within 3 attempts.');
      }
    }
  }

  await page.waitForTimeout(1000);

  const modalBox = await scope.locator(paymentModal).boundingBox();
  const viewport = await page.evaluate(() => ({
    width: window.innerWidth,
    height: window.innerHeight
  }));

  if (!modalBox) {
    throw new Error('Could not determine the Vodafone payment window position.');
  }

  const copyBtn = scope.locator('span.copy_content_btn.modal-message-btn[title="Copy"]');

  await expect(copyBtn.first()).toBeVisible({ timeout: 15_000 });
  await copyBtn.first().click();
  await page.waitForTimeout(500);

  let extractedNumber = await page.evaluate(() => navigator.clipboard.readText()).catch(() => '');

  if (!PHONE_PATTERN.test(extractedNumber)) {
    extractedNumber = await copyBtn.first().getAttribute('data-clipboard-text').catch(() => '') || '';
  }

  if (!PHONE_PATTERN.test(extractedNumber)) {
    const btnText = await copyBtn.first().textContent().catch(() => '');
    const btnMatch = (btnText || '').match(/01\d{9}/);
    extractedNumber = btnMatch ? btnMatch[0] : '';
  }

  if (!PHONE_PATTERN.test(extractedNumber)) {
    const parentText = await copyBtn.first().locator('..').textContent().catch(() => '');
    const parentMatch = (parentText || '').match(/01\d{9}/);
    extractedNumber = parentMatch ? parentMatch[0] : '';
  }

  if (!PHONE_PATTERN.test(extractedNumber)) {
    extractedNumber = '';
  }

  if (PHONE_PATTERN.test(extractedNumber)) {
    const amountInput = scope.locator('#amount');
    await amountInput.fill(extractedNumber);
    await page.waitForTimeout(500);
  }

  if (extractedNumber) {
    uniqueNumbers.add(extractedNumber);
    const existing = existsSync(numbersJsonPath)
      ? JSON.parse(readFileSync(numbersJsonPath, 'utf8'))
      : [];
    const merged = [...new Set([...existing, ...uniqueNumbers])];
    writeFileSync(numbersJsonPath, JSON.stringify(merged, null, 2), 'utf8');
  }

  const filename = extractedNumber
    ? uniquePhoneFilename(extractedNumber)
    : path.join(screenshotsDir, `vodafone-deposit-${new Date().toISOString().replace(/[:.]/g, '-')}.jpg`);

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
  const endIndex = parseInt(process.env.END_INDEX, 10) || accounts.length;
  const endOffset = Math.min(endIndex, accounts.length);
  const accountDelayMs = (Number.isFinite(parseInt(process.env.ACCOUNT_DELAY_SECONDS, 10)) ? parseInt(process.env.ACCOUNT_DELAY_SECONDS, 10) : 120) * 1000;

  uniqueNumbers.clear();

  if (startOffset > 0 && startOffset < accounts.length) {
    console.log(`Starting execution from account #${startIndex} (${accounts[startOffset].username})`);
  }
  console.log(`Processing accounts #${startIndex} through #${endOffset} (${endOffset - startOffset} total)`);
  if (accountDelayMs > 0) {
    console.log(`Waiting ${accountDelayMs / 1000}s between accounts (set ACCOUNT_DELAY_SECONDS to override)`);
  }
  const startedAt = new Date().toISOString();
  let succeeded = 0;
  let failed = 0;

  for (const [index, account] of accounts.entries()) {
    if (index < startOffset || index >= endOffset) {
      continue;
    }

    const context = await browser.newContext();
    await context.grantPermissions(['clipboard-read'], { origin: 'https://linebet.com' });
    const page = await context.newPage();

    try {
      await runAccountFlow(page, account, index, accounts.length);
      succeeded += 1;
    } catch (error) {
      failed += 1;
      console.error(
        `[${index + 1}/${accounts.length}] Failed for ${account.username}: ${error.message}`
      );
      logFailure(account, error);
    } finally {
      if (index < endOffset - 1 && !page.isClosed()) {
        if (accountDelayMs > 0) {
          const totalSeconds = Math.ceil(accountDelayMs / 1000);
          console.log(`  Cooling down ${totalSeconds}s before next account...`);
          for (let remaining = totalSeconds; remaining > 0; remaining -= 10) {
            console.log(`    ...${remaining}s left`);
            await page.waitForTimeout(Math.min(10, remaining) * 1000);
          }
        } else {
          await page.waitForTimeout(accountDelayMs);
        }
      }

      await page.close().catch(() => {});
      await context.close().catch(() => {});
    }
  }

  if (runSummaryPath) {
    try {
      writeFileSync(runSummaryPath, JSON.stringify({
        startedAt,
        endedAt: new Date().toISOString(),
        totalAccounts: Math.max(0, endOffset - startOffset),
        succeeded,
        failed,
        uniqueNumbers: uniqueNumbers.size
      }, null, 2), 'utf8');
    } catch {
      // monitoring must never fail the batch
    }
  }

  if (uniqueNumbers.size > 0) {
    const wb = XLSX.utils.book_new();
    const data = Array.from(uniqueNumbers).map((num) => ({ Phone: num }));
    const ws = XLSX.utils.json_to_sheet(data);
    XLSX.utils.book_append_sheet(wb, ws, 'Phone Numbers');
    const excelPath = process.env.EXCEL_FILE || 'extracted_numbers.xlsx';
    XLSX.writeFile(wb, excelPath);
    console.log(`Extracted ${uniqueNumbers.size} unique phone number(s) to ${excelPath}`);
  }
});
