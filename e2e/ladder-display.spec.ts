import { selectBoard, selectDemo } from "./helpers";
import { test, expect } from "@playwright/test";
test("ladder zoom, wide mode and contact selection preserve the running circuit state", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.clock.install({ time: new Date("2026-11-16T00:00:00Z") });
  await page.goto("/");
  await page.clock.pauseAt(new Date("2026-11-16T00:01:00Z"));
  await selectBoard(page, "generic");
  await selectDemo(page, "training_demo");
  await page
    .getByRole("button", { name: "▶ 試験運転開始", exact: true })
    .click();
  await page
    .getByRole("button", { name: "X0 押しボタン", exact: true })
    .click();
  const lamp = page.getByRole("status", { name: "Y0 出力", exact: true });
  await expect(lamp).toHaveClass(/illuminated/);
  const scans = await page
    .locator(".metrics > div")
    .nth(2)
    .locator("b")
    .textContent();
  await expect(
    page.getByRole("combobox", { name: "ラダー表示倍率", exact: true }),
  ).toHaveValue("50");
  const contact = page.locator("#ladder .ladder-contact").first();
  const beforeWidth = (await page.locator("#ladder").boundingBox())!.width;
  const symbolWidth = (await contact.locator("svg").boundingBox())!.width;
  await page.getByRole("button", { name: "ラダーを拡大", exact: true }).click();
  expect((await contact.locator("svg").boundingBox())!.width).toBeGreaterThan(
    symbolWidth,
  );
  await page
    .getByRole("button", { name: "回路の幅を広げる", exact: true })
    .click();
  expect((await page.locator("#ladder").boundingBox())!.width).toBeGreaterThan(
    beforeWidth + 100,
  );
  await contact.click();
  await expect(contact).toHaveAttribute("aria-pressed", "true");
  await page
    .getByRole("combobox", { name: "ラダー表示倍率", exact: true })
    .selectOption("200");
  await expect(contact).toHaveAttribute("aria-pressed", "true");
  await page
    .getByRole("button", { name: "ラダーの倍率を100%に戻す", exact: true })
    .click();
  await expect(
    page.getByRole("combobox", { name: "ラダー表示倍率", exact: true }),
  ).toHaveValue("100");
  await page
    .getByRole("button", { name: "幅を均等に戻す", exact: true })
    .click();
  expect((await page.locator("#ladder").boundingBox())!.width).toBeCloseTo(
    beforeWidth,
    0,
  );
  await page
    .getByRole("button", { name: "全体表示（50%）", exact: true })
    .click();
  await expect(
    page.getByRole("combobox", { name: "ラダー表示倍率", exact: true }),
  ).toHaveValue("50");
  await expect(page.locator(".metrics > div").nth(2).locator("b")).toHaveText(
    scans!,
  );
  await expect(lamp).toHaveClass(/illuminated/);
  await page.locator(".analysis-tools summary").click();
  await expect(page.locator("#program tbody tr.selected")).toContainText("X0");
});
test("long branched ladders zoom and scroll inside the canvas on mobile", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto("/");
  await page
    .getByLabel("CSV・リストファイルを選択", { exact: true })
    .setInputFiles({
      name: "branches.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(
        "step,instruction,operand,comment\n0,LD,X0,分岐の表示確認\n1,AND,X1,\n2,LD,X2,\n3,OR,X3,\n4,ORB,,\n5,OUT,Y32,表示灯\n6,END,,",
      ),
    });
  await expect(page.locator("#ladder .ladder-parallel")).not.toHaveCount(0);
  await expect(page.locator("#ladder")).toContainText("表示灯");
  await page
    .getByRole("combobox", { name: "ラダー表示倍率", exact: true })
    .selectOption("200");
  const canvas = page.getByRole("region", {
    name: "ラダー回路（縦横スクロール）",
    exact: true,
  });
  expect(await canvas.evaluate((e) => e.scrollWidth > e.clientWidth)).toBe(
    true,
  );
  await canvas.focus();
  await page.keyboard.press("ArrowRight");
  await expect
    .poll(() => canvas.evaluate((e) => e.scrollLeft))
    .toBeGreaterThan(0);
  const output = page.locator("#ladder .ladder-output");
  await output.click();
  await expect(output).toHaveAttribute("aria-pressed", "true");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page
    .getByRole("combobox", { name: "ラダー表示倍率", exact: true })
    .selectOption("80");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
