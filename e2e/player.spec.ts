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

async function injectApi(
  page: import("@playwright/test").Page,
  injection: string,
) {
  await page.route("**/e2e/fixture.tsx", async (route) => {
    const response = await route.fetch();
    const body = (await response.text()).replace(
      "Object.assign(window, { fixture });",
      `Object.assign(window, { fixture }); ${injection}`,
    );
    await route.fulfill({ response, body });
  });
}
test("late Player snapshot preserves description edited in Notes", async ({
  page,
}) => {
  await injectApi(
    page,
    `fixture.notes['player.md']='disk description';descriptionExists=true;fixture.workspace.nodes.push(file('player.md'));const read=api.readPlayer;api.readPlayer=async(...args)=>{const snapshot=await read(...args);return new Promise(resolve=>window.releasePlayerLoad=()=>resolve(snapshot))};`,
  );
  await page.goto("/e2e/fixture.html");
  await expect(page.getByText("Loading player…")).toBeVisible();
  await page.getByRole("button", { name: "Notes", exact: true }).click();
  await page.getByRole("treeitem", { name: "player.md", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Note source" })
    .fill("Latest Notes description");
  await page.evaluate("window.releasePlayerLoad()");
  await page.getByRole("button", { name: "Player", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Note source" })).toHaveText(
    "Latest Notes description",
  );
  expect(await page.evaluate(() => window.fixture.notes["player.md"])).toBe(
    "Latest Notes description",
  );
});
test("failed profile Refresh keeps drafts and Cancel resumes editing", async ({
  page,
}) => {
  await injectApi(
    page,
    `const read=api.readPlayer;let calls=0;api.readPlayer=(...args)=>++calls===1?read(...args):Promise.reject(new Error('Permission denied reading player.json'));`,
  );
  await page.goto("/e2e/fixture.html");
  await expect(
    page.getByRole("textbox", { name: "Player name" }),
  ).toBeVisible();
  await page.evaluate(() => {
    window.fixture.failWrites = true;
  });
  await page
    .getByRole("textbox", { name: "Player name" })
    .fill("Retained name");
  await page
    .getByRole("textbox", { name: "Note source" })
    .fill("Retained description");
  await page.getByRole("button", { name: "Refresh", exact: true }).click();
  await page.getByRole("button", { name: "Discard and Reload" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText(
    "Permission denied",
  );
  await expect(page.getByRole("textbox", { name: "Player name" })).toHaveValue(
    "Retained name",
  );
  await expect(page.getByRole("textbox", { name: "Note source" })).toHaveText(
    "Retained description",
  );
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.evaluate(() => {
    window.fixture.failWrites = false;
  });
  await page
    .getByRole("textbox", { name: "Player name" })
    .fill("Recovered name");
  await expect
    .poll(() => page.evaluate(() => window.fixture.notes["player.md"]))
    .toBe("Retained description");
});
