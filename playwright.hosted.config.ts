import { defineConfig, devices } from "@playwright/test";
import { studioRegressions } from "./playwright.shared";

const port = Number(process.env.HOSTED_STUDIO_PLAYWRIGHT_PORT ?? 49323);
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  ...studioRegressions,
  outputDir: ".artifacts/playwright/hosted-test-results",
  projects: [
    {
      name: "hosted-shell",
      testDir: "./e2e-hosted",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "chromium",
      // Discover the original editor specs directly: no copied tests or wrappers.
      testDir: studioRegressions.testDir,
      use: {
        ...devices["Desktop Chrome"],
        storageState: {
          cookies: [],
          origins: [
            {
              origin: baseURL,
              localStorage: [
                {
                  name: "dumb-diagrams:browser-compatibility-notice-dismissed",
                  value: "1",
                },
                {
                  name: "dumb-diagrams:hosted-preferences:v1",
                  value: JSON.stringify({ welcomeDismissed: true, tourDismissed: true }),
                },
              ],
            },
          ],
        },
      },
    },
  ],
  use: { ...studioRegressions.use, baseURL },
  webServer: {
    command: "pnpm check:studio:hosted && node scripts/serve-hosted-studio.mjs",
    url: `${baseURL}/`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
