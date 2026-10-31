import { beforeEach, describe, expect, it, vi } from "vitest";
import { toolRegistry } from "@/lib/chat/features";
import {
  type ApprovalRequest,
  type PermissionMode,
  REJECTED,
  runToolCall,
} from "@/lib/chat/gate";
import type { AppBridge, ToolContext } from "@/lib/chat/registry";
import { api, character, resetPeople, store } from "@/test/fakePeople";

vi.mock("@/lib/peopleApi", async () =>
  (await import("@/test/fakePeople")).mockModule(),
);

let app: AppBridge;
let context: ToolContext;

const rosa = character("Rosa Alvarez", {
  birthDate: "1930-06-14",
  birthCity: "Havana",
  birthCountry: "Cuba",
});
const karl = character("Karl Weber", {
  birthDate: "1925-11-09",
  birthCity: "Berlin",
  birthCountry: "Germany",
  deathDate: "1961-08-03",
  deathCity: "Moscow",
  deathCountry: "USSR",
  stats: [40, null, 0, 100, null, null, 75],
  description: "A printer.\nKnows everyone.",
});
const anon = character("Anon");

beforeEach(() => {
  vi.clearAllMocks();
  resetPeople();
  store.characters = [structuredClone(rosa), structuredClone(karl), anon];
  store.meId = "rosa-alvarez";
  store.world.statNames[0] = { left: "Order", right: "Chaos" };
  app = {
    notesFolder: () => "/notes",
    openNote: () => null,
    flushOpenNote: vi.fn(async () => true),
    showNote: vi.fn(),
    pathChanged: vi.fn(),
    addRoll: vi.fn(),
    showPerson: vi.fn(async () => true),
    peopleChanged: vi.fn(),
  };
  context = { app, reads: new Map(), notifyOnce: vi.fn() };
});

// Runs a tool call as the chat does, in Auto mode unless `mode` says.
const call = (
  name: string,
  args: Record<string, unknown>,
  mode: PermissionMode = "auto",
  approve: (request: ApprovalRequest) => Promise<boolean> = async () => true,
) =>
  runToolCall(
    toolRegistry,
    { id: "call_1", name, arguments: JSON.stringify(args) },
    { mode, approve, context },
  );

const ok = (content: string) => ({ content, isError: false });
const error = (content: string) => ({ content, isError: true });

const KARL_LINE =
  "id: karl-weber | Karl Weber | November 9, 1925 – August 3, 1961 | Berlin, Germany – Moscow, USSR | age 35 | dead";
const ROSA_LINE =
  "id: rosa-alvarez | Rosa Alvarez | June 14, 1930 | Havana, Cuba | age 31 | the user's character";
const ANON_LINE =
  "id: anon | Anon | dates unknown | places unknown | age unknown";

describe("people_list", () => {
  it("lists everyone by default", async () => {
    expect(await call("people_list", {})).toEqual(
      ok([ROSA_LINE, KARL_LINE, ANON_LINE].join("\n")),
    );
  });

  it("filters players and NPCs", async () => {
    expect(await call("people_list", { filter: "players" })).toEqual(
      ok(ROSA_LINE),
    );
    expect(await call("people_list", { filter: "npcs" })).toEqual(
      ok([KARL_LINE, ANON_LINE].join("\n")),
    );
  });

  it("searches names, ignoring case", async () => {
    expect(await call("people_list", { search: " WEB " })).toEqual(
      ok(KARL_LINE),
    );
    expect(await call("people_list", { search: "zed" })).toEqual(
      ok("No one matches."),
    );
  });

  it("says when there are no people", async () => {
    store.characters = [];
    expect(await call("people_list", {})).toEqual(
      ok("There are no people yet."),
    );
  });

  it("refuses an unknown filter", async () => {
    expect(await call("people_list", { filter: "dead" })).toEqual(
      error('filter must be "all", "players" or "npcs".'),
    );
  });

  it("returns the load error of a damaged file", async () => {
    store.damaged.characters = "characters.json is damaged.";
    expect(await call("people_list", {})).toEqual(
      error("characters.json is damaged."),
    );
  });
});

describe("people_read", () => {
  it("returns the full sheet with the stat names", async () => {
    expect(await call("people_read", { id: "karl-weber" })).toEqual(
      ok(
        [
          "id: karl-weber",
          "The user's character: no",
          "Name: Karl Weber",
          "Birth date: 1925-11-09",
          "Birth city: Berlin",
          "Birth country: Germany",
          "Death date: 1961-08-03",
          "Death city: Moscow",
          "Death country: USSR",
          "Age: 35",
          "Stats (left value / right value):",
          "1. Order 40 / Chaos 60",
          "2. [Stat 2A] / [Stat 2B]: not set",
          "3. [Stat 3A] 0 / [Stat 3B] 100",
          "4. [Stat 4A] 100 / [Stat 4B] 0",
          "5. [Stat 5A] / [Stat 5B]: not set",
          "6. [Stat 6A] / [Stat 6B]: not set",
          "7. [Stat 7A] 75 / [Stat 7B] 25",
          "Description:",
          "A printer.",
          "Knows everyone.",
        ].join("\n"),
      ),
    );
  });

  it("shows the empty fields of a person with only a name", async () => {
    const sheet = (await call("people_read", { id: "anon" })).content;
    expect(sheet).toContain(
      [
        "Name: Anon",
        "Birth date: unknown",
        "Birth city: unknown",
        "Birth country: unknown",
        "Death date: none (alive)",
        "Death city: unknown",
        "Death country: unknown",
        "Age: unknown",
      ].join("\n"),
    );
    expect(sheet).toMatch(/Description:\n\(none\)$/);
  });

  it("marks the user's character", async () => {
    expect(
      (await call("people_read", { id: "rosa-alvarez" })).content,
    ).toContain("The user's character: yes");
  });

  it("refuses an unknown id", async () => {
    expect(await call("people_read", { id: "nobody" })).toEqual(
      error(
        'There is no person with the id "nobody". Use people_list to find the id.',
      ),
    );
  });
});

describe("people_open", () => {
  it("opens the sheet in the app", async () => {
    expect(await call("people_open", { id: "karl-weber" })).toEqual(
      ok("Opened Karl Weber (karl-weber)."),
    );
    expect(app.showPerson).toHaveBeenCalledWith("karl-weber");
  });

  it("fails when the app kept the form open", async () => {
    vi.mocked(app.showPerson).mockResolvedValue(false);
    expect(await call("people_open", { id: "karl-weber" })).toEqual(
      error(
        "Karl Weber's sheet wasn't opened: the user kept unsaved changes in a person form, or the open note couldn't be saved. Tell the user.",
      ),
    );
  });

  it("refuses an unknown id without opening anything", async () => {
    expect((await call("people_open", { id: "nobody" })).isError).toBe(true);
    expect(app.showPerson).not.toHaveBeenCalled();
  });
});

describe("people_create", () => {
  it("creates a person from typed dates and refreshes the screens", async () => {
    expect(
      await call("people_create", {
        name: "  Ann Lee ",
        birth_date: "21 Jan 1904",
        birth_city: " Leeds ",
        death_date: "March 3, 1950",
        stats: [10, null, null, null, null, null, 0],
        description: "Quiet.",
      }),
    ).toEqual(ok("Created Ann Lee (person-1)."));
    expect(store.characters.at(-1)).toEqual({
      id: "person-1",
      name: "Ann Lee",
      birthDate: "1904-01-21",
      birthCity: "Leeds",
      birthCountry: "",
      deathDate: "1950-03-03",
      deathCity: "",
      deathCountry: "",
      stats: [10, null, null, null, null, null, 0],
      description: "Quiet.",
      photo: null,
    });
    expect(app.peopleChanged).toHaveBeenCalledTimes(1);
  });

  it("needs only a name", async () => {
    expect(await call("people_create", { name: "Bo" })).toEqual(
      ok("Created Bo (person-1)."),
    );
    expect(store.characters.at(-1)).toEqual({
      ...character("Bo"),
      id: "person-1",
    });
  });

  it("returns every form error and creates no one", async () => {
    expect(
      await call("people_create", {
        name: " ",
        birth_date: "yesterday",
        death_date: "31 April 1950",
        stats: [101, 4.5, -1, null, null, null, 100],
      }),
    ).toEqual(
      error(
        [
          "Not saved. Fix these fields and try again:",
          "name: Enter a name.",
          "birth_date: Use day, month and year.",
          "death_date: Not a real date.",
          "stats item 1: Use a whole number from 0 to 100.",
          "stats item 2: Use a whole number from 0 to 100.",
          "stats item 3: Use a whole number from 0 to 100.",
        ].join("\n"),
      ),
    );
    expect(api.createPerson).not.toHaveBeenCalled();
    expect(app.peopleChanged).not.toHaveBeenCalled();
  });

  it("refuses a death date before the birth date or after the game date", async () => {
    expect(
      await call("people_create", {
        name: "Ann",
        birth_date: "1904-01-21",
        death_date: "20/01/1904",
      }),
    ).toEqual(
      error(
        "Not saved. Fix these fields and try again:\ndeath_date: Death date is before the birth date.",
      ),
    );
    // The game date is 1962-02-10.
    expect(
      await call("people_create", { name: "Ann", death_date: "11 Feb 1962" }),
    ).toEqual(
      error(
        "Not saved. Fix these fields and try again:\ndeath_date: Death date is after the game date.",
      ),
    );
    expect(api.createPerson).not.toHaveBeenCalled();
  });

  it("refuses stats that are not a list of seven", async () => {
    expect(await call("people_create", { name: "Ann", stats: [1, 2] })).toEqual(
      error("stats must be a list of 7 items, each a number or null."),
    );
  });
});

describe("people_edit", () => {
  it("changes only the given fields", async () => {
    expect(
      await call("people_edit", {
        id: "karl-weber",
        birth_city: "Hamburg",
        death_date: "",
        death_city: "",
        death_country: "",
      }),
    ).toEqual(ok("Edited Karl Weber (karl-weber)."));
    expect(store.characters[1]).toEqual({
      ...karl,
      birthCity: "Hamburg",
      deathDate: null,
      deathCity: "",
      deathCountry: "",
    });
    expect(app.peopleChanged).toHaveBeenCalledTimes(1);
  });

  it("checks the merged person with the form's rules", async () => {
    // Karl died in 1961: a birth date after it is refused.
    expect(
      await call("people_edit", { id: "karl-weber", birth_date: "1 May 1970" }),
    ).toEqual(
      error(
        "Not saved. Fix these fields and try again:\ndeath_date: Death date is before the birth date.",
      ),
    );
    expect(api.updatePerson).not.toHaveBeenCalled();
  });

  it("refuses an unknown id", async () => {
    expect(
      (await call("people_edit", { id: "nobody", name: "X" })).isError,
    ).toBe(true);
    expect(api.updatePerson).not.toHaveBeenCalled();
  });
});

describe("people_delete", () => {
  it("deletes a person and refreshes the screens", async () => {
    expect(await call("people_delete", { id: "karl-weber" })).toEqual(
      ok("Deleted Karl Weber (karl-weber)."),
    );
    expect(store.characters.map((p) => p.id)).toEqual(["rosa-alvarez", "anon"]);
    expect(app.peopleChanged).toHaveBeenCalledTimes(1);
  });

  it("refuses the user's own character", async () => {
    expect(await call("people_delete", { id: "rosa-alvarez" })).toEqual(
      error("Rosa Alvarez is the user's own character and can't be deleted."),
    );
    expect(api.deletePerson).not.toHaveBeenCalled();
  });

  it("refuses the own character before asking in Manual mode", async () => {
    const approve = vi.fn(async () => true);
    const output = await call(
      "people_delete",
      { id: "rosa-alvarez" },
      "manual",
      approve,
    );
    expect(output.isError).toBe(true);
    expect(approve).not.toHaveBeenCalled();
  });
});

describe("the permission gate for the people write tools", () => {
  it("in Manual mode people_create asks with the new sheet", async () => {
    const requests: ApprovalRequest[] = [];
    const output = await call(
      "people_create",
      { name: "Bo" },
      "manual",
      (r) => {
        requests.push(r);
        // Nothing is created before the approval.
        expect(api.createPerson).not.toHaveBeenCalled();
        return Promise.resolve(true);
      },
    );

    expect(output).toEqual(ok("Created Bo (person-1)."));
    expect(requests).toHaveLength(1);
    expect(requests[0].preview.target).toBe("Bo (new person)");
    expect(requests[0].preview.diff).toMatch(
      /^\+Name: Bo\n\+Birth date: unknown\n/,
    );
  });

  it("in Manual mode people_edit asks with a diff of the sheet", async () => {
    const requests: ApprovalRequest[] = [];
    await call(
      "people_edit",
      { id: "karl-weber", birth_city: "Hamburg" },
      "manual",
      async (r) => {
        requests.push(r);
        return true;
      },
    );

    expect(requests[0].preview.target).toBe("Karl Weber (karl-weber)");
    expect(requests[0].preview.diff).toBe(
      [
        " Name: Karl Weber",
        " Birth date: 1925-11-09",
        "-Birth city: Berlin",
        "+Birth city: Hamburg",
        " Birth country: Germany",
        " Death date: 1961-08-03",
        "…",
      ].join("\n"),
    );
    expect(store.characters[1].birthCity).toBe("Hamburg");
  });

  it("in Manual mode people_delete asks with the person", async () => {
    const requests: ApprovalRequest[] = [];
    await call("people_delete", { id: "anon" }, "manual", async (r) => {
      requests.push(r);
      return true;
    });

    expect(requests[0].preview).toEqual({ target: "Anon (anon) → deleted" });
    expect(store.characters.map((p) => p.id)).not.toContain("anon");
  });

  it("in Manual mode Reject changes nothing", async () => {
    const reject = async () => false;
    expect(
      await call("people_create", { name: "Bo" }, "manual", reject),
    ).toEqual(error(REJECTED));
    expect(
      await call("people_edit", { id: "anon", name: "X" }, "manual", reject),
    ).toEqual(error(REJECTED));
    expect(
      await call("people_delete", { id: "anon" }, "manual", reject),
    ).toEqual(error(REJECTED));
    expect(api.createPerson).not.toHaveBeenCalled();
    expect(api.updatePerson).not.toHaveBeenCalled();
    expect(api.deletePerson).not.toHaveBeenCalled();
  });

  it("in Auto mode the write tools run without asking", async () => {
    const approve = vi.fn(async () => true);
    expect(
      await call("people_create", { name: "Bo" }, "auto", approve),
    ).toEqual(ok("Created Bo (person-1)."));
    expect(
      await call("people_edit", { id: "anon", name: "Ann" }, "auto", approve),
    ).toEqual(ok("Edited Ann (anon)."));
    expect(
      await call("people_delete", { id: "anon" }, "auto", approve),
    ).toEqual(ok("Deleted Ann (anon)."));
    expect(approve).not.toHaveBeenCalled();
  });

  it("refuses an edit when the person changed while the card waited", async () => {
    const output = await call(
      "people_edit",
      { id: "karl-weber", birth_city: "Hamburg" },
      "manual",
      async () => {
        store.characters[1].description = "Changed in the form.";
        return true;
      },
    );

    expect(output).toEqual(
      error("The person changed while waiting for approval. Read them again."),
    );
    expect(api.updatePerson).not.toHaveBeenCalled();
  });
});
