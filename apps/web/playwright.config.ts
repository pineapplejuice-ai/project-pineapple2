import { defineConfig } from '@playwright/test';

/** Expects the API (:4000) and the built web app (:3000) to be running; see docs/DEVELOPMENT.md. */
export default defineConfig({
  testDir: './e2e',
  timeout: 120000,
  expect: { timeout: 10000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: { baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000', viewport: { width: 1440, height: 900 }, trace: 'off', screenshot: 'only-on-failure' },
});
