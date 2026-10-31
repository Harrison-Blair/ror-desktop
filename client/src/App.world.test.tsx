import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "@/App";
import styles from "@/components/menus/PeopleMenu/PeopleMenu.module.css";
import { api, character, resetPeople, store } from "@/test/fakePeople";

vi.mock("@/lib/notesApi", () => ({
  listNotes: async () => [],
  onNotesChanged: async () => () => {},
  getNotesFolder: async () => ({ path: "/notes", missing: null }),
  readNote: async () => "",
  writeNote: async () => {},
}));

vi.mock("@/lib/peopleApi", async () =>
  (await import("@/test/fakePeople")).mockModule(),
);

const DAMAGED = (file: string) =>
  `/data/${file} is damaged and was left as it is (expected value at line 1 column 3). Fix or move the file to go on.`;

const otto = () =>
  character("Otto Brandt", {
    birthDate: "1904-01-21",
    birthCity: "Dortmund",
    birthCountry: "Germany",
    stats: [58, null, null, 40, null, null, null],
    description: "Owns three mills in the Ruhr.",
  });
const rosa = () =>
  character("Rosa Alvarez", {
    birthDate: "1930-06-14",
    birthCity: "Barcelona",
    birthCountry: "Spain",
  });
const jun = () =>
  character("Jun Nakamura", {
    birthDate: "1925-11-09",
    birthCity: "Osaka",
    birthCountry: "Japan",
    deathDate: "1961-08-03",
    deathCity: "Tokyo",
    deathCountry: "Japan",
  });

beforeEach(() => {
  vi.clearAllMocks();
  resetPeople();
  URL.createObjectURL = vi.fn(() => "blob:photo");
  URL.revokeObjectURL = vi.fn();
});

const main = () => within(screen.getByRole("main"));
const railPanel = () =>
  within(screen.getByRole("region", { name: "World rail panel" }));
const alert = () =>
  within(screen.getByRole("region", { name: "Notifications" })).getByRole(
    "alert",
  );
// Waits for the toast, which can come a moment after the action.
const findAlert = () =>
  within(screen.getByRole("region", { name: "Notifications" })).findByRole(
    "alert",
  );

async function openWorld() {
  render(<App />);
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "World" }));
  await main().findByRole("heading", { name: "People of interest" });
  return user;
}

const card = (name: string) =>
  main().getByRole("button", { name: new RegExp(`^${name}`) });

// The names on the cards, in order.
const cardNames = () =>
  main()
    .getAllByRole("button")
    .filter((b) => b.classList.contains(styles.card))
    .map((b) => b.querySelector(`.${styles.cardName}`)?.textContent);

// Fills the Add person form; `stats` are the left values by pair.
async function addPerson(
  user: ReturnType<typeof userEvent.setup>,
  fields: Record<string, string>,
) {
  await user.click(main().getAllByRole("button", { name: "Add person" })[0]);
  for (const [label, value] of Object.entries(fields)) {
    await user.type(main().getByLabelText(label), value);
  }
  await user.click(main().getByRole("button", { name: "Save" }));
}

describe("World tab", () => {
  it("is a working tab; Session still is not", async () => {
    render(<App />);
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "World" }));

    expect(
      screen.getByRole("button", { name: "World", pressed: true }),
    ).toBeInTheDocument();
    expect(railPanel().getByRole("heading", { name: "World" })).toBeVisible();
    expect(
      screen.queryByRole("region", { name: "Notes rail panel" }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Session" }));
    expect(alert()).toHaveTextContent("Session is not implemented yet.");
    expect(
      screen.getByRole("button", { name: "World", pressed: true }),
    ).toBeInTheDocument();
  });

  // Check 1
  it("starts empty with the default game date", async () => {
    await openWorld();

    expect(
      railPanel().getByRole("button", {
        name: "Game date · 10 February 1962",
      }),
    ).toBeInTheDocument();
    expect(
      railPanel().getByRole("button", {
        name: "People of interest",
        pressed: true,
      }),
    ).toBeInTheDocument();
    expect(
      main().getByText(
        "No people yet. Add person creates a character that no player plays.",
      ),
    ).toBeInTheDocument();
  });

  it("with only your character, invites you to add others", async () => {
    store.characters = [rosa()];
    store.meId = "rosa-alvarez";
    await openWorld();

    expect(card("Rosa Alvarez")).toBeInTheDocument();
    expect(
      main().getByText(
        "No other people yet. Add person creates a character that no player plays.",
      ),
    ).toBeInTheDocument();
  });
});

describe("Game date", () => {
  // Check 2
  it("saves a typed date and keeps it after a restart", async () => {
    const user = await openWorld();

    await user.click(railPanel().getByRole("button", { name: /Game date/ }));
    const box = railPanel().getByLabelText("Game date");
    expect(box).toHaveValue("10 February 1962");
    expect(box).toHaveFocus();
    await user.clear(box);
    await user.type(box, "3/8/1961{Enter}");

    expect(
      await railPanel().findByRole("button", {
        name: "Game date · 3 August 1961",
      }),
    ).toBeInTheDocument();
    expect(api.setGameDate).toHaveBeenCalledWith("1961-08-03");

    // A restart: the app loads the saved files again.
    cleanup();
    await openWorld();
    expect(
      railPanel().getByRole("button", { name: "Game date · 3 August 1961" }),
    ).toBeInTheDocument();
  });

  // Check 3
  it("refuses an empty date and stays open; Escape restores the old one", async () => {
    const user = await openWorld();

    await user.click(railPanel().getByRole("button", { name: /Game date/ }));
    const box = railPanel().getByLabelText("Game date");
    await user.clear(box);
    await user.keyboard("{Enter}");

    expect(box).toHaveAccessibleDescription("Enter a game date.");
    expect(box).toBeInTheDocument();
    await user.click(
      main().getByRole("heading", { name: "People of interest" }),
    );
    expect(railPanel().getByLabelText("Game date")).toBeInTheDocument();

    await user.type(railPanel().getByLabelText("Game date"), "31 Feb 1962");
    expect(railPanel().getByLabelText("Game date")).toHaveAccessibleDescription(
      "Not a real date.",
    );

    await user.keyboard("{Escape}");
    expect(
      railPanel().getByRole("button", {
        name: "Game date · 10 February 1962",
      }),
    ).toBeInTheDocument();
    expect(api.setGameDate).not.toHaveBeenCalled();
  });
});

describe("Add and edit form", () => {
  // Check 4
  it("needs a name, and saves nothing without one", async () => {
    const user = await openWorld();

    await addPerson(user, {});

    expect(main().getByLabelText("Name")).toHaveAccessibleDescription(
      "Enter a name.",
    );
    expect(api.createPerson).not.toHaveBeenCalled();
    expect(main().getByText("New person")).toBeInTheDocument();
  });

  // Check 5
  it("shows date errors after Save, then as you type", async () => {
    const user = await openWorld();

    await user.click(main().getAllByRole("button", { name: "Add person" })[0]);
    const birth = main().getByLabelText("Birth date");
    expect(birth).toHaveAttribute("placeholder", "Day Month Year");
    await user.type(birth, "31 February 1904");
    expect(birth).not.toHaveAccessibleDescription();
    await user.click(main().getByRole("button", { name: "Save" }));
    expect(birth).toHaveAccessibleDescription("Not a real date.");

    await user.clear(birth);
    await user.type(birth, "next week");
    expect(birth).toHaveAccessibleDescription("Use day, month and year.");
  });

  // Check 6
  it("rewrites a valid date on leaving the box", async () => {
    const user = await openWorld();

    await user.click(main().getAllByRole("button", { name: "Add person" })[0]);
    await user.type(main().getByLabelText("Birth date"), "January 21, 1904");
    await user.tab();

    expect(main().getByLabelText("Birth date")).toHaveValue("21 January 1904");
  });

  // Check 7
  it("checks the death date against the birth date and the game date", async () => {
    const user = await openWorld();

    await addPerson(user, {
      Name: "Ada",
      "Birth date": "1 May 1920",
      "Death date (optional)": "1 May 1919",
    });
    const death = main().getByLabelText("Death date (optional)");
    expect(death).toHaveAccessibleDescription(
      "Death date is before the birth date.",
    );

    await user.clear(death);
    await user.type(death, "1 March 1962");
    expect(death).toHaveAccessibleDescription(
      "Death date is after the game date.",
    );
    expect(api.createPerson).not.toHaveBeenCalled();
  });

  // Check 8
  it("checks stat values and shows the right value", async () => {
    const user = await openWorld();

    await addPerson(user, { Name: "Ada", "Stat 1 value": "101" });
    const value = main().getByLabelText("Stat 1 value");
    expect(value).toHaveAccessibleDescription(
      "Use a whole number from 0 to 100.",
    );
    expect(api.createPerson).not.toHaveBeenCalled();

    await user.clear(value);
    await user.type(value, "30");
    expect(value).not.toHaveAccessibleDescription();
    // biome-ignore lint/style/noNonNullAssertion: the row holds the box
    const row = within(value.parentElement!);
    expect(row.getByText("70")).toBeInTheDocument();
  });

  // Check 9
  it("saves a valid person, opens the sheet, and lists them as a card", async () => {
    const user = await openWorld();
    expect(
      main().getByRole("button", { name: "Cards", pressed: true }),
    ).toBeInTheDocument();

    await addPerson(user, {
      Name: "  Otto Brandt ",
      "Birth date": "21 January 1904",
      "Birthplace city": "Dortmund",
      "Birthplace country": "Germany",
      "Stat 1 value": "58",
    });

    expect(
      await main().findByRole("heading", { name: /^Otto Brandt ?\(58\)$/ }),
    ).toBeInTheDocument();
    expect(api.createPerson).toHaveBeenCalledWith({
      name: "Otto Brandt",
      birthDate: "1904-01-21",
      birthCity: "Dortmund",
      birthCountry: "Germany",
      deathDate: null,
      deathCity: "",
      deathCountry: "",
      stats: [58, null, null, null, null, null, null],
      description: "",
    });
    expect(main().getByText("January 21, 1904")).toBeInTheDocument();
    expect(main().getByText("Dortmund, Germany")).toBeInTheDocument();

    await user.click(
      main().getByRole("button", { name: "People of interest" }),
    );
    expect(card("Otto Brandt")).toHaveTextContent(
      "Otto BrandtJan 21, 1904 (58)Dortmund, Germany",
    );
    expect(
      main().getByRole("button", { name: "Cards", pressed: true }),
    ).toBeInTheDocument();
  });

  it("Cancel on Add returns to the list; Cancel on Edit discards the changes", async () => {
    store.characters = [otto()];
    const user = await openWorld();

    await user.click(main().getAllByRole("button", { name: "Add person" })[0]);
    await user.click(main().getByRole("button", { name: "Cancel" }));
    expect(card("Otto Brandt")).toBeInTheDocument();

    await user.click(card("Otto Brandt"));
    await user.click(main().getByRole("button", { name: "Edit" }));
    expect(main().getByText("Editing")).toBeInTheDocument();
    expect(main().getByLabelText("Birth date")).toHaveValue("21 January 1904");
    await user.type(main().getByLabelText("Name"), "x");
    await user.click(main().getByRole("button", { name: "Cancel" }));

    expect(
      main().getByRole("heading", { name: /^Otto Brandt ?\(58\)$/ }),
    ).toBeInTheDocument();
    expect(api.updatePerson).not.toHaveBeenCalled();
  });

  it("Edit saves every field and returns to the sheet", async () => {
    store.characters = [otto()];
    const user = await openWorld();

    await user.click(card("Otto Brandt"));
    await user.click(main().getByRole("button", { name: "Edit" }));
    await user.clear(main().getByLabelText("Stat 4 value"));
    await user.type(main().getByLabelText("Description"), " And a newspaper.");
    await user.click(main().getByRole("button", { name: "Save" }));

    expect(
      await main().findByRole("heading", { name: /^Otto Brandt ?\(58\)$/ }),
    ).toBeInTheDocument();
    expect(api.updatePerson).toHaveBeenCalledWith("otto-brandt", {
      ...otto(),
      id: undefined,
      photo: undefined,
      stats: [58, null, null, null, null, null, null],
      description: "Owns three mills in the Ruhr. And a newspaper.",
    });
    expect(
      main().getByText("Owns three mills in the Ruhr. And a newspaper."),
    ).toBeInTheDocument();
  });

  it("a refused save shows the error and keeps the form", async () => {
    store.damaged.characters = DAMAGED("characters.json");
    const user = await openWorld();

    await addPerson(user, { Name: "Ada" });

    await waitFor(() =>
      expect(alert()).toHaveTextContent(DAMAGED("characters.json")),
    );
    expect(main().getByText("New person")).toBeInTheDocument();
    expect(main().getByLabelText("Name")).toHaveValue("Ada");
  });
});

describe("Cards and table", () => {
  // Check 10
  it("a dead person's card is muted with both dates and places; no star on the sheet", async () => {
    store.characters = [jun()];
    const user = await openWorld();

    expect(card("Jun Nakamura")).toHaveClass(styles.dead);
    expect(card("Jun Nakamura")).toHaveTextContent(
      "Jun NakamuraNov 9, 1925 – Aug 3, 1961 (35)Osaka, Japan – Tokyo, Japan",
    );

    await user.click(card("Jun Nakamura"));
    expect(
      main().getByRole("heading", { name: /^Jun Nakamura ?\(35\)$/ }),
    ).toBeInTheDocument();
    expect(
      main().getByText("November 9, 1925 – August 3, 1961"),
    ).toBeInTheDocument();
    expect(main().getByText("Osaka, Japan – Tokyo, Japan")).toBeInTheDocument();
    expect(
      main().queryByRole("button", { name: "This is me" }),
    ).not.toBeInTheDocument();
  });

  it("a living person's card is not muted", async () => {
    store.characters = [otto()];
    await openWorld();

    expect(card("Otto Brandt")).not.toHaveClass(styles.dead);
  });

  // Check 11
  it("a person with no places has no place line", async () => {
    store.characters = [
      character("Ada", { birthDate: "1920-05-01", deathDate: "1960-01-01" }),
    ];
    const user = await openWorld();

    expect(card("Ada")).toHaveTextContent(
      /^AAdaMay 1, 1920 – Jan 1, 1960 \(39\)$/,
    );

    await user.click(card("Ada"));
    const head = main().getByRole("heading", { name: /^Ada ?\(39\)$/ });
    // biome-ignore lint/style/noNonNullAssertion: the title block holds it
    expect(head.parentElement!).toHaveTextContent(
      /^Ada\(39\)May 1, 1920 – January 1, 1960$/,
    );
  });

  it("drops an empty place part and shows a long place in a tooltip", async () => {
    store.characters = [
      character("Ada", {
        birthCity: "Barcelona",
        deathDate: "1960-01-01",
        deathCountry: "",
      }),
    ];
    await openWorld();

    const place = within(card("Ada")).getByText("Barcelona");
    expect(place).toHaveAttribute("title", "Barcelona");
  });

  // Check 12
  it("a person with no birth date shows no age and no date line", async () => {
    store.characters = [
      character("Ada", { birthCity: "Lyon", birthCountry: "France" }),
    ];
    const user = await openWorld();

    expect(card("Ada")).toHaveTextContent(/^AAdaLyon, France$/);

    await user.click(card("Ada"));
    const head = main().getByRole("heading", { name: "Ada" });
    // biome-ignore lint/style/noNonNullAssertion: the title block holds it
    expect(head.parentElement!).toHaveTextContent(/^AdaLyon, France$/);
  });

  // Check 18
  it("the table has Name, Birthplace and Age, and sorts by a column", async () => {
    store.characters = [
      otto(),
      rosa(),
      jun(),
      character("Ada"),
      character("Victor Dumont", { birthDate: "1890-02-01" }),
    ];
    const user = await openWorld();

    await user.click(main().getByRole("button", { name: "Table" }));
    const table = within(main().getByRole("table"));
    expect(
      table.getAllByRole("columnheader").map((h) => h.textContent),
    ).toEqual(["Name", "Birthplace", "Age"]);
    const names = () =>
      table
        .getAllByRole("row")
        .slice(1)
        .map((row) => within(row).getAllByRole("cell")[0].textContent);
    expect(names()).toEqual([
      "AAda",
      "JNJun Nakamura",
      "OBOtto Brandt",
      "RARosa Alvarez",
      "VDVictor Dumont",
    ]);
    expect(table.getAllByRole("row")[2]).toHaveClass(styles.dead);

    await user.click(table.getByRole("button", { name: "Age" }));
    expect(table.getByRole("columnheader", { name: "Age" })).toHaveAttribute(
      "aria-sort",
      "ascending",
    );
    // Ages 31, 35, 58, 72; no age last.
    expect(names()).toEqual([
      "RARosa Alvarez",
      "JNJun Nakamura",
      "OBOtto Brandt",
      "VDVictor Dumont",
      "AAda",
    ]);

    await user.click(table.getByRole("button", { name: "Age" }));
    expect(names()).toEqual([
      "VDVictor Dumont",
      "OBOtto Brandt",
      "JNJun Nakamura",
      "RARosa Alvarez",
      "AAda",
    ]);
  });

  it("cards sort by name or age, both ways, with your character first", async () => {
    store.characters = [otto(), rosa(), jun(), character("Ada")];
    store.meId = "otto-brandt";
    const user = await openWorld();

    expect(cardNames()).toEqual([
      "Otto Brandt",
      "Ada",
      "Jun Nakamura",
      "Rosa Alvarez",
    ]);

    await user.click(
      main().getByRole("button", { name: "Ascending, change order" }),
    );
    expect(cardNames()).toEqual([
      "Otto Brandt",
      "Rosa Alvarez",
      "Jun Nakamura",
      "Ada",
    ]);

    await user.selectOptions(main().getByLabelText("Sort by"), "age");
    // Descending: 35, 31; no age last.
    expect(cardNames()).toEqual([
      "Otto Brandt",
      "Jun Nakamura",
      "Rosa Alvarez",
      "Ada",
    ]);
  });

  // Check 19
  it("search matches the name only", async () => {
    store.characters = [otto(), rosa()];
    const user = await openWorld();
    const search = main().getByRole("searchbox", { name: "Search people" });

    await user.type(search, "bran");
    expect(card("Otto Brandt")).toBeInTheDocument();
    expect(
      main().queryByRole("button", { name: /^Rosa Alvarez/ }),
    ).not.toBeInTheDocument();

    await user.clear(search);
    await user.type(search, "mills");
    expect(main().getByText("No one matches “mills”.")).toBeInTheDocument();
    await user.click(main().getByRole("button", { name: "Clear search" }));
    expect(card("Rosa Alvarez")).toBeInTheDocument();
  });

  // Check 20
  it("Players shows only your character, and no one shows PC", async () => {
    store.characters = [otto(), rosa(), jun()];
    store.meId = "rosa-alvarez";
    const user = await openWorld();
    const show = within(main().getByRole("group", { name: "Show" }));

    expect(show.getByRole("button", { name: /^All ?3$/ })).toBeInTheDocument();
    expect(show.getByRole("button", { name: /^NPCs ?2$/ })).toBeInTheDocument();
    await user.click(show.getByRole("button", { name: /^Players ?1$/ }));

    expect(card("Rosa Alvarez")).toBeInTheDocument();
    expect(
      main().queryByRole("button", { name: /^Otto Brandt/ }),
    ).not.toBeInTheDocument();
    expect(main().queryByText("PC")).not.toBeInTheDocument();

    await user.click(show.getByRole("button", { name: /^NPCs ?2$/ }));
    expect(
      main().queryByRole("button", { name: /^Rosa Alvarez/ }),
    ).not.toBeInTheDocument();
    expect(card("Otto Brandt")).toBeInTheDocument();
  });
});

describe("Sheet", () => {
  it("shows the stat pairs with their shared names, and 'not set'", async () => {
    store.characters = [otto()];
    const user = await openWorld();

    await user.click(card("Otto Brandt"));
    const stats = within(main().getByRole("region", { name: "Stats" }));
    expect(stats.getByText("[Stat 1A]").parentElement).toHaveTextContent(
      "[Stat 1A]5842[Stat 1B]",
    );
    expect(stats.getByText("[Stat 2A]").parentElement).toHaveTextContent(
      "[Stat 2A]not set[Stat 2B]",
    );
    expect(stats.getAllByText(/^\[Stat \dA\]$/)).toHaveLength(7);
  });

  it("shows a saved photo, read as bytes", async () => {
    store.characters = [otto()];
    const user = await openWorld();
    await user.click(card("Otto Brandt"));
    store.pick = "/pics/otto.png";

    await user.click(main().getByRole("button", { name: "Edit" }));
    await user.click(main().getByRole("button", { name: "Add photo" }));
    expect(main().getByText("New photo: otto.png")).toBeInTheDocument();
    await user.click(main().getByRole("button", { name: "Save" }));

    await main().findByRole("heading", { name: /^Otto Brandt ?\(58\)$/ });
    expect(api.setPhoto).toHaveBeenCalledWith("otto-brandt", "/pics/otto.png");
    await waitFor(() =>
      expect(
        screen.getByRole("main").querySelector('img[src="blob:photo"]'),
      ).not.toBeNull(),
    );
  });

  // Checks 13 and 14
  it("This is me claims a living person; a second claim says who stops being yours", async () => {
    store.characters = [otto(), rosa()];
    const user = await openWorld();

    await user.click(card("Rosa Alvarez"));
    const star = main().getByRole("button", { name: "This is me" });
    expect(star).toHaveAttribute("title", "This is me");
    await user.click(star);
    let dialog = within(screen.getByRole("alertdialog"));
    expect(
      dialog.getByRole("heading", {
        name: "Make Rosa Alvarez your character?",
      }),
    ).toBeInTheDocument();
    expect(dialog.queryByText(/stays in the list/)).not.toBeInTheDocument();
    await user.click(dialog.getByRole("button", { name: "Confirm" }));

    await waitFor(() => expect(store.meId).toBe("rosa-alvarez"));
    const heading = await main().findByRole("heading", {
      name: /^Rosa Alvarez ?\(31\) ?Your character$/,
    });
    expect(heading).toBeInTheDocument();
    expect(
      main().queryByRole("button", { name: "This is me" }),
    ).not.toBeInTheDocument();
    expect(
      main().queryByRole("button", { name: /^Delete/ }),
    ).not.toBeInTheDocument();

    await user.click(
      main().getByRole("button", { name: "People of interest" }),
    );
    expect(
      within(card("Rosa Alvarez")).getByRole("img", { name: "Your character" }),
    ).toBeInTheDocument();
    // Pinned first, before Otto.
    expect(cardNames()).toEqual(["Rosa Alvarez", "Otto Brandt"]);
    await user.click(main().getByRole("button", { name: "Table" }));
    expect(
      within(main().getAllByRole("row")[1]).getByRole("img", {
        name: "Your character",
      }),
    ).toBeInTheDocument();

    await user.click(main().getByRole("button", { name: /^Otto Brandt/ }));
    await user.click(main().getByRole("button", { name: "This is me" }));
    dialog = within(screen.getByRole("alertdialog"));
    expect(
      dialog.getByText(
        "Rosa Alvarez stays in the list but is no longer your character.",
      ),
    ).toBeInTheDocument();
    await user.click(dialog.getByRole("button", { name: "Confirm" }));

    await waitFor(() => expect(store.meId).toBe("otto-brandt"));
    await user.click(
      main().getByRole("button", { name: "People of interest" }),
    );
    const rosaRow = main().getByRole("button", { name: /^Rosa Alvarez/ });
    expect(rosaRow).toBeInTheDocument();
    expect(
      within(rosaRow).queryByRole("img", { name: "Your character" }),
    ).not.toBeInTheDocument();
  });

  it("Cancel in the claim dialog changes nothing", async () => {
    store.characters = [otto()];
    const user = await openWorld();

    await user.click(card("Otto Brandt"));
    await user.click(main().getByRole("button", { name: "This is me" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(api.setMe).not.toHaveBeenCalled();
  });

  // Check 17
  it("Delete asks first, then removes the person and their photo", async () => {
    store.characters = [{ ...otto(), photo: "otto-brandt.png" }, rosa()];
    store.photos.set("otto-brandt", new ArrayBuffer(4));
    const user = await openWorld();

    await user.click(card("Otto Brandt"));
    await user.click(
      main().getByRole("button", { name: "Delete Otto Brandt" }),
    );
    const dialog = within(screen.getByRole("alertdialog"));
    expect(
      dialog.getByRole("heading", { name: "Delete Otto Brandt?" }),
    ).toBeInTheDocument();
    await user.click(dialog.getByRole("button", { name: "Delete" }));

    await waitFor(() => expect(card("Rosa Alvarez")).toBeInTheDocument());
    expect(
      main().queryByRole("button", { name: /Otto Brandt/ }),
    ).not.toBeInTheDocument();
    expect(api.deletePerson).toHaveBeenCalledWith("otto-brandt");
    expect(store.photos.has("otto-brandt")).toBe(false);
  });

  // Check 16
  it("a stat rename in one form renames it on every sheet; an empty name keeps the old", async () => {
    store.characters = [otto(), rosa()];
    const user = await openWorld();

    await user.click(card("Otto Brandt"));
    await user.click(main().getByRole("button", { name: "Edit" }));
    const left = main().getByLabelText("Stat 1 left name");
    await user.clear(left);
    await user.type(left, "Order");
    await user.click(main().getByRole("button", { name: "Save" }));
    await main().findByRole("heading", { name: /^Otto Brandt ?\(58\)$/ });

    await user.click(
      main().getByRole("button", { name: "People of interest" }),
    );
    await user.click(card("Rosa Alvarez"));
    expect(
      within(main().getByRole("region", { name: "Stats" })).getByText("Order"),
    ).toBeInTheDocument();

    await user.click(main().getByRole("button", { name: "Edit" }));
    await user.clear(main().getByLabelText("Stat 1 left name"));
    await user.click(main().getByRole("button", { name: "Save" }));
    await main().findByRole("heading", { name: /^Rosa Alvarez ?\(31\)$/ });
    expect(
      within(main().getByRole("region", { name: "Stats" })).getByText("Order"),
    ).toBeInTheDocument();
  });
});

describe("Notes character button", () => {
  // Check 15
  it("names your character and opens their sheet in World", async () => {
    store.characters = [otto(), rosa()];
    store.meId = "rosa-alvarez";
    render(<App />);
    const user = userEvent.setup();
    const notes = within(
      screen.getByRole("region", { name: "Notes rail panel" }),
    );

    const button = await notes.findByRole("button", {
      name: /^Rosa Alvarez ?Your character$/,
    });
    await user.click(button);

    expect(
      await main().findByRole("heading", {
        name: /^Rosa Alvarez ?\(31\) ?Your character$/,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "World", pressed: true }),
    ).toBeInTheDocument();
  });

  it("does not show without a character", async () => {
    store.characters = [otto()];
    render(<App />);
    await waitFor(() => expect(api.listPeople).toHaveBeenCalled());

    expect(
      screen.queryByRole("button", { name: /Your character/ }),
    ).not.toBeInTheDocument();
  });
});

describe("Damaged files", () => {
  // Check 21
  it("a damaged characters.json shows its error in place of the list, and Add person can't save", async () => {
    store.characters = [otto()];
    store.damaged.characters = DAMAGED("characters.json");
    const user = await openWorld();

    expect(main().getByRole("alert")).toHaveTextContent(
      DAMAGED("characters.json"),
    );
    expect(
      main().queryByRole("button", { name: /Otto Brandt/ }),
    ).not.toBeInTheDocument();

    await addPerson(user, { Name: "Ada" });
    await waitFor(() =>
      expect(alert()).toHaveTextContent(DAMAGED("characters.json")),
    );
    expect(store.characters.map((c) => c.name)).toEqual(["Otto Brandt"]);
  });

  it("a damaged world.json shows its error, and the game date can't be changed", async () => {
    store.characters = [otto()];
    store.damaged.world = DAMAGED("world.json");
    await openWorld();

    expect(main().getByRole("alert")).toHaveTextContent(DAMAGED("world.json"));
    expect(
      railPanel().queryByRole("button", { name: /Game date/ }),
    ).not.toBeInTheDocument();
    expect(main().getByRole("button", { name: "Add person" })).toBeDisabled();
  });

  it("a damaged config.json shows its error, so no one can be deleted", async () => {
    store.characters = [otto(), rosa()];
    store.meId = "rosa-alvarez";
    store.damaged.config =
      "Couldn't tell which character is yours: /config/config.json is not a valid config (expected value).";
    await openWorld();

    expect(main().getByRole("alert")).toHaveTextContent(
      "Couldn't tell which character is yours",
    );
    expect(
      main().queryByRole("button", { name: /Otto Brandt/ }),
    ).not.toBeInTheDocument();
    expect(api.deletePerson).not.toHaveBeenCalled();
  });

  it("opening World again reloads, so a fixed file shows the list", async () => {
    store.characters = [otto()];
    store.damaged.characters = DAMAGED("characters.json");
    const user = await openWorld();
    expect(main().getByRole("alert")).toBeInTheDocument();

    store.damaged = {};
    await user.click(screen.getByRole("button", { name: "Notes" }));
    await user.click(screen.getByRole("button", { name: "World" }));

    expect(
      await main().findByRole("button", { name: /^Otto Brandt/ }),
    ).toBeInTheDocument();
  });
});

describe("Leaving World", () => {
  const discard = () =>
    within(screen.getByRole("alertdialog", { name: "Discard changes?" }));

  it("keeps the list settings when you come back", async () => {
    store.characters = [otto(), rosa(), jun()];
    store.meId = "rosa-alvarez";
    const user = await openWorld();
    const show = within(main().getByRole("group", { name: "Show" }));
    await user.click(show.getByRole("button", { name: /^NPCs/ }));
    await user.type(
      main().getByRole("searchbox", { name: "Search people" }),
      "a",
    );
    await user.selectOptions(
      main().getByRole("combobox", { name: /^Sort by/ }),
      "age",
    );
    await user.click(
      main().getByRole("button", { name: "Ascending, change order" }),
    );
    await user.click(main().getByRole("button", { name: "Table" }));

    await user.click(screen.getByRole("button", { name: "Notes" }));
    await user.click(screen.getByRole("button", { name: "World" }));

    await main().findByRole("table");
    expect(
      main().getByRole("searchbox", { name: "Search people" }),
    ).toHaveValue("a");
    expect(main().getByRole("columnheader", { name: /^Age/ })).toHaveAttribute(
      "aria-sort",
      "descending",
    );
    const names = within(main().getByRole("table"))
      .getAllByRole("row")
      .slice(1)
      .map((row) => within(row).getAllByRole("cell")[0].textContent);
    expect(names).toEqual(["OBOtto Brandt", "JNJun Nakamura"]);
  });

  it("an Add form with changes asks first: Cancel keeps it, Discard drops it", async () => {
    const user = await openWorld();
    await user.click(main().getAllByRole("button", { name: "Add person" })[0]);
    await user.type(main().getByLabelText("Name"), "Ada");

    await user.click(screen.getByRole("button", { name: "Notes" }));
    await user.click(discard().getByRole("button", { name: "Cancel" }));
    expect(
      screen.queryByRole("alertdialog", { name: "Discard changes?" }),
    ).not.toBeInTheDocument();
    expect(main().getByLabelText("Name")).toHaveValue("Ada");

    await user.click(screen.getByRole("button", { name: "Settings" }));
    await user.click(discard().getByRole("button", { name: "Discard" }));
    await waitFor(() =>
      expect(main().queryByLabelText("Name")).not.toBeInTheDocument(),
    );
    await user.click(screen.getByRole("button", { name: "World" }));
    await main().findByRole("heading", { name: "People of interest" });
    expect(main().queryByLabelText("Name")).not.toBeInTheDocument();
    expect(api.createPerson).not.toHaveBeenCalled();
  });

  it("an Edit form with changes asks first: Cancel keeps it, Discard drops it", async () => {
    store.characters = [otto()];
    const user = await openWorld();
    await user.click(card("Otto Brandt"));
    await user.click(main().getByRole("button", { name: "Edit" }));
    await user.type(main().getByLabelText("Description"), " And more.");

    await user.click(
      railPanel().getByRole("button", { name: "People of interest" }),
    );
    await user.click(discard().getByRole("button", { name: "Cancel" }));
    expect(main().getByLabelText("Description")).toHaveValue(
      "Owns three mills in the Ruhr. And more.",
    );

    await user.click(screen.getByRole("button", { name: "Notes" }));
    await user.click(discard().getByRole("button", { name: "Discard" }));
    await user.click(screen.getByRole("button", { name: "World" }));
    await main().findByRole("heading", { name: /^Otto Brandt/ });
    expect(
      main().getByText("Owns three mills in the Ruhr."),
    ).toBeInTheDocument();
    expect(
      main().queryByRole("textbox", { name: "Description" }),
    ).not.toBeInTheDocument();
    expect(api.updatePerson).not.toHaveBeenCalled();
  });

  it("a form without changes leaves without asking", async () => {
    store.characters = [otto()];
    const user = await openWorld();
    await user.click(main().getAllByRole("button", { name: "Add person" })[0]);
    await user.click(screen.getByRole("button", { name: "Notes" }));
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "World" }));
    await main().findByRole("heading", { name: "People of interest" });

    await user.click(card("Otto Brandt"));
    await user.click(main().getByRole("button", { name: "Edit" }));
    await user.click(screen.getByRole("button", { name: "Settings" }));
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(main().queryByLabelText("Name")).not.toBeInTheDocument();
  });
});

describe("A save that fails in part", () => {
  it("a failed photo keeps the Add form as an Edit of the saved person", async () => {
    const user = await openWorld();
    store.pick = "/pics/ada.png";
    api.setPhoto.mockRejectedValueOnce("The photo can't be read.");
    await user.click(main().getAllByRole("button", { name: "Add person" })[0]);
    await user.type(main().getByLabelText("Name"), "Ada");
    await user.click(main().getByRole("button", { name: "Add photo" }));
    await user.click(main().getByRole("button", { name: "Save" }));

    expect(await findAlert()).toHaveTextContent(
      "Ada is saved, but not the photo (The photo can't be read.).",
    );
    expect(main().getByText("Editing")).toBeInTheDocument();
    expect(main().getByLabelText("Name")).toHaveValue("Ada");
    expect(main().getByText("New photo: ada.png")).toBeInTheDocument();
    expect(store.characters.map((c) => c.name)).toEqual(["Ada"]);

    await user.click(main().getByRole("button", { name: "Save" }));
    await main().findByRole("heading", { name: /^Ada/ });
    expect(api.createPerson).toHaveBeenCalledTimes(1);
    expect(api.updatePerson).toHaveBeenCalledWith(
      "person-1",
      expect.objectContaining({ name: "Ada" }),
    );
    expect(api.setPhoto).toHaveBeenLastCalledWith("person-1", "/pics/ada.png");
    expect(store.characters).toHaveLength(1);
    expect(store.characters[0].photo).toBe("person-1.png");
  });

  it("failed stat names keep the Add form, as an Edit, with the new names", async () => {
    const user = await openWorld();
    api.setStatNames.mockRejectedValueOnce("Disk full.");
    await user.click(main().getAllByRole("button", { name: "Add person" })[0]);
    await user.type(main().getByLabelText("Name"), "Ada");
    const left = main().getByLabelText("Stat 1 left name");
    await user.clear(left);
    await user.type(left, "Order");
    await user.click(main().getByRole("button", { name: "Save" }));

    expect(await findAlert()).toHaveTextContent(
      "Ada is saved, but not the stat names (Disk full.).",
    );
    expect(main().getByText("Editing")).toBeInTheDocument();
    expect(main().getByLabelText("Stat 1 left name")).toHaveValue("Order");
    expect(store.world.statNames[0].left).toBe("[Stat 1A]");

    await user.click(main().getByRole("button", { name: "Save" }));
    await main().findByRole("heading", { name: /^Ada/ });
    expect(api.createPerson).toHaveBeenCalledTimes(1);
    expect(store.characters).toHaveLength(1);
    expect(store.world.statNames[0].left).toBe("Order");
  });

  it("failed stat names keep the Edit form with its changes, but not the saved photo", async () => {
    store.characters = [otto()];
    const user = await openWorld();
    api.setStatNames.mockRejectedValueOnce("Disk full.");
    store.pick = "/pics/otto.png";
    await user.click(card("Otto Brandt"));
    await user.click(main().getByRole("button", { name: "Edit" }));
    await user.click(main().getByRole("button", { name: "Add photo" }));
    await user.type(main().getByLabelText("Description"), " And more.");
    const left = main().getByLabelText("Stat 1 left name");
    await user.clear(left);
    await user.type(left, "Order");
    await user.click(main().getByRole("button", { name: "Save" }));

    expect(await findAlert()).toHaveTextContent(
      "Otto Brandt is saved, but not the stat names (Disk full.).",
    );
    expect(main().getByLabelText("Stat 1 left name")).toHaveValue("Order");
    expect(store.characters[0].description).toBe(
      "Owns three mills in the Ruhr. And more.",
    );
    expect(store.characters[0].photo).toBe("otto-brandt.png");
    expect(main().queryByText(/^New photo/)).not.toBeInTheDocument();

    await user.click(main().getByRole("button", { name: "Save" }));
    await main().findByRole("heading", { name: /^Otto Brandt/ });
    expect(store.world.statNames[0].left).toBe("Order");
    expect(api.setPhoto).toHaveBeenCalledTimes(1);
  });
});

describe("Table rows and the Add portrait", () => {
  it("a click on the birthplace or the age opens the sheet", async () => {
    store.characters = [otto(), rosa()];
    const user = await openWorld();
    await user.click(main().getByRole("button", { name: "Table" }));

    await user.click(main().getByRole("cell", { name: "Dortmund, Germany" }));
    await main().findByRole("heading", { name: /^Otto Brandt/ });

    await user.click(
      main().getByRole("button", { name: "People of interest" }),
    );
    await user.click(main().getByRole("cell", { name: "31" }));
    await main().findByRole("heading", { name: /^Rosa Alvarez/ });
  });

  it("the Add portrait shows the initials once there is a name", async () => {
    const user = await openWorld();
    await user.click(main().getAllByRole("button", { name: "Add person" })[0]);
    const portrait = () =>
      screen.getByRole("main").querySelector(`.${styles.portrait}`);

    expect(portrait()?.querySelector("svg")).not.toBeNull();
    expect(portrait()).toHaveTextContent("");
    await user.type(main().getByLabelText("Name"), "Rosa Alvarez");
    expect(portrait()).toHaveTextContent("RA");
    expect(portrait()?.querySelector("svg")).toBeNull();
    await user.clear(main().getByLabelText("Name"));
    expect(portrait()?.querySelector("svg")).not.toBeNull();
  });
});

describe("Leaving while something is saved", () => {
  // A promise the test settles.
  function deferred<T>() {
    let resolve!: (value: T) => void;
    let reject!: (error: unknown) => void;
    const promise = new Promise<T>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject };
  }

  it("a pending person save locks the form until it ends", async () => {
    store.characters = [otto()];
    const user = await openWorld();
    const update = deferred<void>();
    const real = api.updatePerson.getMockImplementation();
    api.updatePerson.mockImplementationOnce(async (...args) => {
      await update.promise;
      // biome-ignore lint/style/noNonNullAssertion: set by the fake
      return real!(...args);
    });
    await user.click(card("Otto Brandt"));
    await user.click(main().getByRole("button", { name: "Edit" }));
    await user.type(main().getByLabelText("Description"), " And more.");
    await user.click(main().getByRole("button", { name: "Save" }));

    expect(main().getByLabelText("Description")).toBeDisabled();
    expect(main().getByLabelText("Name")).toBeDisabled();
    expect(main().getByLabelText("Stat 1 value")).toBeDisabled();
    expect(main().getByRole("button", { name: "Save" })).toBeDisabled();
    expect(main().getByRole("button", { name: "Cancel" })).toBeDisabled();
    expect(main().getByRole("button", { name: "Add photo" })).toBeDisabled();

    update.resolve();
    await main().findByRole("heading", { name: /^Otto Brandt/ });
    expect(
      main().getByText("Owns three mills in the Ruhr. And more."),
    ).toBeInTheDocument();
  });

  it("leaving during a pending save asks first, and its end doesn't change the tab", async () => {
    const user = await openWorld();
    const create = deferred<void>();
    const real = api.createPerson.getMockImplementation();
    api.createPerson.mockImplementationOnce(async (...args) => {
      await create.promise;
      // biome-ignore lint/style/noNonNullAssertion: set by the fake
      return real!(...args);
    });
    await user.click(main().getAllByRole("button", { name: "Add person" })[0]);
    await user.type(main().getByLabelText("Name"), "Ada");
    await user.click(main().getByRole("button", { name: "Save" }));

    await user.click(screen.getByRole("button", { name: "Notes" }));
    const dialog = within(
      screen.getByRole("alertdialog", { name: "Discard changes?" }),
    );
    await user.click(dialog.getByRole("button", { name: "Discard" }));
    await waitFor(() =>
      expect(screen.queryByRole("main")?.textContent).not.toMatch(/New person/),
    );

    create.resolve();
    await waitFor(() => expect(store.characters).toHaveLength(1));
    expect(
      screen.getByRole("button", { name: "Notes", pressed: true }),
    ).toBeInTheDocument();
    expect(screen.queryByText("People of interest")).not.toBeInTheDocument();
  });

  it("a pending save of an unchanged Edit still asks before leaving", async () => {
    store.characters = [otto()];
    const user = await openWorld();
    const update = deferred<void>();
    api.updatePerson.mockImplementationOnce(() => update.promise as never);
    await user.click(card("Otto Brandt"));
    await user.click(main().getByRole("button", { name: "Edit" }));
    await user.click(main().getByRole("button", { name: "Save" }));

    await user.click(screen.getByRole("button", { name: "Notes" }));
    const dialog = within(
      screen.getByRole("alertdialog", { name: "Discard changes?" }),
    );
    await user.click(dialog.getByRole("button", { name: "Cancel" }));
    expect(main().getByLabelText("Name")).toBeDisabled();
  });

  it("a save that ends after its form was left doesn't replace a new form", async () => {
    const user = await openWorld();
    const create = deferred<void>();
    const real = api.createPerson.getMockImplementation();
    api.createPerson.mockImplementationOnce(async (...args) => {
      await create.promise;
      // biome-ignore lint/style/noNonNullAssertion: set by the fake
      return real!(...args);
    });
    await user.click(main().getAllByRole("button", { name: "Add person" })[0]);
    await user.type(main().getByLabelText("Name"), "Ada");
    await user.click(main().getByRole("button", { name: "Save" }));
    await user.click(screen.getByRole("button", { name: "Notes" }));
    await user.click(
      within(
        screen.getByRole("alertdialog", { name: "Discard changes?" }),
      ).getByRole("button", { name: "Discard" }),
    );

    await user.click(screen.getByRole("button", { name: "World" }));
    await user.click(
      (await main().findAllByRole("button", { name: "Add person" }))[0],
    );
    await user.type(main().getByLabelText("Name"), "Bea");
    // The old save ends with a reload.
    const loads = api.listPeople.mock.calls.length;
    create.resolve();
    await waitFor(() =>
      expect(api.listPeople.mock.calls.length).toBeGreaterThan(loads),
    );
    expect(store.characters).toHaveLength(1);

    expect(main().getByText("New person")).toBeInTheDocument();
    expect(main().getByLabelText("Name")).toHaveValue("Bea");
    expect(main().getByLabelText("Name")).toBeEnabled();
  });

  it("a delete that ends after you opened someone else leaves their sheet open", async () => {
    store.characters = [otto(), rosa()];
    const user = await openWorld();
    const remove = deferred<void>();
    const real = api.deletePerson.getMockImplementation();
    api.deletePerson.mockImplementationOnce(async (...args) => {
      await remove.promise;
      // biome-ignore lint/style/noNonNullAssertion: set by the fake
      return real!(...args);
    });
    await user.click(card("Otto Brandt"));
    await user.click(
      main().getByRole("button", { name: "Delete Otto Brandt" }),
    );
    await user.click(
      within(screen.getByRole("alertdialog")).getByRole("button", {
        name: "Delete",
      }),
    );
    await user.click(
      main().getByRole("button", { name: "People of interest" }),
    );
    await user.click(card("Rosa Alvarez"));

    const loads = api.listPeople.mock.calls.length;
    remove.resolve();
    await waitFor(() =>
      expect(api.listPeople.mock.calls.length).toBeGreaterThan(loads),
    );
    expect(store.characters).toHaveLength(1);
    expect(
      main().getByRole("heading", { name: /^Rosa Alvarez/ }),
    ).toBeInTheDocument();
  });

  it("the game date box is locked while its save is pending", async () => {
    const user = await openWorld();
    const first = deferred<never>();
    api.setGameDate.mockImplementationOnce(() => first.promise);
    await user.click(railPanel().getByRole("button", { name: /Game date/ }));
    const box = railPanel().getByLabelText("Game date");
    await user.clear(box);
    await user.type(box, "3 August 1961{Enter}");

    expect(box).toBeDisabled();
    first.reject("Disk full.");
    await waitFor(() => expect(box).toBeEnabled());
    expect(box).toHaveAccessibleDescription("Disk full.");
    expect(box).toHaveFocus();
    expect(box).toHaveValue("3 August 1961");

    await user.clear(box);
    await user.type(box, "4 August 1961{Enter}");
    expect(
      await railPanel().findByRole("button", {
        name: "Game date · 4 August 1961",
      }),
    ).toBeInTheDocument();
  });

  it("an invalid game date left by a tab switch is dropped, with a toast", async () => {
    const user = await openWorld();
    await user.click(railPanel().getByRole("button", { name: /Game date/ }));
    const box = railPanel().getByLabelText("Game date");
    await user.clear(box);
    await user.type(box, "31 Feb 1962");
    await user.click(screen.getByRole("button", { name: "Notes" }));

    expect(await findAlert()).toHaveTextContent(
      "The game date was not changed: Not a real date.",
    );
    expect(api.setGameDate).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "World" }));
    expect(
      await railPanel().findByRole("button", {
        name: "Game date · 10 February 1962",
      }),
    ).toBeInTheDocument();
  });

  it("a game date save that fails after a tab switch shows a toast", async () => {
    const user = await openWorld();
    const save = deferred<never>();
    api.setGameDate.mockImplementationOnce(() => save.promise);
    await user.click(railPanel().getByRole("button", { name: /Game date/ }));
    const box = railPanel().getByLabelText("Game date");
    await user.clear(box);
    await user.type(box, "3 August 1961");
    await user.click(screen.getByRole("button", { name: "Notes" }));
    expect(api.setGameDate).toHaveBeenCalledWith("1961-08-03");

    save.reject("Disk full.");
    await waitFor(() =>
      expect(alert()).toHaveTextContent(
        "The game date was not changed: Disk full.",
      ),
    );
  });
});
