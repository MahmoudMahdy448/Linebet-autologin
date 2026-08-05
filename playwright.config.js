import { defineConfig } from '@playwright/test';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ override: true });

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
        `--disk-cache-dir=${path.join(process.cwd(), '.browser-cache')}`,
        '--disk-cache-size=1073741824',
        '--no-sandbox'
      ]
    }
  }
});
