import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env.HOSTED_STUDIO_PLAYWRIGHT_PORT ?? 49323);
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: "./e2e-hosted",
  timeout: 45_000,
  reporter: "list",
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  use: { baseURL, screenshot: "only-on-failure", trace: "retain-on-failure" },
  webServer: {
    command: `pnpm check:studio:hosted && node scripts/serve-hosted-studio.mjs`,
    url: `${baseURL}/`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
