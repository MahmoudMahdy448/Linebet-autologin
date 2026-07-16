import { defineConfig } from '@playwright/test';
import dotenv from 'dotenv';

dotenv.config({ override: true });

export default defineConfig({
  testDir: './tests',
  timeout: 0,
  use: {
    headless: process.env.HEADLESS === 'true',
    screenshot: 'off',
    trace: 'off',
    viewport: { width: 1440, height: 960 }
  }
});
