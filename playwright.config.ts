import { defineConfig } from "@playwright/test";

// The tests expect the demo data (`npm run db:seed -- --reset`) and a running app.
// E2E_BASE_URL and CHROME_PATH override the defaults below.
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  reporter: "line",
  outputDir: "/tmp/wecomconnect-playwright",
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000",
    locale: "he-IL",
    launchOptions: {
      executablePath: process.env.CHROME_PATH ?? "/usr/bin/google-chrome"
    }
  }
});
