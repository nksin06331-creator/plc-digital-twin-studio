import { test, expect } from "@playwright/test";
test("comprehensive demo shows captured pallet number, computed product and completed count", async ({
  page,
}) => {
  await page.clock.install({ time: new Date("2026-11-14T00:00:00Z") });
  await page.goto("/");
  await page.clock.pauseAt(new Date("2026-11-14T00:01:00Z"));
  await page
    .getByRole("button", { name: "2級対策・総合演習", exact: true })
    .click();
  await expect(page.locator(".grade2-guide")).toBeVisible();
  await expect(
    page.getByRole("combobox", { name: "DSW デジタルスイッチ", exact: true }),
  ).toHaveValue("2");
  await page
    .getByRole("combobox", { name: "搬送片道時間", exact: true })
    .selectOption("1000");
  await page
    .getByRole("button", { name: "▶ 試験運転開始", exact: true })
    .click();
  await page
    .getByRole("button", { name: "SS0 切替スイッチ", exact: true })
    .click();
  await page.keyboard.down("KeyZ");
  await page.clock.runFor(100);
  await page.keyboard.up("KeyZ");
  await page.clock.runFor(1000);
  await expect(page.getByLabel("DPL 数値表示", { exact: true })).toHaveText(
    "07",
  );
  await expect(page.locator(".grade2-guide .panel-title")).toContainText(
    "左端待機",
  );
  await page.clock.runFor(1900);
  await expect(page.getByLabel("DPL 数値表示", { exact: true })).toHaveText(
    "14",
  );
  await page.clock.runFor(1000);
  await expect(page.getByLabel("DPL 数値表示", { exact: true })).toHaveText(
    "01",
  );
  await page.keyboard.down("KeyB");
  await page.clock.runFor(100);
  await page.keyboard.up("KeyB");
  await page.clock.runFor(100);
  await expect(page.getByLabel("DPL 数値表示", { exact: true })).toHaveText(
    "99",
  );
  await expect(page.locator(".grade2-guide .panel-title")).toContainText(
    "異常保持",
  );
  await page
    .getByRole("button", { name: "SS0 切替スイッチ", exact: true })
    .click();
  await page.keyboard.down("KeyV");
  await page.clock.runFor(100);
  await page.keyboard.up("KeyV");
  await expect(page.getByLabel("DPL 数値表示", { exact: true })).toHaveText(
    "02",
  );
  await expect(page.locator(".grade2-guide .panel-title")).not.toContainText(
    "異常保持",
  );
});
test("comprehensive demo sets its matching panel and wiring and fits mobile width", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page
    .getByRole("combobox", { name: "盤モデル", exact: true })
    .selectOption("generic");
  await page
    .getByRole("button", { name: "2級対策・総合演習", exact: true })
    .click();
  await expect(
    page.getByRole("combobox", { name: "盤モデル", exact: true }),
  ).toHaveValue("exam");
  await expect(
    page.getByRole("button", { name: "▶ 試験運転開始", exact: true }),
  ).toBeEnabled();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
