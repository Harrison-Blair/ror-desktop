import { expect, test } from "@playwright/test";
import type { BrowserFixture } from "./fixture";

declare global {
  interface Window {
    fixture: BrowserFixture;
  }
}
test("Player default, editable profile, shared description and bottom folder access", async ({
  page,
}) => {
  await page.goto("/e2e/fixture.html");
  await expect(
    page.getByRole("button", { name: "Player", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("tree")).toHaveCount(0);
  await page.getByRole("textbox", { name: "Player name" }).fill("Ada");
  await page.getByRole("button", { name: "Add stat" }).click();
  await page.getByRole("textbox", { name: "Stat 1 label" }).fill("Strength");
  await page.getByRole("textbox", { name: "Stat 1 value" }).fill("18");
  await page.locator(".cm-content").fill("# Description\n\nA player.");
  await page.getByRole("button", { name: "Notes", exact: true }).click();
  await page.getByRole("treeitem", { name: "player.md", exact: true }).click();
  await expect(page.locator(".cm-content")).toContainText("A player.");
  await page.locator(".cm-content").fill("Shared description");
  await page.getByRole("button", { name: "Player", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Player name" })).toHaveValue(
    "Ada",
  );
  await expect(page.locator(".cm-content")).toContainText("Shared description");
  await page
    .getByRole("button", { name: "player-notes/history/background.md" })
    .click();
  await expect(
    page.getByRole("treeitem", { name: "background.md" }),
  ).toBeFocused();
  await expect(page.locator(".cm-content")).toContainText("Player background");
  await page.getByRole("button", { name: "Workspace folder" }).click();
  await expect(page.locator(".folder-popover")).toContainText(
    "/fixture/reading-group",
  );
  await expect(
    page.getByRole("button", { name: "Open folder…" }),
  ).toBeVisible();
});
for (const colorScheme of ["light", "dark"] as const)
  test(`${colorScheme}: neutral palette and narrow rail layout`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme });
    await page.setViewportSize({ width: 720, height: 480 });
    await page.goto("/e2e/fixture.html");
    const colors = await page.evaluate(() => {
      const style = getComputedStyle(document.documentElement);
      return [
        "--bg",
        "--surface",
        "--text",
        "--accent",
        "--error",
        "--warning",
        "--link",
      ].map((token) => style.getPropertyValue(token).trim());
    });
    for (const color of colors)
      expect(color.slice(1, 3)).toBe(color.slice(3, 5));
    await page.getByRole("button", { name: "Notes", exact: true }).click();
    const rail = await page.locator(".function-rail").boundingBox();
    expect(rail?.width).toBe(56);
    const pane = await page.locator(".main-pane").boundingBox();
    expect(pane?.width).toBeGreaterThanOrEqual(240);
  });
