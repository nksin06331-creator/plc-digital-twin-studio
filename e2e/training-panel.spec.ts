import { test, expect } from "@playwright/test";
test("push buttons drive holding circuit, lamps, motor and ladder", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator("#ladder .ladder-rung")).toHaveCount(6);
  await page
    .getByRole("button", { name: "▶ 試験運転開始", exact: true })
    .click();
  const start = page.getByRole("button", {
    name: "X0 押しボタン",
    exact: true,
  });
  await start.focus();
  await page.keyboard.down("Space");
  await expect(
    page.getByRole("status", { name: "Y0 出力", exact: true }),
  ).toHaveClass(/illuminated/);
  await page.keyboard.up("Space");
  await expect(
    page.getByRole("status", { name: "モーター状態", exact: true }),
  ).toHaveText("逆転");
  await expect(
    page.locator("#ladder .ladder-output.conducting"),
  ).not.toHaveCount(0);
  await page
    .getByRole("button", { name: "X2 切替スイッチ", exact: true })
    .click();
  await expect(
    page.getByRole("status", { name: "モーター状態", exact: true }),
  ).toHaveText("正転");
  const stop = page.getByRole("button", { name: "X1 押しボタン", exact: true });
  await stop.focus();
  await page.keyboard.down("Space");
  await expect(
    page.getByRole("status", { name: "Y0 出力", exact: true }),
  ).not.toHaveClass(/illuminated/);
  await page.keyboard.up("Space");
  await expect(
    page.getByRole("status", { name: "モーター状態", exact: true }),
  ).toHaveText("停止");
  await page
    .getByRole("button", { name: "■ 試験運転停止", exact: true })
    .click();
});
test("BCD dial controls numeric output and motor conflict is visible", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "▶ 試験運転開始", exact: true })
    .click();
  await page
    .getByRole("combobox", { name: "BCD設定値", exact: true })
    .selectOption("7");
  await expect(page.getByLabel("BCD数値表示", { exact: true })).toHaveText(
    "07",
  );
  await page
    .getByRole("button", { name: "割付設定を表示", exact: true })
    .click();
  await page
    .getByRole("combobox", { name: "モーター逆転出力", exact: true })
    .selectOption("Y1");
  await page
    .getByRole("button", { name: "X2 切替スイッチ", exact: true })
    .click();
  const start = page.getByRole("button", {
    name: "X0 押しボタン",
    exact: true,
  });
  await start.focus();
  await page.keyboard.down("Space");
  await expect(
    page.getByRole("status", { name: "モーター状態", exact: true }),
  ).toHaveText("同時ON異常");
  await page.keyboard.up("Space");
});
test("NC momentary contacts return ON after key release", async ({ page }) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "割付設定を表示", exact: true })
    .click();
  await page
    .getByRole("combobox", { name: "X1 接点種別", exact: true })
    .selectOption("nc");
  const button = page.getByRole("button", {
    name: "X1 押しボタン",
    exact: true,
  });
  const card = button.locator("..");
  await expect(card).toContainText("入力接点 ON");
  await button.focus();
  await page.keyboard.down("Space");
  await expect(card).toContainText("入力接点 OFF");
  await page.keyboard.up("Space");
  await expect(card).toContainText("入力接点 ON");
});
test("training panel fits narrow viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("window blur releases a held input and invalid BCD address does not crash", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  const start = page.getByRole("button", {
    name: "X0 押しボタン",
    exact: true,
  });
  await start.focus();
  await page.keyboard.down("Space");
  await expect(start.locator("..")).toContainText("入力接点 ON");
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  await expect(start.locator("..")).toContainText("入力接点 OFF");
  await page.keyboard.up("Space");
  await page
    .getByRole("button", { name: "割付設定を表示", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "BCD入力先頭", exact: true })
    .fill("XFFFFFFFFFFFFFFFFFFFFFFFFFFFF");
  await expect(
    page.getByRole("combobox", { name: "BCD設定値", exact: true }),
  ).toBeDisabled();
  expect(errors).toEqual([]);
});
