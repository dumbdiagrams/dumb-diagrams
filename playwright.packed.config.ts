import { createServer, type AddressInfo } from "node:net";
import { defineConfig } from "@playwright/test";

// Pick a free port once; Playwright workers re-load this config and inherit the env.
process.env.PLAYWRIGHT_PACKED_PORT ??= String(
  await new Promise<number>((resolve) => {
    const server = createServer().listen(0, "127.0.0.1", () => {
      const { port } = server.address() as AddressInfo;
      server.close(() => resolve(port));
    });
  }),
);
const baseURL = `http://127.0.0.1:${process.env.PLAYWRIGHT_PACKED_PORT}`;

export default defineConfig({
  testDir: "./e2e-packed",
  outputDir: ".artifacts/playwright/packed-test-results",
  timeout: 60_000,
  expect: {
    timeout: 12_000,
  },
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "node scripts/start-packed-studio-e2e.mjs",
    url: `${baseURL}/`,
    reuseExistingServer: false,
    timeout: 180_000,
  },
});
