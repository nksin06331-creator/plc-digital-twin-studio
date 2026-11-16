import { closeMenu, openMenu, selectBoard, selectDemo } from "./helpers";
import { test, expect } from "@playwright/test";
test("comprehensive demo shows captured pallet number, computed product and completed count", async ({
  page,
}) => {
  await page.clock.install({ time: new Date("2026-11-14T00:00:00Z") });
  await page.goto("/");
  await closeMenu(page);
  await page.clock.pauseAt(new Date("2026-11-14T00:01:00Z"));
  await selectDemo(page, "2級対策・総合演習");
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
  await closeMenu(page);
  await selectBoard(page, "generic");
  await selectDemo(page, "2級対策・総合演習");
  await openMenu(page);
  await expect(
    page.getByRole("combobox", { name: "盤モデル", exact: true }),
  ).toHaveValue("exam");
  await closeMenu(page);
  await expect(
    page.getByRole("button", { name: "▶ 試験運転開始", exact: true }),
  ).toBeEnabled();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("quick pointer clicks start auto and capture emergency/reset without a timer tick", async ({
  page,
}) => {
  await page.clock.install({ time: new Date("2026-11-14T00:00:00Z") });
  await page.goto("/");
  await closeMenu(page);
  await page.clock.pauseAt(new Date("2026-11-14T00:01:00Z"));
  await selectDemo(page, "2級対策・総合演習");
  const status = page.getByRole("status", {
    name: "自動運転の状態",
    exact: true,
  });
  await expect(status).toContainText("スキャン停止中");
  await page
    .getByRole("button", { name: "▶ 試験運転開始", exact: true })
    .click();
  await expect(status).toContainText("SS0が手動");
  await page.keyboard.down("KeyZ");
  await page
    .getByRole("button", { name: "SS0 切替スイッチ", exact: true })
    .click();
  await expect(status).toContainText("押し直してください");
  await page.keyboard.up("KeyZ");
  await expect(status).toContainText("準備OK");
  await page
    .getByRole("combobox", { name: "DSW デジタルスイッチ", exact: true })
    .selectOption("0");
  await expect(status).toContainText("DSWが0");
  await page
    .getByRole("combobox", { name: "DSW デジタルスイッチ", exact: true })
    .selectOption("2");
  await page.getByRole("button", { name: "中央", exact: true }).click();
  await expect(status).toContainText("右端LS1がOFF");
  await page.getByRole("button", { name: "右端", exact: true }).click();
  await expect(status).toContainText("準備OK");
  await page
    .getByRole("button", { name: "PB1 押しボタン", exact: true })
    .click();
  await expect(
    page.getByRole("status", { name: "RY1 リレー", exact: true }),
  ).toContainText("ON");
  await expect(status).toContainText("自動運転中");
  await expect(page.locator(".work-pallet")).toHaveAttribute(
    "data-position",
    "1.0000",
  );
  await page.clock.runFor(100);
  expect(
    Number(await page.locator(".work-pallet").getAttribute("data-position")),
  ).toBeLessThan(1);
  await page
    .getByRole("button", { name: "PB5 押しボタン", exact: true })
    .click();
  await expect(page.getByLabel("DPL 数値表示", { exact: true })).toHaveText(
    "99",
  );
  await expect(
    page.getByRole("status", { name: "RY1 リレー", exact: true }),
  ).toContainText("OFF");
  await expect(status).toContainText("異常保持");
  await page
    .getByRole("button", { name: "SS0 切替スイッチ", exact: true })
    .click();
  await page
    .getByRole("button", { name: "PB4 押しボタン", exact: true })
    .click();
  await expect(status).toContainText("SS0が手動");
  await expect(page.getByLabel("DPL 数値表示", { exact: true })).toHaveText(
    "02",
  );
});
