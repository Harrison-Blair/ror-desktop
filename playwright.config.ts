import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  outputDir: "./.fledge/tmp/playwright-results",
  use: {
    baseURL: "http://127.0.0.1:1428",
    headless: true,
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "npm run dev -- --port 1428 --host 127.0.0.1 --strictPort",
    url: "http://127.0.0.1:1428/e2e/fixture.html",
    reuseExistingServer: false,
  },
});
