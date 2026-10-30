import { defineConfig, devices } from '@playwright/test';

const phone = {
  locale: 'en-US',
  timezoneId: 'America/Los_Angeles',
};

export default defineConfig({
  testDir: 'tests',
  testMatch: '**/*.spec.js',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  timeout: 60000,
  expect: { timeout: 10000 },
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'python3 -m http.server 4173 --directory site --bind 127.0.0.1',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 20000,
  },
  projects: [
    { name: 'iphone-14', use: { ...devices['iPhone 14'], ...phone } },
    { name: 'pixel-7', use: { ...devices['Pixel 7'], ...phone } },
  ],
});
