import { test, expect } from "@playwright/test";

for (const width of [1366, 390]) {
  test(`native picker reads a UTF16 GX list saved as text at width ${width}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    const rows = [
      [
        "ステップ番号",
        "行間ステートメント",
        "命令",
        "I/O(デバイス)",
        "空欄",
        "PIステートメント",
        "ノート",
      ],
      ["0", "", "LD", "SM400", "", "", ""],
      ["1", "", "OUT", "Y32", "", "", ""],
      ["2", "", "END", "", "", "", ""],
    ];
    const text = rows
      .map((r) => r.map((s) => `"${s}"`).join("\t"))
      .join("\r\n");
    const chooser = page.waitForEvent("filechooser");
    await page.locator("#import .file").click();
    await (
      await chooser
    ).setFiles({
      name: "gx-list.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("\ufeff" + text, "utf16le"),
    });
    await expect(page.locator("header")).toContainText("gx-list.txt");
    await expect(page.locator("header")).toContainText("gx-works2-list-ja-v1");
    await page
      .getByRole("button", { name: "▶ 1スキャン", exact: true })
      .click();
    await expect(
      page.getByRole("status", { name: "PL1 表示灯", exact: true }),
    ).toHaveClass(/illuminated/);
    // An arbitrary extension is selectable, but unrecognized content must not execute.
    await page
      .getByLabel("CSV・リストファイルを選択", { exact: true })
      .setInputFiles({
        name: "invalid.txt",
        mimeType: "text/plain",
        buffer: Buffer.from("unknown,columns\n1,2"),
      });
    await expect(page.locator("header")).toContainText("invalid.txt");
    await expect(page.locator(".preview")).toContainText("unknown");
    await expect(
      page.getByRole("button", { name: "▶ 1スキャン", exact: true }),
    ).toBeDisabled();
  });
}
