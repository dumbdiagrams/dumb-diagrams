import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 45_000,
  expect: {
    timeout: 10_000,
  },
  fullyParallel: true,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:5174",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "pnpm --dir packages/editor exec vite --host 127.0.0.1 --port 5174",
    url: "http://127.0.0.1:5174/",
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
