import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const CANARY = "HOSTED_CANARY_7b2a";
const fixture = readFileSync(
  fileURLToPath(new URL("../tests/fixtures/engine/simple-serverless-web-application.dgm", import.meta.url)),
  "utf8",
);
const SOURCE = fixture
  .replaceAll("simple-serverless-web-application", "hosted_canary")
  .replaceAll("Simple serverless web application", CANARY);

async function dismissWelcome(page: Page, persist = false) {
  const welcome = page.getByRole("dialog", { name: "Studio runs locally" });
  await expect(welcome).toBeVisible();
  if (persist) await welcome.getByLabel("Don’t show this welcome again").check();
  await welcome.getByRole("button", { name: "Continue to Studio" }).click();
  await expect(welcome).toHaveCount(0);
}

async function importCanary(page: Page) {
  await page.locator('input[type="file"]').setInputFiles({
    name: `${CANARY}.dgm`,
    mimeType: "text/plain",
    buffer: Buffer.from(SOURCE),
  });
  await expect(page.locator(".app")).toHaveAttribute("aria-busy", "false");
  await expect(page.locator(".workspace-loading")).toHaveCount(0);
  await expect(page.getByRole("textbox", { name: "Diagram name" })).toHaveValue(CANARY);
}

test("shows the hosted privacy welcome and keeps its preferences local", async ({ page }) => {
  await page.goto("/");
  const welcome = page.getByRole("dialog", { name: "Studio runs locally" });
  await expect(welcome).toBeVisible();
  await expect(welcome).toContainText("never upload, collect, store, or process");
  await welcome.getByLabel("Don’t show this welcome again").check();
  await welcome.getByRole("button", { name: "Continue to Studio" }).click();
  await expect(welcome).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("dialog", { name: "Studio runs locally" })).toHaveCount(0);

  await page.getByRole("button", { name: "Local-only" }).click();
  await expect(page.getByRole("dialog", { name: "Local-only Studio" })).toBeVisible();
});

test("keeps hosted settings available from Help", async ({ page }) => {
  await page.goto("/");
  await dismissWelcome(page, true);
  await page.getByRole("button", { name: "Help" }).click();
  await page.getByRole("menuitem", { name: "Settings" }).click();
  const settings = page.getByRole("dialog", { name: "Hosted Studio settings" });
  await expect(settings).toBeVisible();
  await expect(settings).toContainText("preferences are stored only in this browser");
});

test("imports, edits, recovers, and exports a canary diagram without sending its contents", async ({ page }) => {
  const requests: string[] = [];
  page.on("request", (request) => {
    const body = request.postData() ?? "";
    requests.push(`${request.url()} ${body}`);
  });
  const response = await page.goto("/");
  expect(response?.headers()["content-security-policy"]).toContain("connect-src http://127.0.0.1:");
  expect(response?.headers()["content-security-policy"]).toContain("/catalog-icons/");
  await dismissWelcome(page, true);
  await importCanary(page);

  const title = page.getByRole("textbox", { name: "Diagram name" });
  await title.fill(`${CANARY}_edited`);
  await title.press("Enter");
  await expect(title).toHaveValue(`${CANARY}_edited`);
  await page.reload();
  await expect(page.getByRole("textbox", { name: "Diagram name" })).toHaveValue(`${CANARY}_edited`);

  const downloads: string[] = [];
  for (const format of ["SVG", "PNG"]) {
    await page.getByRole("button", { name: "More export formats" }).click();
    await page.getByRole("menu", { name: "Export as" }).locator(".export-format-option").filter({ hasText: format }).click();
    const dialog = page.getByRole("dialog", { name: `Export ${format}` });
    const download = page.waitForEvent("download");
    await dialog.getByRole("button", { name: `Export ${format}`, exact: true }).click();
    downloads.push((await download).suggestedFilename());
  }
  expect(downloads[0]).toMatch(/\.svg$/i);
  expect(downloads[1]).toMatch(/\.png$/i);
  expect(requests.join("\n")).not.toContain(CANARY);
});

test("supports tour keyboard controls without URL diagram sharing", async ({ page }) => {
  const response = await page.goto("/");
  expect(response?.headers()["content-security-policy"]).toContain("frame-ancestors 'none'");
  await dismissWelcome(page);

  await page.getByRole("button", { name: "Help" }).click();
  await page.getByRole("menuitem", { name: "Settings" }).click();
  const settings = page.getByRole("dialog", { name: "Hosted Studio settings" });
  await settings.getByRole("button", { name: "Start quick tour" }).click();
  const tour = page.getByRole("dialog", { name: /Quick tour step 1 of 5/ });
  await expect(tour).toBeVisible();
  // Inspect the first animation frame after Next, rather than waiting for
  // eventual positioning: new copy must never paint at the previous anchor.
  const frame = await page.evaluate(async () => {
    const next = [...document.querySelectorAll<HTMLButtonElement>(".hosted-tour-tooltip button")]
      .find((button) => button.textContent === "Next")!;
    next.click();
    return new Promise<{ title: string | null; left: number; anchorLeft: number }>((resolve) => {
      requestAnimationFrame(() => {
        resolve({
          title: document.querySelector(".hosted-tour-tooltip h2")!.textContent,
          left: document.querySelector(".hosted-tour-spotlight")!.getBoundingClientRect().left,
          anchorLeft: document.querySelector(".studio-tabbar-actions .top-menu-trigger")!.getBoundingClientRect().left,
        });
      });
    });
  });
  expect(frame.title).toBe("Find examples");
  expect(frame.left).toBeCloseTo(frame.anchorLeft - 6, 0);
  await page.getByRole("dialog", { name: /Quick tour step 2 of 5/ }).getByRole("button", { name: "Skip" }).focus();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: /Quick tour step/ })).toHaveCount(0);
});
