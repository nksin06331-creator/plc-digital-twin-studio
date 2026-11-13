import { test, expect } from "@playwright/test";
test("sample inputs, scan, continuous run, stop, reset and export", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await page.locator(".analysis-tools summary").click();
  await page.getByRole("button", { name: "basic_and", exact: true }).click();
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
  await page.locator(".analysis-tools summary").click();
  await page.getByRole("button", { name: "basic_and", exact: true }).click();
  await page.locator("input[type=file]").setInputFiles({
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
  await page.locator(".analysis-tools summary").click();
  await page.getByRole("button", { name: "basic_and", exact: true }).click();
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

test("D initial value accepts negative typing without changing memory mid-edit", async ({
  page,
}) => {
  await page.goto("/");
  await page.locator(".analysis-tools summary").click();
  await page.getByRole("button", { name: "basic_and", exact: true }).click();
  await page.getByRole("button", { name: "mov_example", exact: true }).click();
  const input = page.getByRole("spinbutton", { name: "D0 初期値" });
  await input.fill("");
  await input.pressSequentially("-123");
  await expect(input).toHaveValue("-123");
  await input.press("Enter");
  await expect(
    page
      .locator(".device")
      .filter({ has: page.getByText("D0", { exact: true }) }),
  ).toContainText("65413 / -123");
});

test("selected step remains selected after scanning", async ({ page }) => {
  await page.goto("/");
  await page.locator(".analysis-tools summary").click();
  await page.getByRole("button", { name: "basic_and", exact: true }).click();
  await page.locator(".step").filter({ hasText: /^1$/ }).click();
  await page.getByRole("button", { name: "▶ 1スキャン", exact: true }).click();
  await expect(page.locator("#program .panel-title")).toContainText(
    "選択 STEP 1",
  );
});

test("invalid or cancelled D edits preserve memory", async ({ page }) => {
  await page.goto("/");
  await page.locator(".analysis-tools summary").click();
  await page.getByRole("button", { name: "basic_and", exact: true }).click();
  await page.getByRole("button", { name: "mov_example", exact: true }).click();
  const input = page.getByRole("spinbutton", { name: "D0 初期値" });
  const row = page
    .locator(".device")
    .filter({ has: page.getByText("D0", { exact: true }) });
  await input.fill("42");
  await input.press("Enter");
  await expect(row).toContainText("42 / 42");
  for (const draft of ["", "65536", "-32769", "1.5"]) {
    await input.fill(draft);
    await input.press("Enter");
    await expect(input).toHaveValue("42");
    await expect(row).toContainText("42 / 42");
  }
  await input.fill("123");
  await input.press("Escape");
  await expect(input).toHaveValue("42");
  await expect(row).toContainText("42 / 42");
});
