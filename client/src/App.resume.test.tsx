import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "@/App";
import styles from "@/components/menus/PeopleMenu/PeopleMenu.module.css";
import type { Job } from "@/lib/peopleApi";
import { api, character, resetPeople, store } from "@/test/fakePeople";

// Resumes, places with a state, the occupation line and section editing.

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

const job = (fields: Partial<Job> & Pick<Job, "id" | "job">): Job => ({
  employer: "",
  startDate: "1950",
  endDate: null,
  description: "",
  ...fields,
});

// The game date is 10 February 1962.
const otto = () =>
  character("Otto Brandt", {
    birthDate: "1904-01-21",
    birthCity: "Dortmund",
    birthState: "North Rhine-Westphalia",
    birthCountry: "Germany",
    resume: [
      job({
        id: "foreman",
        job: "Foreman",
        employer: "Krupp",
        startDate: "1924-03",
        endDate: "1931",
      }),
      job({
        id: "publisher",
        job: "Publisher",
        employer: "Rheinische Post",
        startDate: "1955",
        description: "Bought the paper.",
      }),
      job({
        id: "mill",
        job: "Mill owner",
        employer: "Brandt Stahl",
        startDate: "1931",
      }),
    ],
  });
const rosa = () =>
  character("Rosa Alvarez", {
    birthDate: "1930-06-14",
    resume: [
      job({
        id: "reporter",
        job: "Reporter",
        employer: "La Vanguardia",
        startDate: "1950",
      }),
    ],
  });
const jun = () =>
  character("Jun Nakamura", {
    birthDate: "1925-11-09",
    deathDate: "1961-08-03",
    resume: [
      job({
        id: "journalist",
        job: "Journalist",
        employer: "Asahi Shimbun",
        startDate: "1948-04",
      }),
    ],
  });
const ada = () => character("Ada");

beforeEach(() => {
  vi.clearAllMocks();
  resetPeople();
  URL.createObjectURL = vi.fn(() => "blob:photo");
  URL.revokeObjectURL = vi.fn();
});

const main = () => within(screen.getByRole("main"));
const railPanel = () =>
  within(screen.getByRole("region", { name: "World rail panel" }));
const card = (name: string) =>
  main().getByRole("button", { name: new RegExp(`^${name}`) });
const discard = () =>
  within(screen.getByRole("alertdialog", { name: "Discard changes?" }));

async function openWorld() {
  render(<App />);
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "World" }));
  await user.click(
    railPanel().getByRole("button", { name: "People of interest" }),
  );
  await main().findByRole("heading", { name: "People of interest" });
  return user;
}

async function openSheet(name: string) {
  const user = await openWorld();
  await user.click(card(name));
  await main().findByRole("heading", { name: new RegExp(`^${name}`) });
  return user;
}

// The lines under the name on the sheet, in order.
const sheetLines = () =>
  [
    ...(main()
      .getByRole("heading", { level: 1 })
      .closest(`.${styles.sheetHead}`)
      ?.querySelectorAll("p") ?? []),
  ].map((p) => p.textContent);

const row = (name: string) => main().getByRole("group", { name });

describe("Places", () => {
  it("the sheet and card show City, State, Country", async () => {
    store.characters = [otto()];
    const user = await openWorld();
    expect(card("Otto Brandt")).toHaveTextContent(
      "Dortmund, North Rhine-Westphalia, Germany",
    );
    await user.click(card("Otto Brandt"));
    expect(sheetLines()).toContain("Dortmund, North Rhine-Westphalia, Germany");
  });

  it("the form puts each state box between its city and country boxes", async () => {
    const user = await openWorld();
    await user.click(main().getAllByRole("button", { name: "Add person" })[0]);
    const labels = main()
      .getAllByRole("textbox")
      .map((box) => (box as HTMLInputElement).labels?.[0]?.textContent ?? "");
    const at = (label: string) => labels.indexOf(label);
    expect(at("Birthplace city")).toBe(at("Birthplace State / Province") - 1);
    expect(at("Birthplace country")).toBe(
      at("Birthplace State / Province") + 1,
    );
    expect(at("Death city (optional)")).toBe(
      at("Death State / Province (optional)") - 1,
    );
    expect(at("Death country (optional)")).toBe(
      at("Death State / Province (optional)") + 1,
    );
  });
});

describe("Occupation line", () => {
  it("shows below the name and above the dates on the sheet", async () => {
    store.characters = [otto()];
    await openSheet("Otto Brandt");
    expect(sheetLines()).toEqual([
      "Publisher · Mill owner",
      "January 21, 1904",
      "Dortmund, North Rhine-Westphalia, Germany",
    ]);
    // It wraps: only the card and the table clip it.
    expect(main().getByText("Publisher · Mill owner")).not.toHaveClass(
      styles.clip,
    );
  });

  it("is left out with no current job", async () => {
    store.characters = [
      character("Ada", {
        birthDate: "1900-01-01",
        resume: [
          job({ id: "a", job: "Clerk", startDate: "1920", endDate: "1930" }),
        ],
      }),
    ];
    await openSheet("Ada");
    expect(sheetLines()).toEqual(["January 1, 1900"]);
  });

  it("the card shows it clipped, with the full text as its tooltip", async () => {
    store.characters = [rosa(), ada()];
    await openWorld();
    const line = within(card("Rosa Alvarez")).getByText(
      "Reporter, La Vanguardia",
    );
    expect(line).toHaveClass(styles.clip);
    expect(line).toHaveAttribute("title", "Reporter, La Vanguardia");
    expect(card("Rosa Alvarez")).toHaveTextContent(
      /^RARosa AlvarezReporter, La VanguardiaJun 14, 1930/,
    );
    expect(card("Ada")).toHaveTextContent(/^AAda$/);
  });

  it("the Notes button shows it in place of “Your character”", async () => {
    store.characters = [rosa()];
    store.meId = "rosa-alvarez";
    render(<App />);
    const notes = within(
      screen.getByRole("region", { name: "Notes rail panel" }),
    );
    const button = await notes.findByRole("button", {
      name: /^Rosa Alvarez ?Reporter, La Vanguardia$/,
    });
    expect(within(button).getByText("Reporter, La Vanguardia")).toHaveAttribute(
      "title",
      "Reporter, La Vanguardia",
    );
    expect(within(button).queryByText("Your character")).toBeNull();
  });

  it("a clipped name has the full name as its tooltip", async () => {
    store.characters = [rosa()];
    store.meId = "rosa-alvarez";
    const user = await openWorld();
    expect(
      within(card("Rosa Alvarez")).getByText("Rosa Alvarez"),
    ).toHaveAttribute("title", "Rosa Alvarez");
    await user.click(main().getByRole("button", { name: "Table" }));
    expect(
      within(main().getByRole("table")).getByText("Rosa Alvarez"),
    ).toHaveAttribute("title", "Rosa Alvarez");
    await user.click(screen.getByRole("button", { name: "Notes" }));
    const notes = within(
      screen.getByRole("region", { name: "Notes rail panel" }),
    );
    const button = await notes.findByRole("button", { name: /^Rosa Alvarez/ });
    expect(within(button).getByText("Rosa Alvarez")).toHaveAttribute(
      "title",
      "Rosa Alvarez",
    );
  });

  it("the Notes button shows the name only with no current job", async () => {
    store.characters = [ada()];
    store.meId = "ada";
    render(<App />);
    const notes = within(
      screen.getByRole("region", { name: "Notes rail panel" }),
    );
    const button = await notes.findByRole("button", { name: "Ada" });
    expect(button).toHaveTextContent(/^AAda$/);
  });

  it("the table has it as the second column, sortable with empty last", async () => {
    store.characters = [ada(), rosa(), otto(), jun()];
    const user = await openWorld();
    await user.click(main().getByRole("button", { name: "Table" }));
    const table = within(main().getByRole("table"));
    const column = () =>
      table
        .getAllByRole("row")
        .slice(1)
        .map((r) => within(r).getAllByRole("cell")[1].textContent);

    const cell = table
      .getAllByRole("row")
      .slice(1)
      .map((r) => within(r).getAllByRole("cell")[1])
      .find((c) => c.textContent === "Publisher · Mill owner");
    expect(cell).toHaveAttribute("title", "Publisher · Mill owner");

    await user.click(table.getByRole("button", { name: "Occupation" }));
    expect(
      table.getByRole("columnheader", { name: "Occupation" }),
    ).toHaveAttribute("aria-sort", "ascending");
    expect(column()).toEqual([
      "Journalist, Asahi Shimbun",
      "Publisher · Mill owner",
      "Reporter, La Vanguardia",
      "",
    ]);
    await user.click(table.getByRole("button", { name: "Occupation" }));
    expect(column()).toEqual([
      "Reporter, La Vanguardia",
      "Publisher · Mill owner",
      "Journalist, Asahi Shimbun",
      "",
    ]);
  });
});

describe("Resume on the sheet", () => {
  it("lists the jobs newest first with job, employer, dates and description", async () => {
    store.characters = [otto()];
    await openSheet("Otto Brandt");
    const items = within(
      main().getByRole("list", { name: "Jobs, newest first" }),
    ).getAllByRole("listitem");
    expect(items.map((item) => item.textContent)).toEqual([
      "Publisher · Rheinische Post1955 – presentBought the paper.",
      "Mill owner · Brandt Stahl1931 – present",
      "Foreman · KruppMar 1924 – 1931",
    ]);
    expect(within(items[0]).getByText("Publisher")).toHaveClass(
      styles.jobTitle,
    );
  });

  it("an open job of the dead ends at the death date", async () => {
    store.characters = [jun()];
    await openSheet("Jun Nakamura");
    expect(main().getByText("Apr 1948 – Aug 1961")).toBeInTheDocument();
    expect(sheetLines()[0]).toBe("Journalist, Asahi Shimbun");
  });

  it("an empty resume shows its heading, its pencil and “No jobs.”", async () => {
    store.characters = [ada()];
    await openSheet("Ada");
    expect(main().getByRole("heading", { name: "Resume" })).toBeVisible();
    expect(main().getByRole("button", { name: "Edit resume" })).toBeEnabled();
    expect(main().getByText("No jobs.")).toBeInTheDocument();
  });
});

describe("Section editing", () => {
  it("has a pencil per section and no Edit button", async () => {
    store.characters = [otto()];
    await openSheet("Otto Brandt");
    for (const name of ["Edit details", "Edit description", "Edit resume"]) {
      expect(main().getByRole("button", { name })).toBeEnabled();
    }
    expect(main().queryByRole("button", { name: "Edit" })).toBeNull();
  });

  it("opens one section at a time; the other pencils, star, Back and Delete wait", async () => {
    store.characters = [otto()];
    const user = await openSheet("Otto Brandt");
    await user.click(main().getByRole("button", { name: "Edit description" }));

    expect(main().getByRole("textbox", { name: "Description" })).toBeVisible();
    expect(main().getByRole("button", { name: "Edit details" })).toBeDisabled();
    expect(main().getByRole("button", { name: "Edit resume" })).toBeDisabled();
    expect(
      main().queryByRole("button", { name: "Edit description" }),
    ).toBeNull();
    expect(
      main().getByRole("button", { name: "Delete Otto Brandt" }),
    ).toBeDisabled();
    expect(main().getByRole("button", { name: "This is me" })).toBeDisabled();
    expect(
      main().getByRole("button", { name: "People of interest" }),
    ).toBeDisabled();
    // The rest of the sheet still reads as before.
    expect(main().getByText("Mill owner")).toBeInTheDocument();

    await user.click(main().getByRole("button", { name: "Cancel" }));
    expect(main().queryByRole("textbox", { name: "Description" })).toBeNull();
    expect(main().getByRole("button", { name: "Edit details" })).toBeEnabled();
    expect(main().getByRole("button", { name: "This is me" })).toBeEnabled();
  });

  it("an open section disables the star of your character too", async () => {
    store.characters = [rosa()];
    store.meId = "rosa-alvarez";
    const user = await openSheet("Rosa Alvarez");
    await user.click(main().getByRole("button", { name: "Edit resume" }));
    expect(
      main().getByRole("button", { name: "Not my character" }),
    ).toBeDisabled();
  });

  it("the top section shows its errors and does not save", async () => {
    store.characters = [otto()];
    const user = await openSheet("Otto Brandt");
    await user.click(main().getByRole("button", { name: "Edit details" }));
    await user.clear(main().getByLabelText("Birth date"));
    // After the start of the Foreman job in March 1924.
    await user.type(main().getByLabelText("Birth date"), "21 January 1925");
    await user.click(main().getByRole("button", { name: "Save" }));

    expect(main().getByLabelText("Birth date")).toHaveAccessibleDescription(
      "Birth date is after the start of a job (Foreman, March 1924).",
    );
    expect(api.updatePerson).not.toHaveBeenCalled();
  });

  it("the top section saves the state with every other field", async () => {
    store.characters = [otto()];
    const user = await openSheet("Otto Brandt");
    await user.click(main().getByRole("button", { name: "Edit details" }));
    await user.clear(main().getByLabelText("Birthplace State / Province"));
    await user.type(
      main().getByLabelText("Birthplace State / Province"),
      "Westphalia",
    );
    await user.click(main().getByRole("button", { name: "Save" }));

    await waitFor(() => expect(sheetLines()).toHaveLength(3));
    expect(api.updatePerson).toHaveBeenCalledWith("otto-brandt", {
      ...otto(),
      id: undefined,
      photo: undefined,
      birthState: "Westphalia",
      // Saved in the sheet's order, newest start first.
      resume: [1, 2, 0].map((i) => otto().resume[i]),
    });
    expect(sheetLines()[2]).toBe("Dortmund, Westphalia, Germany");
  });
});

describe("Resume editor", () => {
  it("has one row per job, newest first, with the date boxes filled", async () => {
    store.characters = [otto()];
    const user = await openSheet("Otto Brandt");
    await user.click(main().getByRole("button", { name: "Edit resume" }));

    expect(
      main()
        .getAllByRole("group")
        .map((g) => g.getAttribute("aria-label")),
    ).toEqual(["Job Publisher", "Job Mill owner", "Job Foreman"]);
    const foreman = within(row("Job Foreman"));
    expect(foreman.getByLabelText("Job")).toHaveValue("Foreman");
    expect(foreman.getByLabelText("Employer (optional)")).toHaveValue("Krupp");
    expect(foreman.getByLabelText("Start date")).toHaveValue("March 1924");
    expect(foreman.getByLabelText("End date (optional)")).toHaveValue("1931");
    expect(
      within(row("Job Publisher")).getByLabelText("Description (optional)"),
    ).toHaveValue("Bought the paper.");
  });

  it("Add puts an empty row at the top; Remove drops a row; Save sends the resume", async () => {
    store.characters = [otto()];
    const user = await openSheet("Otto Brandt");
    await user.click(main().getByRole("button", { name: "Edit resume" }));
    await user.click(
      main().getByRole("button", { name: "Remove job Foreman" }),
    );
    await user.click(main().getByRole("button", { name: "Add job" }));

    const fresh = within(main().getAllByRole("group")[0]);
    expect(main().getAllByRole("group")[0]).toHaveAccessibleName("New job");
    expect(fresh.getByLabelText("Job")).toHaveValue("");
    await user.type(fresh.getByLabelText("Job"), "Senator");
    await user.type(fresh.getByLabelText("Start date"), "jan 1960");
    await user.click(main().getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(main().queryByRole("button", { name: "Save" })).toBeNull(),
    );
    expect(api.updatePerson).toHaveBeenCalledWith("otto-brandt", {
      ...otto(),
      id: undefined,
      photo: undefined,
      resume: [
        {
          id: "",
          job: "Senator",
          employer: "",
          startDate: "1960-01",
          endDate: null,
          description: "",
        },
        otto().resume[1],
        otto().resume[2],
      ],
    });
    expect(main().getByText("Jan 1960 – present")).toBeInTheDocument();
    expect(main().queryByText("Foreman")).toBeNull();
  });

  it("a date box that reads is rewritten on blur; other text stays", async () => {
    store.characters = [ada()];
    const user = await openSheet("Ada");
    await user.click(main().getByRole("button", { name: "Edit resume" }));
    await user.click(main().getByRole("button", { name: "Add job" }));
    const start = main().getByLabelText("Start date");
    const end = main().getByLabelText("End date (optional)");

    await user.type(start, "mar. 1950");
    await user.click(end);
    expect(start).toHaveValue("March 1950");

    await user.clear(start);
    await user.type(start, "Jan 3, 1950");
    await user.click(end);
    expect(start).toHaveValue("3 January 1950");

    await user.clear(start);
    await user.type(start, "1950-07-04");
    await user.click(end);
    expect(start).toHaveValue("4 July 1950");

    await user.type(end, "1950s");
    await user.click(start);
    expect(end).toHaveValue("1950s");
  });

  it("shows each row's errors on its fields and does not save", async () => {
    store.characters = [otto()];
    const user = await openSheet("Otto Brandt");
    await user.click(main().getByRole("button", { name: "Edit resume" }));
    await user.click(main().getByRole("button", { name: "Add job" }));
    const foreman = within(row("Job Foreman"));
    await user.clear(foreman.getByLabelText("End date (optional)"));
    await user.type(foreman.getByLabelText("End date (optional)"), "1920");
    await user.click(main().getByRole("button", { name: "Save" }));

    const fresh = within(row("New job"));
    expect(fresh.getByLabelText("Job")).toHaveAccessibleDescription(
      "Enter a job.",
    );
    expect(fresh.getByLabelText("Start date")).toHaveAccessibleDescription(
      "Enter a start date.",
    );
    expect(
      foreman.getByLabelText("End date (optional)"),
    ).toHaveAccessibleDescription("End date is before the start date.");
    expect(
      within(row("Job Publisher")).getByLabelText("Start date"),
    ).not.toHaveAccessibleDescription();
    expect(api.updatePerson).not.toHaveBeenCalled();
  });

  it("an open resume editor with changes asks before leaving", async () => {
    store.characters = [otto()];
    const user = await openSheet("Otto Brandt");
    await user.click(main().getByRole("button", { name: "Edit resume" }));
    await user.click(main().getByRole("button", { name: "Add job" }));

    await user.click(railPanel().getByRole("button", { name: "Settings" }));
    await user.click(discard().getByRole("button", { name: "Cancel" }));
    expect(main().getByRole("group", { name: "New job" })).toBeInTheDocument();

    await user.click(railPanel().getByRole("button", { name: "Settings" }));
    await user.click(discard().getByRole("button", { name: "Discard" }));
    expect(
      await main().findByRole("heading", { name: "Stat labels" }),
    ).toBeInTheDocument();
    expect(api.updatePerson).not.toHaveBeenCalled();
  });
});

describe("Add person", () => {
  it("has the state boxes and resume rows, and saves them", async () => {
    const user = await openWorld();
    await user.click(main().getAllByRole("button", { name: "Add person" })[0]);
    await user.type(main().getByLabelText("Name"), "Ada");
    await user.type(
      main().getByLabelText("Birthplace State / Province"),
      " Rhône ",
    );
    await user.click(main().getByRole("button", { name: "Add job" }));
    await user.type(main().getByLabelText("Job"), "Engineer");
    await user.type(main().getByLabelText("Employer (optional)"), "SNCF");
    await user.type(main().getByLabelText("Start date"), "1950");
    await user.type(main().getByLabelText("End date (optional)"), "1955");
    await user.click(main().getByRole("button", { name: "Save" }));

    expect(
      await main().findByRole("heading", { name: /^Ada/ }),
    ).toBeInTheDocument();
    expect(api.createPerson).toHaveBeenCalledWith(
      expect.objectContaining({
        birthState: "Rhône",
        resume: [
          {
            id: "",
            job: "Engineer",
            employer: "SNCF",
            startDate: "1950",
            endDate: "1955",
            description: "",
          },
        ],
      }),
    );
    expect(main().getByText("1950 – 1955")).toBeInTheDocument();
  });

  it("shows resume row errors and does not save", async () => {
    const user = await openWorld();
    await user.click(main().getAllByRole("button", { name: "Add person" })[0]);
    await user.type(main().getByLabelText("Name"), "Ada");
    await user.click(main().getByRole("button", { name: "Add job" }));
    await user.type(main().getByLabelText("Start date"), "1970");
    await user.type(main().getByLabelText("End date (optional)"), "1969");
    await user.click(main().getByRole("button", { name: "Save" }));

    expect(main().getByLabelText("Job")).toHaveAccessibleDescription(
      "Enter a job.",
    );
    expect(
      main().getByLabelText("End date (optional)"),
    ).toHaveAccessibleDescription("End date is before the start date.");
    expect(api.createPerson).not.toHaveBeenCalled();
  });

  it("saves a job that starts after the game date", async () => {
    const user = await openWorld();
    await user.click(main().getAllByRole("button", { name: "Add person" })[0]);
    await user.type(main().getByLabelText("Name"), "Ada");
    await user.click(main().getByRole("button", { name: "Add job" }));
    await user.type(main().getByLabelText("Job"), "Clerk");
    await user.type(main().getByLabelText("Start date"), "1970");
    await user.click(main().getByRole("button", { name: "Save" }));

    expect(api.createPerson).toHaveBeenCalledWith(
      expect.objectContaining({
        resume: [expect.objectContaining({ job: "Clerk", startDate: "1970" })],
      }),
    );
  });
});

describe("Game date save", () => {
  it("saves a date before a job's start", async () => {
    store.characters = [ada(), otto()];
    render(<App />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Session" }));
    const date = await main().findByLabelText("Game date");
    await user.clear(date);
    await user.type(date, "1 June 1954");
    await user.click(main().getByRole("button", { name: "Save" }));

    expect(date).not.toHaveAccessibleDescription();
    expect(api.updateWorld).toHaveBeenCalledWith(
      expect.objectContaining({ gameDate: "1954-06-01" }),
    );
  });

  it("other save errors stay toasts", async () => {
    api.updateWorld.mockRejectedValueOnce("Disk full.");
    render(<App />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Session" }));
    const date = await main().findByLabelText("Game date");
    await user.click(main().getByRole("button", { name: "Save" }));

    expect(
      await within(
        screen.getByRole("region", { name: "Notifications" }),
      ).findByRole("alert"),
    ).toHaveTextContent("Disk full.");
    expect(date).not.toHaveAccessibleDescription();
  });
});
