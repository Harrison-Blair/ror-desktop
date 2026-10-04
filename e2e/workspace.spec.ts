import { expect, type Locator, type Page, test } from "@playwright/test";

import type { BrowserFixture } from "./fixture";

declare global {
  interface Window {
    fixture: BrowserFixture;
  }
}
async function bounds(locator: Locator) {
  const rect = await locator.boundingBox();
  if (!rect) throw new Error("Expected visible element geometry");
  return rect;
}

const pageErrors = new WeakMap<Page, string[]>();
test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  pageErrors.set(page, errors);
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/e2e/fixture.html");
  await page.waitForFunction(() => !!window.fixture);
});
test.afterEach(({ page }) => {
  expect(pageErrors.get(page)).toEqual([]);
});

for (const colorScheme of ["light", "dark"] as const) {
  for (const size of [
    { width: 720, height: 480 },
    { width: 1280, height: 800 },
  ]) {
    test(`${colorScheme} ${size.width}: editor geometry, images, menus and dialogs`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme });
      await page.setViewportSize(size);
      await page
        .getByRole("treeitem", { name: "README.md", exact: true })
        .click();
      await expect(page.locator(".inline-preview img").first()).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      const before = await bounds(page.locator(".cm-line").first());
      await page.getByRole("button", { name: "Line numbers" }).click();
      const after = await bounds(page.locator(".cm-line").first());
      expect(after.x).toBe(before.x);
      expect(after.width).toBe(before.width);
      await expect(page.locator(".cm-lineNumbers")).toBeVisible();
      const preview = await bounds(page.locator(".inline-preview img").first());
      expect(preview.width).toBeLessThanOrEqual(340);
      expect(preview.height).toBeLessThanOrEqual(340);
      expect(
        await page
          .locator(".cm-content")
          .evaluate((element) => getComputedStyle(element).fontSize),
      ).toBe("16px");
      await page.screenshot({
        path: `.fledge/tmp/${colorScheme}-${size.width}-editor.png`,
      });
      await page
        .getByRole("treeitem", { name: "week-3.md", exact: true })
        .click({ button: "right", position: { x: 5, y: 20 } });
      const menu = await bounds(page.getByRole("menu"));
      expect(menu.x).toBeGreaterThanOrEqual(0);
      expect(menu.y + menu.height).toBeLessThanOrEqual(size.height);
      await page.getByRole("menuitem", { name: "Move to Trash" }).click();
      const dialog = await bounds(page.getByRole("dialog"));
      expect(dialog.x).toBeGreaterThanOrEqual(0);
      expect(dialog.x + dialog.width).toBeLessThanOrEqual(size.width);
      expect(dialog.y + dialog.height).toBeLessThanOrEqual(size.height);
      await page.screenshot({
        path: `.fledge/tmp/${colorScheme}-${size.width}-dialog.png`,
      });
      await page.getByRole("button", { name: "Cancel", exact: true }).click();
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBe(size.width);
    });
  }
}

test("real CodeMirror edits autosave, failed navigation retains draft, retry never navigates unexpectedly", async ({
  page,
}) => {
  await page.getByRole("treeitem", { name: "week-3.md", exact: true }).click();
  const editor = page.getByRole("textbox", { name: "Note source" });
  await editor.click();
  await editor.press("Control+End");
  await editor.press("Enter");
  await page.keyboard.insertText("latest draft");
  await expect
    .poll(() => page.evaluate(() => window.fixture.writes.at(-1)?.content))
    .toContain("latest draft");
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();
  await page.evaluate(() => {
    window.fixture.failWrites = true;
  });
  await page.keyboard.insertText(" retained after failure");
  await page.getByRole("treeitem", { name: "README.md", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("staying on this note");
  await expect(editor).toContainText("retained after failure");
  await page.evaluate(() => {
    window.fixture.failWrites = false;
  });
  await page
    .locator(".save-banner")
    .getByRole("button", { name: "Retry" })
    .click();
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();
  await expect(page.locator(".file-title")).toHaveText("week-3.md");
});

test("dirty refresh fences active and pending writes and reloads discarded source", async ({
  page,
}) => {
  await page.getByRole("treeitem", { name: "week-3.md", exact: true }).click();
  const editor = page.getByRole("textbox", { name: "Note source" });
  await page.evaluate(() => {
    window.fixture.holdWrites = true;
  });
  await editor.click();
  await editor.press("Control+End");
  await page.keyboard.insertText(" active");
  await expect
    .poll(() => page.evaluate(() => window.fixture.writes.length))
    .toBe(1);
  await page.keyboard.insertText(" discard this");
  await page.getByRole("button", { name: "Refresh", exact: true }).click();
  await page.getByRole("button", { name: "Discard and Reload" }).click();
  await page.evaluate(() => {
    window.fixture.holdWrites = false;
    window.fixture.release();
  });
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(editor).not.toContainText("discard this");
  await page.waitForTimeout(650);
  expect(await page.evaluate(() => window.fixture.writes.length)).toBe(1);
});

test("native close callback cancels immediately and flushes the latest revision before guarded close", async ({
  page,
}) => {
  await page.getByRole("treeitem", { name: "week-3.md", exact: true }).click();
  const editor = page.getByRole("textbox", { name: "Note source" });
  await page.evaluate(() => {
    window.fixture.holdWrites = true;
  });
  await editor.click();
  await editor.press("Control+End");
  await page.keyboard.insertText(" first");
  await expect
    .poll(() => page.evaluate(() => window.fixture.writes.length))
    .toBe(1);
  await page.keyboard.insertText(" latest");
  expect(
    await page.evaluate(() => {
      let prevented = false;
      window.fixture.closeRequested({
        preventDefault() {
          prevented = true;
        },
      });
      return prevented;
    }),
  ).toBe(true);
  await page.evaluate(() => {
    window.fixture.holdWrites = false;
    window.fixture.release();
  });
  await expect
    .poll(() => page.evaluate(() => window.fixture.closeCount))
    .toBe(1);
  expect(
    await page.evaluate(() => window.fixture.writes.at(-1)?.content),
  ).toContain("latest");
  expect(await page.evaluate(() => window.fixture.closePrevented)).toBe(false);
});

test("image refresh revokes previews, standalone image never upscales, keyboard menu stays onscreen", async ({
  page,
}) => {
  await page.setViewportSize({ width: 720, height: 480 });
  await page.getByRole("treeitem", { name: "README.md", exact: true }).click();
  await expect(page.locator(".inline-preview img").first()).toBeVisible();
  const old = await page
    .locator(".inline-preview img")
    .first()
    .getAttribute("src");
  await page.getByRole("button", { name: "Refresh", exact: true }).click();
  await expect
    .poll(() => page.locator(".inline-preview img").first().getAttribute("src"))
    .not.toBe(old);
  expect(
    await page.evaluate(
      (url) => url !== null && window.fixture.urlRevoked.includes(url),
      old,
    ),
  ).toBe(true);
  await page.getByRole("treeitem", { name: "images", exact: true }).click();
  await page.getByRole("treeitem", { name: "small.png", exact: true }).click();
  const image = page.getByRole("img", { name: "small.png" });
  await expect(image).toBeVisible();
  const imageBounds = await bounds(image);
  expect(imageBounds.width).toBeLessThanOrEqual(80);
  expect(imageBounds.height).toBeLessThanOrEqual(60);
  await page.getByRole("treeitem", { name: "archive.pdf" }).focus();
  await page.keyboard.press("Shift+F10");
  await expect(page.getByRole("menuitem", { name: "Rename" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("treeitem", { name: "archive.pdf" }),
  ).toBeFocused();
});

test("long note previews appear after scrolling and parsing; minimum pane preserves gutter geometry", async ({
  page,
}) => {
  await page.setViewportSize({ width: 720, height: 480 });
  await page.evaluate(() => {
    window.fixture.notes["week-3.md"] =
      `${Array.from({ length: 700 }, (_, i) => `Paragraph ${i + 1}: ordinary **Markdown** source.\n`).join("\n")}\n![Late image](images/cover.png)\n\nEnd of note.`;
  });
  await page.getByRole("treeitem", { name: "week-3.md", exact: true }).click();
  const resize = page.getByRole("separator", { name: "Sidebar width" });
  const edge = await bounds(resize);
  await page.mouse.move(edge.x + edge.width / 2, edge.y + 120);
  await page.mouse.down();
  await page.mouse.move(480, edge.y + 120);
  await page.mouse.up();
  await expect
    .poll(() => page.evaluate(() => window.fixture.preferences.sidebarWidth))
    .toBe(480);
  const before = await bounds(page.locator(".cm-line").first());
  await page.getByRole("button", { name: "Line numbers" }).click();
  const after = await bounds(page.locator(".cm-line").first());
  expect(after.x).toBe(before.x);
  expect(after.width).toBe(before.width);
  const editor = page.getByRole("textbox", { name: "Note source" });
  await editor.click();
  await editor.press("Control+End");
  await expect(page.getByRole("img", { name: "Late image" })).toBeVisible();
  const image = await bounds(page.getByRole("img", { name: "Late image" }));
  expect(image.x).toBeGreaterThanOrEqual(480);
  expect(image.x + image.width).toBeLessThanOrEqual(720);
  expect(image.width).toBeLessThanOrEqual(176);
  const number = page
    .locator(".cm-lineNumbers .cm-gutterElement")
    .filter({ hasText: /^1402$/ });
  await expect(number).toBeVisible();
  expect((await bounds(number)).x).toBeGreaterThanOrEqual(480);
  await expect(page.locator(".cm-content")).toContainText(
    "![Late image](images/cover.png)",
  );
  expect(await page.evaluate(() => window.fixture.writes.length)).toBe(0);
  await page.locator(".cm-scroller").evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  await page.screenshot({ path: ".fledge/tmp/minimum-pane-long-note.png" });
});

test("ancestor rename rebases relative previews and image rename and trash invalidate them", async ({
  page,
}) => {
  await page.getByRole("treeitem", { name: "notes", exact: true }).click();
  await page
    .getByRole("treeitem", { name: "week-3.md", exact: true })
    .first()
    .click();
  await expect(
    page.getByRole("img", { name: "parent-relative" }),
  ).toBeVisible();
  await page.getByRole("treeitem", { name: "notes", exact: true }).press("F2");
  await page.getByRole("textbox", { name: "Entry name" }).fill("chapters");
  await page.getByRole("textbox", { name: "Entry name" }).press("Enter");
  await expect
    .poll(() => page.evaluate(() => window.fixture.imageReads.at(-1)?.notePath))
    .toBe("chapters/week-3.md");
  expect(
    await page.evaluate(() => window.fixture.imageReads.at(-1)?.path),
  ).toBe("../images/cover.png");
  const firstUrl = await page
    .getByRole("img", { name: "parent-relative" })
    .getAttribute("src");
  await page.getByRole("treeitem", { name: "images", exact: true }).click();
  await page
    .getByRole("treeitem", { name: "cover.png", exact: true })
    .press("F2");
  await page.getByRole("textbox", { name: "Entry name" }).fill("renamed.png");
  await page.getByRole("textbox", { name: "Entry name" }).press("Enter");
  await expect
    .poll(() =>
      page.getByRole("img", { name: "parent-relative" }).getAttribute("src"),
    )
    .not.toBe(firstUrl);
  const secondUrl = await page
    .getByRole("img", { name: "parent-relative" })
    .getAttribute("src");
  await page
    .getByRole("treeitem", { name: "images", exact: true })
    .press("Delete");
  await expect(page.getByRole("dialog")).toContainText(
    "folder and everything inside it",
  );
  await page
    .getByRole("button", { name: "Move to Trash", exact: true })
    .click();
  await expect
    .poll(() =>
      page.getByRole("img", { name: "parent-relative" }).getAttribute("src"),
    )
    .not.toBe(secondUrl);
  await expect(page.locator(".file-title")).toHaveAttribute(
    "title",
    "chapters/week-3.md",
  );
});

test("failed-save banner keeps Retry on one line in a narrow pane", async ({
  page,
}) => {
  await page.setViewportSize({ width: 720, height: 480 });
  await page.getByRole("treeitem", { name: "week-3.md", exact: true }).click();
  const resize = page.getByRole("separator", { name: "Sidebar width" });
  for (let step = 0; step < 22; step++) await resize.press("ArrowRight");
  await expect(resize).toHaveAttribute("aria-valuenow", "480");
  await page.evaluate(() => {
    window.fixture.failWrites = true;
  });
  const editor = page.getByRole("textbox", { name: "Note source" });
  await editor.click();
  await editor.press("Control+End");
  await page.keyboard.insertText(" retained draft");
  await page.getByRole("treeitem", { name: "README.md", exact: true }).click();
  const retry = page.locator(".save-banner button");
  await expect(retry).toBeVisible();
  const lines = await retry.evaluate((button) => {
    const range = document.createRange();
    range.selectNodeContents(button);
    return range.getClientRects().length;
  });
  expect(lines).toBe(1);
  const rect = await bounds(retry);
  expect(rect.x).toBeGreaterThanOrEqual(480);
  expect(rect.x + rect.width).toBeLessThanOrEqual(720);
  await page.screenshot({ path: ".fledge/tmp/minimum-save-banner.png" });
});

test("line numbers align with source after inline image previews load", async ({
  page,
}) => {
  await page.evaluate(() => {
    window.fixture.notes["week-3.md"] =
      "# Alignment\n![one](images/small.png)\nAfter one\n![two](images/small.png)\nAfter two";
  });
  await page.getByRole("treeitem", { name: "week-3.md", exact: true }).click();
  await page.getByRole("button", { name: "Line numbers" }).click();
  await expect(page.locator(".inline-preview img")).toHaveCount(2);
  await expect
    .poll(() =>
      page
        .locator(".inline-preview img")
        .evaluateAll((images) =>
          images.every(
            (image) =>
              (image as HTMLImageElement).complete &&
              (image as HTMLImageElement).naturalWidth > 0,
          ),
        ),
    )
    .toBe(true);
  await expect
    .poll(async () => {
      const lines = await page
        .locator(".cm-line")
        .evaluateAll((nodes) =>
          nodes.map((node) => node.getBoundingClientRect().top),
        );
      const numbers = await page
        .locator(".cm-lineNumbers .cm-gutterElement")
        .evaluateAll((nodes) =>
          nodes
            .filter((node) => node.getBoundingClientRect().height > 0)
            .map((node) => node.getBoundingClientRect().top),
        );
      return Math.max(
        ...lines.map((top, index) => Math.abs(top - numbers[index])),
      );
    })
    .toBeLessThan(1);
});

test("clicking blank space below a short note still edits at its end", async ({
  page,
}) => {
  await page.getByRole("treeitem", { name: "week-3.md", exact: true }).click();
  const scroller = await bounds(page.locator(".cm-scroller"));
  await page.getByRole("button", { name: "Line numbers" }).click();
  await page.mouse.click(
    scroller.x + scroller.width / 2,
    scroller.y + scroller.height - 20,
  );
  await page.keyboard.insertText(" appended below");
  await expect(
    page.getByRole("textbox", { name: "Note source" }),
  ).toContainText("discussion. appended below");
  await expect
    .poll(() => page.evaluate(() => window.fixture.notes["week-3.md"]))
    .toContain("discussion. appended below");
});
