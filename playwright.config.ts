// SPDX-License-Identifier: GPL-3.0-or-later
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  webServer: { command: 'npx http-server dist -p 5599 -s', port: 5599, reuseExistingServer: true },
  use: {
    baseURL: 'http://localhost:5599',
    launchOptions: { args: ['--no-sandbox'] },
  },
});
