import { defineConfig, devices } from "@playwright/test"

// End-to-end tests (Section 21). Starts the API (dev sign-in) and the web app unless
// they already run locally. In CI the web app is a production build (`next start`).
const CI = Boolean(process.env.CI)
const WEB_URL = "http://localhost:3000"

export default defineConfig({
  testDir: "./tests/e2e",
  workers: 1,
  forbidOnly: CI,
  reporter: CI ? [["github"], ["html", { open: "never" }]] : [["list"]],
  use: {
    baseURL: WEB_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        // Optional: a preinstalled Chromium (e.g. a cloud dev box); CI downloads its own.
        launchOptions: process.env.PW_CHROMIUM_PATH
          ? { executablePath: process.env.PW_CHROMIUM_PATH }
          : {},
      },
    },
  ],
  webServer: [
    {
      name: "api",
      command: "uv run uvicorn app.main:app --port 8000",
      cwd: "../api",
      url: "http://localhost:8000/api/v1/health",
      reuseExistingServer: !CI,
      timeout: 120_000,
      env: { ENV: "development", AUTH_DEV_BYPASS: "true", CORS_ORIGINS: WEB_URL },
    },
    {
      name: "web",
      command: CI ? "pnpm start" : "pnpm dev",
      url: WEB_URL,
      reuseExistingServer: !CI,
      timeout: 120_000,
    },
  ],
})
