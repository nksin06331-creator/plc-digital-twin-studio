import { test, expect } from "@playwright/test";
import { closeMenu, selectDemo, selectBoard } from "./helpers";
test("special instruction demo renders its blocks and calculates from a physical button", async ({
  page,
}) => {
  await page.goto("/");
  await closeMenu(page);
  await page
    .getByLabel("CSV・リストファイルを選択", { exact: true })
    .setInputFiles({
      name: "synthetic-other-wiring.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(
        "step,instruction,operand,comment\n0,LD,X5,\n1,OUT,Y20,\n2,END,,",
      ),
    });
  await page
    .getByRole("button", { name: "X0/Y20割付を適用・初期化", exact: true })
    .click();
  await selectBoard(page, "generic");
  await selectDemo(page, "特殊命令演習");
  await expect(page.locator('.terminal-cell b[title="LS1 → X10"]')).toHaveClass(
    /terminal-active/,
  );
  await expect(
    page.getByLabel("ラダー表示中のプログラム", { exact: true }),
  ).toContainText("special_instructions.csv");
  await expect(
    page.locator("#ladder .ladder-output").filter({ hasText: "MOVP" }),
  ).toHaveCount(1);
  await expect(
    page.locator("#ladder .ladder-output").filter({ hasText: "CMP" }),
  ).toHaveCount(1);
  await page
    .getByRole("button", { name: "▶ 試験運転開始", exact: true })
    .click();
  await page
    .getByRole("button", { name: "PB1 押しボタン", exact: true })
    .click();
  await page.locator(".analysis-tools summary").click();
  await expect(
    page.getByRole("spinbutton", { name: "D1 初期値", exact: true }),
  ).toHaveValue("1234");
  await expect(
    page.getByRole("spinbutton", { name: "D4 初期値", exact: true }),
  ).toHaveValue("120");
  await expect(
    page.getByRole("spinbutton", { name: "D5 初期値", exact: true }),
  ).toHaveValue("0");
  await expect(
    page
      .locator(".device")
      .filter({ has: page.getByText("M1", { exact: true }) })
      .getByRole("button"),
  ).toHaveText("● ON");
});
