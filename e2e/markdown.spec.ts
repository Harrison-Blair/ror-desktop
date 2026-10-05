import { expect, type Page, test } from "@playwright/test";
import type { BrowserFixture } from "./fixture";

async function open(page: Page, content: string) {
  await page.goto("/e2e/fixture.html");
  await page.waitForFunction(
    () => !!(window as Window & { fixture?: BrowserFixture }).fixture,
  );
  await page.evaluate((doc) => {
    (window as Window & { fixture: BrowserFixture }).fixture.notes[
      "week-3.md"
    ] = doc;
  }, content);
  const notes = page.getByRole("button", { name: "Notes", exact: true });
  if (await notes.count()) await notes.click();
  await page.getByRole("treeitem", { name: "week-3.md", exact: true }).click();
}
test("heading hierarchy, Setext and code fences", async ({ page }) => {
  await open(
    page,
    "# one\n## two\n### three\n#### four\n##### five\n###### six\n\nTitle\n=====\n\nSubtitle\n-----\n\n```md\n# ignored\n```",
  );
  for (const [level, size] of [32, 28, 24, 21, 18, 16].entries()) {
    await expect(
      page.locator(`.markdown-heading-${level + 1}`).first(),
    ).toHaveCSS("font-size", `${size}px`);
  }
  await expect(page.locator(".markdown-heading-1")).toHaveCount(2);
  await expect(page.locator(".markdown-heading-2")).toHaveCount(2);
});
test("table alignment, empty cells, inline formatting, inert HTML and live updates", async ({
  page,
}) => {
  await open(
    page,
    "| | Center | Right |\n| :- | :-: | -: |\n| | x \\| y | |\n| **bold** *em* `code` | <img src=x onerror=alert(1)> | z |\n| short |\n| a | b | c | ignored |\n",
  );
  const table = page.getByRole("table");
  await expect(table).toBeVisible();
  await expect(table.locator("th")).toHaveCount(3);
  await expect(table.locator("th").nth(1)).toHaveCSS("text-align", "center");
  await expect(table.locator("th").nth(2)).toHaveCSS("text-align", "right");
  await expect(table.locator("tbody tr").first().locator("td")).toHaveText([
    "",
    "x | y",
    "",
  ]);
  await expect(table.locator("strong")).toHaveText("bold");
  await expect(table.locator("em")).toHaveText("em");
  await expect(table.locator("code")).toHaveText("code");
  await expect(table.locator("img")).toHaveCount(0);
  await expect(table.locator("tbody tr").nth(2).locator("td")).toHaveText([
    "short",
    "",
    "",
  ]);
  await expect(table.locator("tbody tr").nth(3).locator("td")).toHaveText([
    "a",
    "b",
    "c",
  ]);
  const editor = page.getByRole("textbox", { name: "Note source" });
  await editor.fill("| Updated | Value |\n| - | - |\n| fresh | now |\n");
  await expect(table.locator("th")).toHaveText(["Updated", "Value"]);
  await expect(table.locator("td")).toHaveText(["fresh", "now"]);
});
test("parser progress and wide previews stay within editor", async ({
  page,
}) => {
  await page.setViewportSize({ width: 720, height: 480 });
  const long = Array.from({ length: 500 }, (_, i) => `Paragraph ${i}`).join(
    "\n\n",
  );
  await open(
    page,
    `${long}\n\n| Header | Value |\n| - | - |\n| ${"long".repeat(300)} | end |\n`,
  );
  const editor = page.getByRole("textbox", { name: "Note source" });
  await editor.click();
  await page.keyboard.press("Control+End");
  const preview = page.getByLabel("Table preview");
  await expect(preview).toBeVisible();
  const geometry = await preview.evaluate((element) => ({
    width: element.clientWidth,
    scroll: element.scrollWidth,
    right: element.getBoundingClientRect().right,
    viewport: window.innerWidth,
  }));
  expect(geometry.scroll).toBeGreaterThan(geometry.width);
  expect(geometry.right).toBeLessThanOrEqual(geometry.viewport);
});
