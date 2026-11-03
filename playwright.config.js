import { defineConfig } from '@playwright/test';
import dotenv from 'dotenv';
import path from 'path';

// An explicitly passed HEADLESS (e.g. from start-headed.bat / start-headless.bat)
// must win over the .env file; otherwise fall back to .env values.
const explicitHeadless = process.env.HEADLESS;
dotenv.config({ override: true });
if (explicitHeadless !== undefined) {
  process.env.HEADLESS = explicitHeadless;
}

export default defineConfig({
  testDir: './tests',
  timeout: 0,
  use: {
    headless: process.env.HEADLESS === 'true',
    screenshot: 'off',
    trace: 'off',
    viewport: { width: 1440, height: 960 },
    launchOptions: {
      args: [
        `--disk-cache-dir=${path.resolve(process.cwd(), process.env.BROWSER_CACHE_DIR || '.browser-cache')}`,
        '--disk-cache-size=536870912',
        '--no-sandbox',
        '--disable-gpu'
      ]
    }
  }
});
