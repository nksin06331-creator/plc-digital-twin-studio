import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import { closeMenu, selectBoard } from "./helpers";
async function upload(page: Page, lines: string[], update: number) {
  await page
    .getByLabel("CSV・リストファイルを選択", { exact: true })
    .setInputFiles({
      name: "reload.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(
        "step,instruction,operand,comment\n" +
          lines.map((s, n) => `${n},${s},`).join("\n"),
      ),
    });
  await expect(
    page.getByLabel("ラダー表示中のプログラム", { exact: true }),
  ).toContainText(`更新 #${update}`);
}
test("same-name CSV replacement resets BCD wiring and operates the new input and output", async ({
  page,
}) => {
  await page.goto("/");
  await closeMenu(page);
  await selectBoard(page, "generic");
  await upload(page, ["LD,SM400", "MOV,K1X0 D0", "BCD,D0 K2Y0", "END,"], 1);
  await page
    .getByRole("combobox", { name: "BCD設定値", exact: true })
    .selectOption("7");
  await page
    .getByRole("button", { name: "▶ 試験運転開始", exact: true })
    .click();
  await expect(page.getByLabel("BCD数値表示", { exact: true })).toHaveText(
    "07",
  );
  await page
    .getByRole("button", { name: "■ 試験運転停止", exact: true })
    .click();
  await upload(page, ["LD,SM400", "MOV,K1X20 D0", "BCD,D0 K2Y40", "END,"], 2);
  await page
    .getByRole("button", { name: "割付設定を表示", exact: true })
    .click();
  await expect(
    page.getByRole("textbox", { name: "BCD入力先頭", exact: true }),
  ).toHaveValue("X20");
  await expect(
    page.getByRole("textbox", { name: "BCD出力先頭", exact: true }),
  ).toHaveValue("Y40");
  await page
    .getByRole("combobox", { name: "BCD設定値", exact: true })
    .selectOption("7");
  await page
    .getByRole("button", { name: "▶ 試験運転開始", exact: true })
    .click();
  await expect(page.getByLabel("BCD数値表示", { exact: true })).toHaveText(
    "07",
  );
  await page.locator(".analysis-tools summary").click();
  await expect(
    page.getByRole("spinbutton", { name: "D0 初期値", exact: true }),
  ).toHaveValue("7");
});
test("a thousand-instruction expansion stays responsive and can still scan or load another circuit", async ({
  page,
}) => {
  await page.goto("/");
  await closeMenu(page);
  await upload(
    page,
    [
      "LD,X0",
      ...Array.from({ length: 499 }, () => "AND,X1"),
      ...Array.from({ length: 499 }, (_, n) => `OUT,M${n}`),
      "END,",
    ],
    1,
  );
  await expect(page.locator("#ladder .error")).toContainText("上限");
  await expect(page.locator("#ladder .ladder-contact")).toHaveCount(0);
  await page.getByRole("button", { name: "▶ 1スキャン", exact: true }).click();
  await expect(
    page.locator(".metrics > div").filter({ hasText: "スキャン" }),
  ).toContainText("1");
  await upload(page, ["LD,X10", "OUT,Y32", "END,"], 2);
  await expect(page.locator("#ladder .error")).toHaveCount(0);
  await expect(page.locator("#ladder .ladder-contact")).toHaveCount(1);
});
