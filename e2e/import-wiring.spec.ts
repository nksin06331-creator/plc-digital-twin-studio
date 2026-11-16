import { test, expect } from "@playwright/test";
import { closeMenu } from "./helpers";
test("imported I/O mismatch is visible and an explicit preset connects the physical panel", async ({
  page,
}) => {
  await page.goto("/");
  await closeMenu(page);
  await page
    .getByLabel("CSV・リストファイルを選択", { exact: true })
    .setInputFiles({
      name: "synthetic-wiring.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(
        "step,instruction,operand,comment\n0,LD,X5,\n1,ANI,X1,\n2,OUT,Y20,\n3,LD,XC,\n4,OUT,Y22,\n5,END,,",
      ),
    });
  await expect(
    page.getByRole("region", { name: "現在のプログラム", exact: true }),
  ).toContainText("synthetic-wiring.csv");
  const warning = page.getByRole("status", {
    name: "盤の未接続番地",
    exact: true,
  });
  await expect(warning).toContainText("X5");
  await expect(page.locator('.terminal-cell b[title="LS1 → X10"]')).toHaveClass(
    /terminal-active/,
  );
  await page
    .getByRole("button", { name: "X0/Y20割付を適用・初期化", exact: true })
    .click();
  await expect(warning).toHaveCount(0);
  await expect(page.locator('.terminal-cell b[title="LS1 → X0"]')).toHaveClass(
    /terminal-active/,
  );
  await page
    .getByLabel("DSW デジタルスイッチ", { exact: true })
    .selectOption("1");
  await page
    .getByRole("button", { name: "▶ 試験運転開始", exact: true })
    .click();
  await expect(
    page.getByRole("status", { name: "PL1 表示灯", exact: true }),
  ).toHaveClass(/illuminated/);
  const pallet = page.locator(".work-pallet");
  const before = await pallet.boundingBox();
  const pb = page.getByRole("button", { name: "PB1 押しボタン", exact: true });
  await pb.dispatchEvent("keydown", { key: "Enter" });
  await expect
    .poll(async () => (await pallet.boundingBox())!.x)
    .toBeLessThan(before!.x - 5);
  await pb.dispatchEvent("keyup", { key: "Enter" });
});
