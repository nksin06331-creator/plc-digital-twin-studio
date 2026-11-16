import { test, expect } from "@playwright/test";
import { selectDemo } from "./helpers";
test("hover menu overlays without moving the parallel workspace and closes with pointer exit or Escape", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  const trigger = page.getByRole("button", {
    name: "メニューを開く",
    exact: true,
  });
  const drawer = page.locator("#studio-menu");
  const before = await page.locator(".live-workbench").boundingBox();
  await expect(drawer).not.toBeVisible();
  await trigger.hover();
  await expect(drawer).toBeVisible();
  expect(await page.locator(".live-workbench").boundingBox()).toEqual(before);
  await page.mouse.move(1300, 100);
  await expect(drawer).not.toBeVisible();
  await trigger.focus();
  await expect(drawer).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(drawer).not.toBeVisible();
  await selectDemo(page, "2級対策・総合演習");
  const ladder = page.locator("#ladder"),
    board = page.locator("#board");
  const a = (await ladder.boundingBox())!,
    b = (await board.boundingBox())!;
  expect(Math.abs(a.y - b.y)).toBeLessThan(2);
  expect(b.x).toBeGreaterThanOrEqual(a.x + a.width);
  await expect(ladder).toBeInViewport();
  await expect(board).toBeInViewport();
  const boardScroll = await board.evaluate((e) => e.scrollTop);
  await page
    .locator(".ladder-canvas")
    .evaluate((e) => (e.scrollTop = e.scrollHeight));
  expect(await board.evaluate((e) => e.scrollTop)).toBe(boardScroll);
  const ladderScroll = await page
    .locator(".ladder-canvas")
    .evaluate((e) => e.scrollTop);
  await board.evaluate((e) => (e.scrollTop = e.scrollHeight));
  expect(
    await page.locator(".ladder-canvas").evaluate((e) => e.scrollTop),
  ).toBe(ladderScroll);
  expect((await ladder.boundingBox())!.y).toBe(a.y);
});
test.describe("touch navigation", () => {
  test.use({
    hasTouch: true,
    isMobile: true,
    viewport: { width: 390, height: 900 },
  });
  test("tap opens the menu and panel width changes never stack the circuit and board", async ({
    page,
  }) => {
    await page.goto("/");
    await page
      .getByRole("button", { name: "メニューを開く", exact: true })
      .tap();
    await expect(page.locator("#studio-menu")).toBeVisible();
    await page
      .getByRole("button", { name: "メニューを閉じる", exact: true })
      .tap();
    await expect(page.locator("#studio-menu")).not.toBeVisible();
    const check = async () => {
      const a = (await page.locator("#ladder").boundingBox())!,
        b = (await page.locator("#board").boundingBox())!;
      expect(Math.abs(a.y - b.y)).toBeLessThan(2);
      expect(b.x).toBeGreaterThanOrEqual(a.x + a.width);
      expect(a.y).toBeGreaterThanOrEqual(0);
      expect(b.y + b.height).toBeLessThanOrEqual(900);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
    };
    await check();
    await page
      .getByRole("button", { name: "回路の幅を広げる", exact: true })
      .tap();
    await check();
    await page
      .getByRole("button", { name: "幅を均等に戻す", exact: true })
      .tap();
    await check();
    await page
      .getByRole("button", { name: "盤を100%で表示", exact: true })
      .tap();
    expect(
      await page
        .locator(".exam-stage-scroll")
        .evaluate((e) => e.scrollWidth > e.clientWidth),
    ).toBe(true);
    await page
      .getByRole("button", { name: "PB2 押しボタン", exact: true })
      .tap();
    await expect(
      page.getByRole("button", { name: "PB2 押しボタン", exact: true }),
    ).toHaveAttribute("aria-pressed", "false");
    await page
      .getByRole("button", { name: "盤を枠に合わせる", exact: true })
      .tap();
    await check();
  });
});
