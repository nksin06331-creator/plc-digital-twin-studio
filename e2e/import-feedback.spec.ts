import { test, expect } from "@playwright/test";
import { closeMenu } from "./helpers";
test("the ladder names the loaded file and a same-name replacement visibly changes its update and circuits", async ({
  page,
}) => {
  await page.goto("/");
  await closeMenu(page);
  const upload = async (body: string) => {
    const picker = page.waitForEvent("filechooser");
    await page
      .getByRole("button", { name: "CSVを読み込む", exact: true })
      .click();
    await (
      await picker
    ).setFiles({
      name: "same-name.csv",
      mimeType: "text/csv",
      buffer: Buffer.from("step,instruction,operand,comment\n" + body),
    });
  };
  const label = page.getByLabel("ラダー表示中のプログラム", { exact: true });
  await upload("0,LD,X0,\n1,OUT,Y0,\n2,END,,");
  await expect(
    page.getByRole("status", { name: "ファイル読込結果", exact: true }),
  ).toContainText("読込完了・3命令");
  await expect(label).toContainText(
    "same-name.csv · 更新 #1 · 3命令 / 1出力回路",
  );
  await expect(page.locator("#ladder .ladder-output")).toHaveCount(1);
  await upload("0,LD,X1,\n1,OUT,Y1,\n2,OUT,Y2,\n3,END,,");
  await expect(label).toContainText(
    "same-name.csv · 更新 #2 · 4命令 / 2出力回路",
  );
  await expect(page.locator("#ladder .ladder-output")).toHaveCount(2);
  await expect(page.locator("#ladder .ladder-output").first()).toContainText(
    "Y1",
  );
});
test("pending and rejected reads clearly identify the circuit still displayed", async ({
  page,
}) => {
  await page.goto("/");
  await closeMenu(page);
  await page.evaluate(() => {
    const original = File.prototype.arrayBuffer;
    Object.assign(window, { completeImport: null });
    File.prototype.arrayBuffer = function () {
      return new Promise((resolve) => {
        Object.assign(window, {
          completeImport: async () => resolve(await original.call(this)),
        });
      });
    };
  });
  await page
    .getByLabel("CSV・リストファイルを選択", { exact: true })
    .setInputFiles({
      name: "waiting.csv",
      mimeType: "text/csv",
      buffer: Buffer.from("unknown,columns\n1,2"),
    });
  const status = page.getByRole("status", {
    name: "ファイル読込結果",
    exact: true,
  });
  await expect(status).toContainText("waiting.csv を読込中");
  await expect(
    page.getByLabel("ラダー表示中のプログラム", { exact: true }),
  ).toContainText("exam_conveyor.csv");
  await page.evaluate(() =>
    (
      window as Window & { completeImport: () => Promise<void> }
    ).completeImport(),
  );
  await expect(status).toContainText("waiting.csv: 解析に問題");
  await expect(
    page.getByLabel("ラダー表示中のプログラム", { exact: true }),
  ).toContainText("waiting.csv");
  await expect(page.locator("#ladder .error")).toBeVisible();
});

test("dropping a CSV onto the central ladder imports it with the menu closed", async ({
  page,
}) => {
  await page.goto("/");
  await closeMenu(page);
  const transfer = await page.evaluateHandle(() => {
    const data = new DataTransfer();
    data.items.add(
      new File(
        ["step,instruction,operand,comment\n0,LD,X2,\n1,OUT,Y2,\n2,END,,"],
        "center-drop.csv",
        { type: "text/csv" },
      ),
    );
    return data;
  });
  await page
    .locator("#ladder")
    .dispatchEvent("dragover", { dataTransfer: transfer });
  await page
    .locator("#ladder")
    .dispatchEvent("drop", { dataTransfer: transfer });
  await expect(
    page.getByLabel("ラダー表示中のプログラム", { exact: true }),
  ).toContainText("center-drop.csv");
  await expect(page.locator("#ladder .ladder-output")).toHaveCount(1);
});
