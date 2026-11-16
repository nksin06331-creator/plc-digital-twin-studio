import { closeMenu, selectDemo } from "./helpers";
import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
async function frozen(page: import("@playwright/test").Page) {
  await page.clock.install({ time: new Date("2026-11-16T00:00:00Z") });
  await page.goto("/");
  await closeMenu(page);
  await page.clock.pauseAt(new Date("2026-11-16T00:01:00Z"));
}
for (const width of [1366, 390]) {
  test(`counter demo counts short clicks, holds, resets and shows value/contact at width ${width}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await frozen(page);
    await selectDemo(page, "カウンター演習");
    await page
      .getByRole("button", { name: "▶ 試験運転開始", exact: true })
      .click();
    const display = page.getByLabel("DPL 数値表示", { exact: true });
    const lamp = page.getByRole("status", { name: "PL1 表示灯", exact: true });
    await page
      .getByRole("button", { name: "PB1 押しボタン", exact: true })
      .click();
    await expect(display).toHaveText("01");
    await expect(lamp).not.toHaveClass(/illuminated/);
    await page.keyboard.down("KeyZ");
    await page.clock.runFor(500);
    await page.keyboard.up("KeyZ");
    await expect(display).toHaveText("02");
    await expect(lamp).toHaveClass(/illuminated/);
    await page
      .getByRole("button", { name: "PB1 押しボタン", exact: true })
      .click();
    await expect(display).toHaveText("02");
    await page.locator(".analysis-tools summary").click();
    await expect(page.getByLabel("C0 現在値", { exact: true })).toHaveText("2");
    await expect(
      page.getByLabel("C0 カウンター", { exact: true }),
    ).toContainText("接点 ON");
    await page
      .getByRole("button", { name: "PB4 押しボタン", exact: true })
      .click();
    await expect(display).toHaveText("00");
    await expect(lamp).not.toHaveClass(/illuminated/);
    await expect(page.getByLabel("C0 現在値", { exact: true })).toHaveText("0");
    await expect(
      page.getByLabel("C0 カウンター", { exact: true }),
    ).toContainText("接点 OFF");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  });
}
test("draft wiring is labeled separately from applied signals and export; discard preserves operation", async ({
  page,
}) => {
  await frozen(page);
  await selectDemo(page, "カウンター演習");
  await page
    .getByRole("button", { name: "▶ 試験運転開始", exact: true })
    .click();
  await page
    .getByRole("button", { name: "PB1 押しボタン", exact: true })
    .click();
  await page.locator(".exam-wiring summary").click();
  await page
    .getByRole("textbox", { name: "LS1 PLC割付", exact: true })
    .fill("X20");
  await page
    .getByRole("textbox", { name: "PL1 PLC割付", exact: true })
    .fill("Y50");
  await expect(
    page.getByLabel("割付の適用状態", { exact: true }),
  ).toContainText("未適用の変更が2件");
  await expect(page.getByLabel("LS1 適用中の番地", { exact: true })).toHaveText(
    "X10",
  );
  await expect(page.getByLabel("LS1 適用中の状態", { exact: true })).toHaveText(
    "ON",
  );
  await expect(page.getByLabel("PL1 適用中の番地", { exact: true })).toHaveText(
    "Y32",
  );
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "割付JSON出力", exact: true }).click();
  const downloaded = await pending;
  const exported = JSON.parse(
    await readFile((await downloaded.path())!, "utf8"),
  );
  expect(exported.inputs.LS1).toBe("X10");
  expect(exported.outputs.PL1).toBe("Y32");
  await page.getByRole("button", { name: "編集を破棄", exact: true }).click();
  await expect(
    page.getByLabel("割付の適用状態", { exact: true }),
  ).toContainText("すべて適用済み");
  await expect(
    page.getByRole("textbox", { name: "LS1 PLC割付", exact: true }),
  ).toHaveValue("X10");
  await expect(page.getByLabel("DPL 数値表示", { exact: true })).toHaveText(
    "01",
  );
  await expect(page.locator("header .status")).toContainText("RUNNING");
  await page
    .getByRole("button", { name: "PB1 押しボタン", exact: true })
    .click();
  await expect(page.getByLabel("DPL 数値表示", { exact: true })).toHaveText(
    "02",
  );
});
test("invalid drafts stay pending; imported assignments apply atomically and clear pending markers on mobile", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto("/");
  await closeMenu(page);
  await page.locator(".exam-wiring summary").click();
  await page
    .getByRole("textbox", { name: "LS1 PLC割付", exact: true })
    .fill("X11");
  await page
    .getByRole("button", { name: "割付を適用・初期化", exact: true })
    .click();
  await expect(page.locator(".wiring-message")).toContainText("重複");
  await expect(
    page.getByLabel("割付の適用状態", { exact: true }),
  ).toContainText("未適用");
  await expect(page.getByLabel("LS1 適用中の番地", { exact: true })).toHaveText(
    "X10",
  );
  await page.getByRole("button", { name: "編集を破棄", exact: true }).click();
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "割付JSON出力", exact: true }).click();
  const downloaded = await pending;
  const wiring = JSON.parse(await readFile((await downloaded.path())!, "utf8"));
  wiring.inputs.LS1 = "X20";
  await page.locator(".exam-wiring input[type=file]").setInputFiles({
    name: "wiring.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(wiring)),
  });
  await expect(
    page.getByLabel("割付の適用状態", { exact: true }),
  ).toContainText("未適用の変更が1件");
  await expect(page.getByLabel("LS1 適用中の番地", { exact: true })).toHaveText(
    "X10",
  );
  await page
    .getByRole("button", { name: "割付を適用・初期化", exact: true })
    .click();
  await expect(
    page.getByLabel("割付の適用状態", { exact: true }),
  ).toContainText("すべて適用済み");
  await expect(page.getByLabel("LS1 適用中の番地", { exact: true })).toHaveText(
    "X20",
  );
  await expect(page.getByLabel("LS1 適用中の状態", { exact: true })).toHaveText(
    "ON",
  );
  await expect(page.locator(".wiring-row-pending")).toHaveCount(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
