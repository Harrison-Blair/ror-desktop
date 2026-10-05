import { expect, type Page, test } from "@playwright/test";

async function injectApi(page: Page, injection: string) {
  await page.route("**/e2e/fixture.tsx", async (route) => {
    const response = await route.fetch();
    const body = (await response.text()).replace(
      "Object.assign(window, { fixture });",
      `Object.assign(window, { fixture }); ${injection}`,
    );
    await route.fulfill({ response, body });
  });
}
async function dice(page: Page) {
  await page.goto("/e2e/fixture.html");
  await page.getByRole("button", { name: "Dice", exact: true }).click();
}
for (const colorScheme of ["light", "dark"] as const)
  test(`${colorScheme}: compact dice, keyboard, quick input, error and reroll`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
    await dice(page);
    const input = page.getByRole("textbox", { name: "Roll expression" });
    await input.fill("2d1 + 1d1 + 3");
    await page.getByRole("button", { name: "Roll d4" }).click();
    await expect(input).toHaveValue("2d1 + 1d1 + 3");
    await input.focus();
    await expect(input).toBeFocused();
    await expect(input).toHaveCSS("outline-style", "solid");
    await input.press("Enter");
    await expect(page.getByRole("status")).toContainText(
      "2d1 (1, 1) + 1d1 (1) + 3 = 6",
    );
    await expect(
      page.getByRole("button", { name: "Roll", exact: true }),
    ).toBeEnabled();
    await input.fill("d6+-2");
    await input.press("Enter");
    await expect(page.getByRole("alert")).toContainText("Use notation");
    await expect(page.locator(".dice-history tbody tr")).toHaveCount(2);
    await page.getByRole("button", { name: "Roll again" }).click();
    await expect(page.locator(".dice-history tbody tr")).toHaveCount(3);
    await expect(page.getByRole("alert")).toHaveCount(0);
    await page.screenshot({
      path: `/tmp/ror-dice-implementation/dice-${colorScheme}.png`,
      fullPage: true,
    });
    await page.getByRole("button", { name: "Clear history" }).click();
    await expect(page.getByText("Your rolls will appear here.")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Roll again" }),
    ).toBeEnabled();
    await page.evaluate(() => {
      const words = [3, 1, 6];
      Object.defineProperty(crypto, "getRandomValues", {
        value: (array: Uint32Array) => {
          array[0] = words.shift() ?? 0;
          return array;
        },
      });
    });
    await input.fill("2d6 + 1d8 + 3");
    await input.press("Enter");
    await page.screenshot({
      path: `/tmp/ror-dice-implementation/dice-preview-${colorScheme}.png`,
      fullPage: true,
    });
  });
test("100 dice and seven digit custom faces fit a narrow page", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 360, height: 640 });
  await page.addInitScript(() => {
    Object.defineProperty(crypto, "getRandomValues", {
      value: (array: Uint32Array) => {
        array[0] = 999999;
        return array;
      },
    });
  });
  await dice(page);
  const input = page.getByRole("textbox", { name: "Roll expression" });
  await input.fill("100d1000000-1000000");
  await input.press("Enter");
  await expect(page.locator(".dice-face-item")).toHaveCount(100);
  await expect(page.locator(".dice-total strong")).toHaveText("99000000");
  await expect(page.locator(".die-value").first()).toHaveText("1000000");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  const fits = await page
    .locator(".die-value")
    .first()
    .evaluate((element) => element.scrollWidth <= element.clientWidth);
  expect(fits).toBe(true);
  await page.screenshot({
    path: "/tmp/ror-dice-implementation/dice-narrow-100.png",
    fullPage: true,
  });
  await page.locator(".dice-face-item").first().scrollIntoViewIfNeeded();
  await page.screenshot({
    path: "/tmp/ror-dice-implementation/dice-narrow-faces.png",
    fullPage: true,
  });
  await page.locator(".dice-history").scrollIntoViewIfNeeded();
  await expect(page.locator(".dice-history tr").last()).toHaveCSS(
    "flex-direction",
    "column",
  );
});
test("animation rejects repeated actions and survives navigation", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await dice(page);
  await page.getByRole("textbox", { name: "Roll expression" }).fill("d1");
  await page
    .getByRole("button", { name: "Roll", exact: true })
    .evaluate((element: HTMLButtonElement) => {
      element.click();
      element.click();
    });
  await expect(page.locator(".dice-history tbody tr")).toHaveCount(1);
  for (const name of ["Roll", "Roll again", "Clear history", "Roll d20"])
    await expect(
      page.getByRole("button", { name, exact: true }),
    ).toBeDisabled();
  await page.getByRole("button", { name: "Player", exact: true }).click();
  await page.getByRole("button", { name: "Dice", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("1d1 (1) = 1");
  await expect(
    page.getByRole("button", { name: "Roll", exact: true }),
  ).toBeEnabled();
});
test("folder A/B/A sessions and refresh preserve Dice; cancellation/error retain it", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await injectApi(
    page,
    `let picks=0;const a=structuredClone(fixture.workspace);api.pickWorkspace=async()=>{picks++;if(picks===3)return null;if(picks===4)throw new Error('Picker unavailable');fixture.workspace=picks===1?{...a,generation:2,name:'B',displayPath:'/fixture/B'}:{...a,generation:3};return structuredClone(fixture.workspace)};`,
  );
  await dice(page);
  const input = page.getByRole("textbox", { name: "Roll expression" });
  await input.fill("d1+2");
  await input.press("Enter");
  const pick = async () => {
    await page.getByRole("button", { name: "Workspace folder" }).click();
    await page.getByRole("button", { name: "Open folder…" }).click();
  };
  await pick();
  await expect(page.getByText("B · Session history")).toBeVisible();
  await expect(input).toHaveValue("1d100");
  await input.fill("d1+5");
  await input.press("Enter");
  await pick();
  await expect(page.getByText("reading-group · Session history")).toBeVisible();
  await expect(input).toHaveValue("d1+2");
  await expect(page.getByRole("status")).toContainText("1d1 (1) + 2 = 3");
  await pick();
  await pick();
  await expect(page.getByRole("alert")).toContainText("Picker unavailable");
  await expect(page.getByRole("status")).toContainText("= 3");
  await page.getByRole("button", { name: "Player", exact: true }).click();
  await page.getByRole("button", { name: "Refresh", exact: true }).click();
  await page.getByRole("button", { name: "Dice", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("= 3");
  await expect(input).toHaveValue("d1+2");
});
test("standalone launch, missing folder recovery and disabled bootstrap rail", async ({
  page,
}) => {
  await injectApi(
    page,
    `api.initializeWorkspace=()=>new Promise(resolve=>window.finishBootstrap=()=>resolve({preferences:{...fixture.preferences,lastFolder:'/lost/campaign'},workspace:null,restoreError:'Folder missing'}));api.pickWorkspace=async()=>{window.pickerCalls=(window.pickerCalls||0)+1;return null};`,
  );
  await page.goto("/e2e/fixture.html");
  for (const name of ["Player", "Notes", "Dice", "Workspace folder"])
    await expect(
      page.getByRole("button", { name, exact: true }),
    ).toBeDisabled();
  await page.evaluate("window.finishBootstrap()");
  await expect(page.getByText("Can't find campaign")).toBeVisible();
  await page.getByRole("button", { name: "Dice", exact: true }).click();
  await expect(page.getByText("Temporary session")).toBeVisible();
  await page.getByRole("button", { name: "Workspace folder" }).click();
  expect(await page.evaluate("window.pickerCalls")).toBe(1);
  await page.getByRole("button", { name: "Notes", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Open another folder" }),
  ).toBeVisible();
});
test("failed note save blocks Dice and shared description remains shared", async ({
  page,
}) => {
  await page.goto("/e2e/fixture.html");
  await page
    .getByRole("textbox", { name: "Note source" })
    .fill("shared description");
  await page.getByRole("button", { name: "Notes", exact: true }).click();
  await page.getByRole("treeitem", { name: "player.md", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Note source" })).toHaveText(
    "shared description",
  );
  await page.getByRole("treeitem", { name: "README.md", exact: true }).click();
  await page.evaluate(() => {
    window.fixture.failWrites = true;
  });
  await page
    .getByRole("textbox", { name: "Note source" })
    .fill("keep unsaved draft");
  await page.getByRole("button", { name: "Dice", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Notes", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("textbox", { name: "Note source" })).toHaveText(
    "keep unsaved draft",
  );
  await page.evaluate(() => {
    window.fixture.failWrites = false;
  });
  await page.getByRole("button", { name: "Dice", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Dice" })).toBeVisible();
  await expect(page.locator(".file-header")).toHaveCount(0);
});
