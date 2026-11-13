import { spawnSync } from "node:child_process";

// Exercise the same subdirectory and consent-gated analytics build locally and in CI.
const env = {
  ...process.env,
  SITE_URL: "https://website.test",
  BASE_PATH: "/diagrams/",
  PUBLIC_GA_MEASUREMENT_ID: "G-TEST12345",
  PUBLIC_SITE_OPERATOR: "Website test operator",
  PUBLIC_PRIVACY_EMAIL: "privacy@example.test",
  PUBLIC_ANALYTICS_RETENTION_MONTHS: "2",
};
const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
for (const args of [["build:website"], ["--filter", "@dumb-diagrams/website", "test"]]) {
  const result = spawnSync(pnpm, args, { env, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
