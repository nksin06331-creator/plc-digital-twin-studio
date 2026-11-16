import type { Page } from "@playwright/test";
export async function openMenu(page: Page) {
  await page
    .getByRole("button", { name: "メニューを開く", exact: true })
    .click();
}
export async function closeMenu(page: Page) {
  const close = page.getByRole("button", {
    name: "メニューを閉じる",
    exact: true,
  });
  if (await close.isVisible()) await close.click();
}
export async function selectDemo(page: Page, name: string) {
  await openMenu(page);
  await page.getByRole("button", { name, exact: true }).click();
  await closeMenu(page);
}
export async function selectBoard(page: Page, mode: string) {
  await openMenu(page);
  await page
    .getByRole("combobox", { name: "盤モデル", exact: true })
    .selectOption(mode);
  await closeMenu(page);
}
