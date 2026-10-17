import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/ui',
  fullyParallel: false,
  workers: 1,
  timeout: 60000,
  retries: 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    headless: true,
    viewport: { width: 1180, height: 900 },
    launchOptions: process.env.PLAYWRIGHT_EXECUTABLE_PATH
      ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH, args: ['--no-sandbox'] }
      : {},
  },
  webServer: {
    command: 'npm run dev',
    url: 'http://127.0.0.1:1420',
    reuseExistingServer: !process.env.CI,
    timeout: 30000,
  },
});
