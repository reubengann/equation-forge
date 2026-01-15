import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "tests",
  fullyParallel: true,
  timeout: 60_000,
  use: {
    baseURL: "http://localhost:4173",
    headless: !(process.env.HEADED || process.env.PWDEBUG),
    trace: "on-first-retry",
  },
  webServer: {
    command: "npm run dev -- --host --port 4173",
    url: "http://localhost:4173",
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
