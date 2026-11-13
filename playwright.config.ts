import { createServer, type AddressInfo } from "node:net";
import { defineConfig, devices } from "@playwright/test";
import { studioRegressions } from "./playwright.shared";

// Pick a free port once; Playwright workers re-load this config and inherit the env.
process.env.PLAYWRIGHT_PORT ??= String(
  await new Promise<number>((resolve) => {
    const server = createServer().listen(0, "127.0.0.1", () => {
      const { port } = server.address() as AddressInfo;
      server.close(() => resolve(port));
    });
  }),
);
const port = Number(process.env.PLAYWRIGHT_PORT);
const baseURL = `http://127.0.0.1:${port}`;
const serverCommand =
  process.env.PLAYWRIGHT_USE_PREVIEW === "true"
    ? `pnpm --dir packages/editor exec vite preview --host 127.0.0.1 --port ${port}`
    : `pnpm catalog:stage && pnpm --dir packages/editor exec vite --host 127.0.0.1 --port ${port}`;
export default defineConfig({
  ...studioRegressions,
  outputDir: ".artifacts/playwright/test-results",
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
  ],
  use: {
    ...studioRegressions.use,
    baseURL,
    storageState: {
      cookies: [],
      origins: [
        {
          origin: baseURL,
          localStorage: [{ name: "dumb-diagrams:browser-compatibility-notice-dismissed", value: "1" }],
        },
      ],
    },
  },
  webServer: {
    command: serverCommand,
    url: `${baseURL}/`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
