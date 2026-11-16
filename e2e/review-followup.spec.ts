import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import { closeMenu, selectBoard } from "./helpers";
type DeferredReads = Window & { reviewReads: Array<() => Promise<void>> };
async function deferRead(page: Page) {
  await page.evaluate(() => {
    const original = File.prototype.arrayBuffer;
    const reads: Array<() => Promise<void>> = [];
    Object.assign(window, { reviewReads: reads });
    File.prototype.arrayBuffer = function () {
      return new Promise<ArrayBuffer>((resolve) => {
        reads.push(async () => resolve(await original.call(this)));
      });
    };
  });
}
async function upload(page: Page, name: string, input = "X10") {
  await page
    .getByLabel("CSV・リストファイルを選択", { exact: true })
    .setInputFiles({
      name,
      mimeType: "text/csv",
      buffer: Buffer.from(
        `step,instruction,operand,comment\n0,LD,${input},\n1,OUT,Y0,\n2,END,,`,
      ),
    });
}
async function finishRead(page: Page) {
  await page.waitForFunction(
    () => (window as DeferredReads).reviewReads.length === 1,
  );
  await page.evaluate(() => (window as DeferredReads).reviewReads.shift()!());
  await expect(
    page.getByRole("region", { name: "現在のプログラム", exact: true }),
  ).toContainText("delayed.csv");
}
function monitor(page: Page, name: string) {
  return page
    .locator(".device")
    .filter({ has: page.getByText(name, { exact: true }) });
}
for (const mode of ["generic", "exam"] as const) {
  test(`a pending CSV initializes with the latest ${mode} panel rather than the previous mode`, async ({
    page,
  }) => {
    await page.goto("/");
    await closeMenu(page);
    if (mode === "exam") await selectBoard(page, "generic");
    await deferRead(page);
    await upload(page, "delayed.csv");
    await selectBoard(page, mode);
    await finishRead(page);
    await page.locator(".analysis-tools summary").click();
    await expect(monitor(page, "X10").getByRole("button")).toHaveText(
      mode === "exam" ? "● ON" : "○ OFF",
    );
    await page
      .getByRole("button", { name: "▶ 1スキャン", exact: true })
      .click();
    await expect(monitor(page, "Y0").getByRole("button")).toHaveText(
      mode === "exam" ? "● ON" : "○ OFF",
    );
  });
}
test("a pending CSV uses the latest applied wiring on completion", async ({
  page,
}) => {
  await page.goto("/");
  await closeMenu(page);
  await deferRead(page);
  await upload(page, "delayed.csv", "X20");
  await page.locator(".exam-wiring summary").click();
  await page
    .getByRole("textbox", { name: "LS1 PLC割付", exact: true })
    .fill("X20");
  await page
    .getByRole("button", { name: "割付を適用・初期化", exact: true })
    .click();
  await finishRead(page);
  await page.locator(".analysis-tools summary").click();
  await expect(monitor(page, "X20").getByRole("button")).toHaveText("● ON");
  await expect(page.locator('.terminal-cell b[title="LS1 → X20"]')).toHaveClass(
    /terminal-active/,
  );
});
test("dragging a file to the collapsed rail opens the menu and a rail drop reads it exactly once", async ({
  page,
}) => {
  await page.goto("/");
  await closeMenu(page);
  await page.evaluate(() => {
    const original = File.prototype.arrayBuffer;
    Object.assign(window, { reviewReadCount: 0 });
    File.prototype.arrayBuffer = function () {
      (window as Window & { reviewReadCount: number }).reviewReadCount++;
      return original.call(this);
    };
  });
  const transfer = await page.evaluateHandle(() => {
    const data = new DataTransfer();
    data.items.add(
      new File(
        ["step,instruction,operand,comment\n0,LD,SM400,\n1,OUT,Y32,\n2,END,,"],
        "rail-drop.csv",
        { type: "text/csv" },
      ),
    );
    return data;
  });
  const rail = page.locator(".sidebar-trigger");
  await rail.dispatchEvent("dragenter", { dataTransfer: transfer });
  await rail.dispatchEvent("dragover", { dataTransfer: transfer });
  await expect(page.locator("#studio-menu")).toBeVisible();
  await rail.dispatchEvent("drop", { dataTransfer: transfer });
  await expect(
    page.getByRole("region", { name: "現在のプログラム", exact: true }),
  ).toContainText("rail-drop.csv");
  expect(
    await page.evaluate(
      () => (window as Window & { reviewReadCount: number }).reviewReadCount,
    ),
  ).toBe(1);
  await expect(page.locator("#studio-menu")).not.toBeVisible();
  await page.getByRole("button", { name: "▶ 1スキャン", exact: true }).click();
  await expect(
    page.getByRole("status", { name: "PL1 表示灯", exact: true }),
  ).toHaveClass(/illuminated/);
});
for (const width of [1024, 390]) {
  test(`both panels stay inside the viewport after a long filename and height resize at width ${width}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/");
    await closeMenu(page);
    const name = "review_program_".repeat(15) + ".csv";
    await upload(page, name);
    await expect(
      page.getByRole("region", { name: "現在のプログラム", exact: true }),
    ).toContainText(name);
    const check = async (height: number) => {
      for (const id of ["#board", "#ladder"]) {
        await expect
          .poll(async () => {
            const box = (await page.locator(id).boundingBox())!;
            return box.y + box.height;
          })
          .toBeLessThanOrEqual(height);
      }
      expect(await page.evaluate(() => scrollY)).toBe(0);
    };
    await check(844);
    await page.setViewportSize({ width, height: 640 });
    await check(640);
  });
}
