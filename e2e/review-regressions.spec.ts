import { test, expect } from "@playwright/test";
async function frozen(page: import("@playwright/test").Page) {
  await page.clock.install({ time: new Date("2026-11-14T00:00:00Z") });
  await page.goto("/");
  await page.clock.pauseAt(new Date("2026-11-14T00:01:00Z"));
}
test("resume evaluates a held emergency before any conveyor movement", async ({
  page,
}) => {
  await frozen(page);
  await page
    .getByRole("button", { name: "2級対策・総合演習", exact: true })
    .click();
  await page
    .getByRole("button", { name: "▶ 試験運転開始", exact: true })
    .click();
  await page
    .getByRole("button", { name: "SS0 切替スイッチ", exact: true })
    .click();
  await page
    .getByRole("button", { name: "PB1 押しボタン", exact: true })
    .click();
  await page.clock.runFor(400);
  await page
    .getByRole("button", { name: "■ 試験運転停止", exact: true })
    .click();
  const before = await page
    .locator(".work-pallet")
    .getAttribute("data-position");
  await page.keyboard.down("KeyB");
  await page
    .getByRole("button", { name: "▶ 試験運転開始", exact: true })
    .click();
  await expect(page.locator(".work-pallet")).toHaveAttribute(
    "data-position",
    before!,
  );
  await expect(page.getByLabel("DPL 数値表示", { exact: true })).toHaveText(
    "99",
  );
  await page.clock.runFor(500);
  await expect(page.locator(".work-pallet")).toHaveAttribute(
    "data-position",
    before!,
  );
  await page.keyboard.up("KeyB");
});
test("generic momentary quick clicks latch the training circuit without a periodic tick", async ({
  page,
}) => {
  await frozen(page);
  await page
    .getByRole("combobox", { name: "盤モデル", exact: true })
    .selectOption("generic");
  await page
    .getByRole("button", { name: "training_demo", exact: true })
    .click();
  await page
    .getByRole("button", { name: "▶ 試験運転開始", exact: true })
    .click();
  await page
    .getByRole("button", { name: "X0 押しボタン", exact: true })
    .click();
  await expect(
    page.getByRole("status", { name: "Y0 出力", exact: true }),
  ).toHaveClass(/illuminated/);
  await page
    .getByRole("button", { name: "X1 押しボタン", exact: true })
    .click();
  await expect(
    page.getByRole("status", { name: "Y0 出力", exact: true }),
  ).not.toHaveClass(/illuminated/);
});
test("edited wiring aliases keep PLC signal and terminal indicators consistent", async ({
  page,
}) => {
  await page.goto("/");
  await page.locator(".exam-wiring summary").click();
  await page
    .getByRole("textbox", { name: "LS1 PLC割付", exact: true })
    .fill("X0010");
  await page
    .getByRole("button", { name: "割付を適用・初期化", exact: true })
    .click();
  await expect(
    page.getByRole("textbox", { name: "LS1 PLC割付", exact: true }),
  ).toHaveValue("X10");
  await expect(
    page.getByRole("status", { name: "LS1 センサー", exact: true }),
  ).toContainText("ON");
  await expect(page.locator('.terminal-cell b[title="LS1 → X10"]')).toHaveClass(
    /terminal-active/,
  );
});
test("invalid address import displays diagnostics and permits another file to load", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  const input = page.locator('input[type=file][accept=".csv,text/csv"]');
  await input.setInputFiles({
    name: "bad.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(
      "step,instruction,operand,comment\n0,LD,SM400,\n1,*,K1 K1 D9007199254740991,\n2,END,,",
    ),
  });
  await expect(page.locator(".studio")).toBeVisible();
  await expect(page.locator("#diagnostics")).toContainText("終端番地が不正");
  await expect(
    page.getByRole("button", { name: "▶ 試験運転開始", exact: true }),
  ).toBeDisabled();
  await input.setInputFiles({
    name: "good.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(
      "step,instruction,operand,comment\n0,LD,SM400,\n1,OUT,Y30,\n2,END,,",
    ),
  });
  await expect(
    page.getByRole("button", { name: "▶ 試験運転開始", exact: true }),
  ).toBeEnabled();
  expect(errors).toEqual([]);
});
test("large lists render only visible pages and cross-reference selection opens the correct instruction page", async ({
  page,
}) => {
  await page.goto("/");
  const lines = [
    "LD,SM400",
    ...Array.from({ length: 300 }, () => "OUT,M0"),
    "END,",
  ];
  await page.locator('input[type=file][accept=".csv,text/csv"]').setInputFiles({
    name: "many.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(
      "step,instruction,operand,comment\n" +
        lines.map((s, i) => `${i},${s},`).join("\n"),
    ),
  });
  await expect(page.locator("#program")).toHaveCount(0);
  await page.locator(".analysis-tools summary").click();
  await expect(page.locator("#program tbody tr")).toHaveCount(100);
  await page
    .getByRole("button", { name: "命令一覧 次へ", exact: true })
    .click();
  await expect(page.locator("#program .step").first()).toHaveText("100");
  await page
    .getByRole("button", { name: "命令一覧 次へ", exact: true })
    .click();
  await expect(page.locator("#program .step").first()).toHaveText("200");
  const next = page.getByRole("button", {
    name: "M0 使用箇所 次へ",
    exact: true,
  });
  await next.click();
  await next.click();
  await next.click();
  await page
    .getByRole("button", { name: "S151 / L153 / write", exact: true })
    .click();
  await expect(
    page.locator("#program .step").filter({ hasText: /^151$/ }),
  ).toBeVisible();
  await expect(page.locator("#program tbody tr.selected")).toContainText("151");
  await page
    .getByRole("button", { name: "命令一覧 次へ", exact: true })
    .click();
  await expect(page.locator("#program .step").first()).toHaveText("200");
});

test("generic BCD changes are sampled atomically rather than as intermediate bit patterns", async ({
  page,
}) => {
  await frozen(page);
  await page
    .getByRole("combobox", { name: "盤モデル", exact: true })
    .selectOption("generic");
  await page.locator('input[type=file][accept=".csv,text/csv"]').setInputFiles({
    name: "atomic.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(
      "step,instruction,operand,comment\n0,LD,SM400,\n1,MOV,K1X10 D0,\n2,BCD,D0 K2Y10,\n3,LD=,D0 K0,\n4,SET,M0,\n5,END,,",
    ),
  });
  await page
    .getByRole("combobox", { name: "BCD設定値", exact: true })
    .selectOption("7");
  await page
    .getByRole("button", { name: "▶ 試験運転開始", exact: true })
    .click();
  await page
    .getByRole("combobox", { name: "BCD設定値", exact: true })
    .selectOption("8");
  await expect(page.getByLabel("BCD数値表示", { exact: true })).toHaveText(
    "08",
  );
  await page.locator(".analysis-tools summary").click();
  await expect(
    page
      .locator(".device")
      .filter({ has: page.getByText("M0", { exact: true }) })
      .getByRole("button"),
  ).toHaveText("○ OFF");
});

test("single step samples a held emergency before moving and executes once", async ({
  page,
}) => {
  await frozen(page);
  await page
    .getByRole("button", { name: "2級対策・総合演習", exact: true })
    .click();
  await page
    .getByRole("button", { name: "▶ 試験運転開始", exact: true })
    .click();
  await page
    .getByRole("button", { name: "SS0 切替スイッチ", exact: true })
    .click();
  await page
    .getByRole("button", { name: "PB1 押しボタン", exact: true })
    .click();
  await page.clock.runFor(400);
  await page
    .getByRole("button", { name: "■ 試験運転停止", exact: true })
    .click();
  const before = await page
    .locator(".work-pallet")
    .getAttribute("data-position");
  const scans = Number(
    await page.locator(".metrics > div").nth(2).locator("b").textContent(),
  );
  await page.keyboard.down("KeyB");
  await page.getByRole("button", { name: "▶ 1スキャン", exact: true }).click();
  await expect(page.locator(".work-pallet")).toHaveAttribute(
    "data-position",
    before!,
  );
  await expect(page.getByLabel("DPL 数値表示", { exact: true })).toHaveText(
    "99",
  );
  await expect(page.locator(".metrics > div").nth(2).locator("b")).toHaveText(
    String(scans + 1),
  );
  await page.keyboard.up("KeyB");
});

test("loading the comprehensive demo synchronizes edited and applied wiring", async ({
  page,
}) => {
  await page.goto("/");
  await page.locator(".exam-wiring summary").click();
  await page
    .getByRole("textbox", { name: "LS1 PLC割付", exact: true })
    .fill("X20");
  await page
    .getByRole("button", { name: "割付を適用・初期化", exact: true })
    .click();
  await expect(page.locator('.terminal-cell b[title="LS1 → X20"]')).toHaveClass(
    /terminal-active/,
  );
  await page
    .getByRole("button", { name: "2級対策・総合演習", exact: true })
    .click();
  await expect(
    page.getByRole("textbox", { name: "LS1 PLC割付", exact: true }),
  ).toHaveValue("X10");
  await expect(page.locator('.terminal-cell b[title="LS1 → X10"]')).toHaveClass(
    /terminal-active/,
  );
  await page
    .getByRole("button", { name: "割付を適用・初期化", exact: true })
    .click();
  await expect(page.locator('.terminal-cell b[title="LS1 → X10"]')).toHaveClass(
    /terminal-active/,
  );
});

test("manual stepping advances a timer by one interval and rolls back failed movement", async ({
  page,
}) => {
  await frozen(page);
  const upload = page.locator('input[type=file][accept=".csv,text/csv"]');
  await upload.setInputFiles({
    name: "step-timer.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(
      "step,instruction,operand,comment\n0,LD,SM400,\n1,OUT,T0 K2,\n2,LD,T0,\n3,OUT,Y32,\n4,END,,",
    ),
  });
  const step = page.getByRole("button", { name: "▶ 1スキャン", exact: true });
  const lamp = page.getByRole("status", { name: "PL1 表示灯", exact: true });
  await step.click();
  await expect(lamp).not.toHaveClass(/illuminated/);
  await expect(page.locator(".metrics > div").nth(2).locator("b")).toHaveText(
    "1",
  );
  await step.click();
  await expect(lamp).toHaveClass(/illuminated/);
  await expect(page.locator(".metrics > div").nth(2).locator("b")).toHaveText(
    "2",
  );
  await upload.setInputFiles({
    name: "step-error.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(
      "step,instruction,operand,comment\n0,LD,SM400,\n1,OUT,Y30,\n2,BCD,K10000 K2Y36,\n3,END,,",
    ),
  });
  await step.click();
  await expect(page.locator("#diagnostics")).toContainText("BCD範囲外");
  await expect(page.locator(".work-pallet")).toHaveAttribute(
    "data-position",
    "1.0000",
  );
  await expect(page.locator(".metrics > div").nth(2).locator("b")).toHaveText(
    "0",
  );
  await expect(
    page.getByRole("status", { name: "RY1 リレー", exact: true }),
  ).not.toHaveClass(/energized/);
});
