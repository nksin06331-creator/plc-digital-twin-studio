import { test, expect } from "@playwright/test";
test("sample inputs, scan, continuous run, stop, reset and export", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  const x0 = page
    .locator(".device")
    .filter({ has: page.getByText("X0", { exact: true }) });
  const x1 = page
    .locator(".device")
    .filter({ has: page.getByText("X1", { exact: true }) });
  const y0 = page
    .locator(".device")
    .filter({ has: page.getByText("Y0", { exact: true }) });
  await x0.getByRole("button").click();
  await x1.getByRole("button").click();
  await page.getByRole("button", { name: "▶ 1スキャン", exact: true }).click();
  await expect(y0.getByRole("button")).toHaveText("● ON");
  await page.getByRole("button", { name: "▷ 連続実行", exact: true }).click();
  await expect(page.locator(".status")).toContainText("RUNNING");
  await expect(page.locator(".logs")).toContainText("スキャン 2");
  await page.getByRole("button", { name: "■ 停止", exact: true }).click();
  await expect(page.locator(".status")).toContainText("STOPPED");
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "CSV出力 ↓" }).click();
  expect((await download).suggestedFilename()).toBe("devices.csv");
  await page.getByRole("button", { name: "↺ 全メモリ初期化" }).click();
  await expect(y0.getByRole("button")).toHaveText("○ OFF");
  await expect(x0.getByRole("button")).toHaveText("○ OFF");
  expect(errors).toEqual([]);
});
test("unknown CSV preview blocks simulation and renders text safely", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .locator("input[type=file]")
    .setInputFiles({
      name: "unknown.csv",
      mimeType: "text/csv",
      buffer: Buffer.from("unknown,columns\n<img src=x onerror=alert(1)>,END"),
    });
  await expect(page.locator(".preview")).toContainText(
    "<img src=x onerror=alert(1)>",
  );
  await expect(page.locator(".preview img")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "▶ 1スキャン", exact: true }),
  ).toBeDisabled();
});
test("MOV sample sets D values and mobile layout stays within viewport", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: "mov_example", exact: true }).click();
  await page
    .locator(".device")
    .filter({ has: page.getByText("X0", { exact: true }) })
    .getByRole("button")
    .click();
  await page.getByRole("button", { name: "▶ 1スキャン", exact: true }).click();
  await expect(page.getByRole("spinbutton", { name: "D0 初期値" })).toHaveValue(
    "65535",
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
