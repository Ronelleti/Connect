import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  reporter: "line",
  outputDir: "/tmp/wecomconnect-playwright",
  use: {
    baseURL: "http://127.0.0.1:3000",
    locale: "he-IL",
    launchOptions: {
      executablePath: "/usr/bin/google-chrome"
    }
  }
});
