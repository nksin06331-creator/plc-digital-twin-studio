import { openMenu, closeMenu } from "./helpers";
import { test, expect } from "@playwright/test";
test("fixed exam layout and physical inputs operate conveyor and limit switches", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await closeMenu(page);
  await openMenu(page);
  await expect(
    page.getByRole("combobox", { name: "盤モデル", exact: true }),
  ).toHaveValue("exam");
  await closeMenu(page);
  await expect(page.locator(".exam-operators .exam-push")).toHaveCount(5);
  await expect(page.locator(".pilot-lamp")).toHaveCount(5);
  await expect(page.locator(".limit-sensor")).toHaveCount(5);
  await expect(page.locator(".exam-terminal .terminal-cell")).toHaveCount(20);
  await expect(
    page.getByRole("status", { name: "LS1 センサー", exact: true }),
  ).toContainText("ON");
  await page
    .getByRole("combobox", { name: "搬送片道時間", exact: true })
    .selectOption("1000");
  await page
    .getByRole("button", { name: "▶ 試験運転開始", exact: true })
    .click();
  await page
    .getByRole("button", { name: "PB2 押しボタン", exact: true })
    .focus();
  await page.keyboard.down("Space");
  await expect(
    page.getByRole("status", { name: "LS2 センサー", exact: true }),
  ).toContainText("ON");
  await page.keyboard.up("Space");
  await expect(
    page.getByRole("status", { name: "RY1 リレー", exact: true }),
  ).toContainText("OFF");
  await page
    .getByRole("combobox", { name: "パレット番号", exact: true })
    .selectOption("5");
  await expect(
    page.getByRole("status", { name: "LS3 センサー", exact: true }),
  ).toContainText("ON");
  await expect(
    page.getByRole("status", { name: "LS4 センサー", exact: true }),
  ).toContainText("OFF");
  await expect(
    page.getByRole("status", { name: "LS5 センサー", exact: true }),
  ).toContainText("ON");
  await page
    .getByRole("combobox", { name: "DSW デジタルスイッチ", exact: true })
    .selectOption("8");
  await expect(page.getByLabel("DPL 数値表示", { exact: true })).toHaveText(
    "08",
  );
  await page.getByRole("button", { name: "CP1 盤電源", exact: true }).click();
  await expect(
    page.getByRole("status", { name: "電源表示灯", exact: true }),
  ).not.toHaveClass(/illuminated/);
  expect(errors).toEqual([]);
});
test("automatic cycle returns to the right end and NC emergency stops motion", async ({
  page,
}) => {
  await page.clock.install({ time: new Date("2026-11-14T00:00:00Z") });
  await page.goto("/");
  await closeMenu(page);
  await page.clock.pauseAt(new Date("2026-11-14T00:01:00Z"));
  await page
    .getByRole("combobox", { name: "搬送片道時間", exact: true })
    .selectOption("1000");
  await page
    .getByRole("button", { name: "SS0 切替スイッチ", exact: true })
    .click();
  await page
    .getByRole("button", { name: "▶ 試験運転開始", exact: true })
    .click();
  await page
    .getByRole("button", { name: "PB1 押しボタン", exact: true })
    .focus();
  await page.keyboard.down("Space");
  await expect(
    page.getByRole("status", { name: "RY1 リレー", exact: true }),
  ).toContainText("ON");
  await page.keyboard.up("Space");
  await page.clock.runFor(1000);
  await expect(
    page.getByRole("status", { name: "LS2 センサー", exact: true }),
  ).toContainText("ON");
  await expect(
    page.getByRole("status", { name: "RY2 リレー", exact: true }),
  ).toContainText("ON");
  await page.clock.runFor(1000);
  await expect(
    page.getByRole("status", { name: "LS1 センサー", exact: true }),
  ).toContainText("ON");
  await expect(
    page.getByRole("status", { name: "RY2 リレー", exact: true }),
  ).toContainText("OFF");
  await page
    .getByRole("button", { name: "SS0 切替スイッチ", exact: true })
    .click();
  await page.keyboard.down("KeyX");
  await page.clock.runFor(100);
  await expect(
    page.getByRole("status", { name: "RY1 リレー", exact: true }),
  ).toContainText("ON");
  await page.keyboard.down("KeyB");
  await page.clock.runFor(100);
  await expect(
    page.getByRole("status", { name: "PL4 表示灯", exact: true }),
  ).toHaveClass(/illuminated/);
  await expect(
    page.getByRole("status", { name: "RY1 リレー", exact: true }),
  ).toContainText("OFF");
  await page.keyboard.up("KeyB");
  await page.keyboard.up("KeyX");
});
test("wiring validation preserves current mapping; mobile uses local horizontal scroll", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await closeMenu(page);
  await page.locator(".exam-wiring summary").click();
  await page
    .getByRole("textbox", { name: "LS1 PLC割付", exact: true })
    .fill("X11");
  await page
    .getByRole("button", { name: "割付を適用・初期化", exact: true })
    .click();
  await expect(page.locator(".wiring-message")).toContainText("重複");
  await expect(
    page.getByRole("status", { name: "LS1 センサー", exact: true }),
  ).toContainText("ON");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("valid wiring applies atomically, exports and imports without changing it silently", async ({
  page,
}) => {
  await page.goto("/");
  await closeMenu(page);
  await page.locator(".exam-wiring summary").click();
  await page
    .getByRole("textbox", { name: "LS1 PLC割付", exact: true })
    .fill("X20");
  await page
    .getByRole("button", { name: "割付を適用・初期化", exact: true })
    .click();
  await expect(page.locator(".wiring-message")).toContainText("適用");
  await expect(page.locator('.terminal-cell b[title="LS1 → X20"]')).toHaveClass(
    /terminal-active/,
  );
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "割付JSON出力", exact: true }).click();
  expect((await pending).suggestedFilename()).toBe("exam-panel-wiring.json");
  await page.locator(".exam-wiring input[type=file]").setInputFiles({
    name: "bad.json",
    mimeType: "application/json",
    buffer: Buffer.from("{"),
  });
  await expect(page.locator(".wiring-message")).not.toHaveText("");
  await expect(page.locator('.terminal-cell b[title="LS1 → X20"]')).toHaveClass(
    /terminal-active/,
  );
});

test("interlocked relay commands warn and do not move the pallet", async ({
  page,
}) => {
  await page.clock.install({ time: new Date("2026-11-14T00:00:00Z") });
  await page.goto("/");
  await closeMenu(page);
  await page.clock.pauseAt(new Date("2026-11-14T00:01:00Z"));
  await page.locator("#import input[type=file]").setInputFiles({
    name: "interlock.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(
      "step,instruction,operand,comment\n0,LD,SM400,\n1,OUT,Y30,\n2,OUT,Y31,\n3,END,,",
    ),
  });
  await page
    .getByRole("button", { name: "▶ 試験運転開始", exact: true })
    .click();
  await page.clock.runFor(1000);
  await expect(page.getByRole("alert")).toContainText("相互インターロック");
  await expect(
    page.getByRole("status", { name: "RY1 リレー", exact: true }),
  ).toContainText("OFF");
  await expect(
    page.getByRole("status", { name: "RY2 リレー", exact: true }),
  ).toContainText("OFF");
  await expect(page.locator(".work-pallet")).toHaveAttribute(
    "data-position",
    "1.0000",
  );
});

test("pallet bolts toggle individually, synchronize the selector and drive left-end detection", async ({
  page,
}) => {
  await page.goto("/");
  await closeMenu(page);
  const upper = page.getByRole("button", {
    name: "ネジ LS5（重み4）",
    exact: true,
  });
  const middle = page.getByRole("button", {
    name: "ネジ LS4（重み2）",
    exact: true,
  });
  const lower = page.getByRole("button", {
    name: "ネジ LS3（重み1）",
    exact: true,
  });
  const number = page.getByRole("combobox", {
    name: "パレット番号",
    exact: true,
  });
  await expect(upper).toHaveAttribute("aria-pressed", "true");
  await upper.click();
  await expect(number).toHaveValue("3");
  await expect(upper).toHaveAttribute("aria-pressed", "false");
  await middle.focus();
  await page.keyboard.press("Space");
  await expect(number).toHaveValue("1");
  await lower.focus();
  await page.keyboard.press("Enter");
  await expect(number).toHaveValue("0");
  await page.getByRole("button", { name: "左端", exact: true }).click();
  for (const name of ["LS3", "LS4", "LS5"])
    await expect(
      page.getByRole("status", { name: name + " センサー", exact: true }),
    ).toContainText("OFF");
  await upper.click();
  await lower.click();
  await expect(number).toHaveValue("5");
  await expect(
    page.getByRole("status", { name: "LS5 センサー", exact: true }),
  ).toContainText("ON");
  await expect(
    page.getByRole("status", { name: "LS3 センサー", exact: true }),
  ).toContainText("ON");
  await expect(
    page.getByRole("status", { name: "LS4 センサー", exact: true }),
  ).toContainText("OFF");
  await number.selectOption("2");
  await expect(upper).toHaveAttribute("aria-pressed", "false");
  await expect(middle).toHaveAttribute("aria-pressed", "true");
  await expect(lower).toHaveAttribute("aria-pressed", "false");
  await expect(
    page.getByRole("status", { name: "LS4 センサー", exact: true }),
  ).toContainText("ON");
  await page.getByRole("button", { name: "中央", exact: true }).click();
  await expect(
    page.getByRole("status", { name: "LS4 センサー", exact: true }),
  ).toContainText("OFF");
});

test("DSW plus and minus controls wrap decimal digits and drive BCD inputs and display", async ({
  page,
}) => {
  await page.goto("/");
  await closeMenu(page);
  const digit = page.getByRole("combobox", {
    name: "DSW デジタルスイッチ",
    exact: true,
  });
  const plus = page.getByRole("button", { name: "DSWを1増やす", exact: true }),
    minus = page.getByRole("button", { name: "DSWを1減らす", exact: true });
  await expect(digit).toHaveValue("0");
  await minus.click();
  await expect(digit).toHaveValue("9");
  await page
    .getByRole("button", { name: "▶ 試験運転開始", exact: true })
    .click();
  await expect(page.getByLabel("DPL 数値表示", { exact: true })).toHaveText(
    "09",
  );
  await page.locator(".exam-wiring summary").click();
  await expect(
    page.locator('.terminal-cell b[title="DSW1 → X1C"]'),
  ).toHaveClass(/terminal-active/);
  await expect(
    page.locator('.terminal-cell b[title="DSW2 → X1D"]'),
  ).not.toHaveClass(/terminal-active/);
  await expect(
    page.locator('.terminal-cell b[title="DSW4 → X1E"]'),
  ).not.toHaveClass(/terminal-active/);
  await expect(
    page.locator('.terminal-cell b[title="DSW8 → X1F"]'),
  ).toHaveClass(/terminal-active/);
  await plus.click();
  await expect(digit).toHaveValue("0");
  await expect(page.getByLabel("DPL 数値表示", { exact: true })).toHaveText(
    "00",
  );
  await plus.focus();
  await page.keyboard.press("Enter");
  await expect(digit).toHaveValue("1");
  await expect(page.getByLabel("DPL 数値表示", { exact: true })).toHaveText(
    "01",
  );
  await digit.selectOption("5");
  await minus.click();
  await expect(digit).toHaveValue("4");
  await expect(page.getByLabel("DPL 数値表示", { exact: true })).toHaveText(
    "04",
  );
});
