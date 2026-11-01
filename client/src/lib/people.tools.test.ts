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
  deathState: "RSFSR",
  deathCountry: "USSR",
  stats: [40, null, 0, 100, null, null, null, 75].map((left) => ({
    left,
    right: null,
  })),
  description: "A printer.\nKnows everyone.",
  resume: [
    {
      id: "job-printer",
      job: "Printer",
      employer: "Neues Deutschland",
      startDate: "1946-03",
      endDate: "1950",
      description: "Night shift.\nUnion rep.",
    },
    {
      id: "job-editor",
      job: "Editor",
      employer: "",
      startDate: "1950",
      endDate: null,
      description: "",
    },
  ],
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
    showNote: vi.fn(async () => true),
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
  "id: karl-weber | Karl Weber | November 9, 1925 – August 3, 1961 | Berlin, Germany – Moscow, RSFSR, USSR | age 35 | dead";
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
          'Name: "Karl Weber"',
          "Birth date: 1925-11-09",
          'Birth city: "Berlin"',
          "Birth state: unknown",
          'Birth country: "Germany"',
          "Death date: 1961-08-03",
          'Death city: "Moscow"',
          'Death state: "RSFSR"',
          'Death country: "USSR"',
          "Age: 35",
          'Occupation: "Editor"',
          "Stats (left value / right value):",
          "1. Order 40 / Chaos not set",
          "2. Rehabilitative not set / Punitive not set",
          "3. Progressive 0 / Conservative not set",
          "4. Globalist 100 / Isolationist not set",
          "5. Communist not set / Capitalist not set",
          "6. Regulationist not set / Laissez Faire not set",
          "7. Environmentalist not set / Industrialist not set",
          "8. Revolutionary 75 / Reformist not set",
          "Resume (newest first):",
          '- job id: job-editor | job: "Editor" | employer: none | dates: 1950 – 1961 (stored: start 1950, end open) | description: none',
          '- job id: job-printer | job: "Printer" | employer: "Neues Deutschland" | dates: Mar 1946 – 1950 (stored: start 1946-03, end 1950) | description: "Night shift.\\nUnion rep."',
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
        'Name: "Anon"',
        "Birth date: unknown",
        "Birth city: unknown",
        "Birth state: unknown",
        "Birth country: unknown",
        "Death date: none (alive)",
        "Death city: unknown",
        "Death state: unknown",
        "Death country: unknown",
        "Age: unknown",
        "Occupation: none",
      ].join("\n"),
    );
    expect(sheet).toMatch(
      /Resume \(newest first\):\n\(none\)\nDescription: \(none\)$/,
    );
  });

  it("marks the user's character", async () => {
    expect(
      (await call("people_read", { id: "rosa-alvarez" })).content,
    ).toContain("The user's character: yes");
  });

  it("tells a stored end from an open job that ends at the death date", async () => {
    store.characters[1].resume[0].endDate = "1961";
    const sheet = (await call("people_read", { id: "karl-weber" })).content;
    // Both show 1961 as their end; only the stored part differs.
    expect(sheet).toContain(
      "dates: 1950 – 1961 (stored: start 1950, end open)",
    );
    expect(sheet).toContain(
      "dates: Mar 1946 – 1961 (stored: start 1946-03, end 1961)",
    );
  });

  it("quotes stored texts, so they never read as an empty value", async () => {
    store.characters[2] = character("Anon", {
      birthCity: "unknown",
      description: "(none)",
      resume: [
        {
          id: "job-x",
          job: "none",
          employer: "none",
          startDate: "1950",
          endDate: null,
          description: "none",
        },
      ],
    });
    const sheet = (await call("people_read", { id: "anon" })).content;
    expect(sheet).toContain('Birth city: "unknown"\nBirth state: unknown');
    expect(sheet).toContain('Occupation: "none, none"');
    expect(sheet).toContain(
      '- job id: job-x | job: "none" | employer: "none" | dates: 1950 – present (stored: start 1950, end open) | description: "none"',
    );
    expect(sheet).toMatch(/\nDescription:\n\(none\)$/);
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
        birth_state: " Yorkshire ",
        death_state: "Lancashire",
        death_date: "March 3, 1950",
        stats: [10, null, null, null, null, null, null, 0].map((left) => ({
          left,
          right: -22,
        })),
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
      stats: [10, null, null, null, null, null, null, 0].map((left) => ({
        left,
        right: -22,
      })),
      description: "Quiet.",
      photo: null,
      birthState: "Yorkshire",
      deathState: "Lancashire",
      resume: [],
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
        stats: [101, 4.5, -1, null, null, null, null, 100].map((left) => ({
          left,
          right: null,
        })),
      }),
    ).toEqual(
      error(
        [
          "Not saved. Fix these fields and try again:",
          "name: Enter a name.",
          "birth_date: Use day, month and year.",
          "death_date: Not a real date.",
          "stats item 2 left: Use a whole number within the safe integer range.",
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

  it("refuses stats that are not a list of eight", async () => {
    for (const stats of [
      [1, 2],
      [1, 2, 3, 4, 5, 6, 7],
    ]) {
      expect(await call("people_create", { name: "Ann", stats })).toEqual(
        error(
          "stats must be a list of 8 pairs, each with left and right numbers or null.",
        ),
      );
    }
  });
});

describe("people_edit", () => {
  it("edits only the description while preserving stored early-year dates", async () => {
    const early = character("Historian", {
      birthDate: "0849-01-01",
      deathDate: "0910-12-31",
      description: "Original.",
    });
    store.characters.push(early);
    expect(
      await call("people_edit", { id: early.id, description: "Updated." }),
    ).toEqual(ok(`Edited Historian (${early.id}).`));
    expect(store.characters.at(-1)).toEqual({
      ...early,
      description: "Updated.",
    });
    expect(api.updatePerson).toHaveBeenCalledWith(
      early.id,
      expect.objectContaining({
        birthDate: "0849-01-01",
        deathDate: "0910-12-31",
        description: "Updated.",
      }),
    );
  });

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
        [
          "Not saved. Fix these fields and try again:",
          "birth_date: Birth date is after the start of a job (Printer, March 1946).",
          "death_date: Death date is before the birth date.",
          'job_id "job-printer" start_date: Start date is before the birth date.',
          'job_id "job-editor" start_date: Start date is before the birth date.',
        ].join("\n"),
      ),
    );
    expect(api.updatePerson).not.toHaveBeenCalled();
  });

  it("sets the states like the cities", async () => {
    expect(
      await call("people_edit", {
        id: "karl-weber",
        birth_state: " Brandenburg ",
        death_state: "",
      }),
    ).toEqual(ok("Edited Karl Weber (karl-weber)."));
    expect(store.characters[1]).toEqual({
      ...karl,
      birthState: "Brandenburg",
      deathState: "",
    });
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

const NOT_SAVED = "Not saved. Fix these fields and try again:";

describe("people_add_job", () => {
  it("adds the job at the top, returns its id and refreshes the screens", async () => {
    expect(
      await call("people_add_job", {
        id: "karl-weber",
        job: " Courier ",
        employer: "Stasi",
        start_date: "June 1955",
        end_date: "3 Feb 1958",
        description: "Rides.",
      }),
    ).toEqual(ok("Added the job job-1 to Karl Weber (karl-weber)."));
    expect(store.characters[1].resume).toEqual([
      {
        id: "job-1",
        job: "Courier",
        employer: "Stasi",
        startDate: "1955-06",
        endDate: "1958-02-03",
        description: "Rides.",
      },
      ...karl.resume,
    ]);
    expect(app.peopleChanged).toHaveBeenCalledTimes(1);
  });

  it("needs only the job and the start date; the job is then open", async () => {
    expect(
      await call("people_add_job", {
        id: "anon",
        job: "Clerk",
        start_date: "1950",
      }),
    ).toEqual(ok("Added the job job-1 to Anon (anon)."));
    expect(store.characters[2].resume).toEqual([
      {
        id: "job-1",
        job: "Clerk",
        employer: "",
        startDate: "1950",
        endDate: null,
        description: "",
      },
    ]);
  });

  it("returns the job rules' errors by input name and saves nothing", async () => {
    expect(
      await call("people_add_job", {
        id: "karl-weber",
        job: "Courier",
        start_date: "1920",
        end_date: "Smarch 1930",
      }),
    ).toEqual(
      error(
        [
          NOT_SAVED,
          "birth_date: Birth date is after the start of a job (Courier, 1920).",
          "start_date: Start date is before the birth date.",
          "end_date: Use a year, a month and year, or a full date.",
        ].join("\n"),
      ),
    );
    expect(
      await call("people_add_job", {
        id: "karl-weber",
        job: " ",
        start_date: "1950",
        end_date: "1962",
      }),
    ).toEqual(
      error(
        [
          NOT_SAVED,
          "death_date: Death date is before the end of a job (, 1962).",
          "job: Enter a job.",
          "end_date: End date is after the death date.",
        ].join("\n"),
      ),
    );
    expect(api.updatePerson).not.toHaveBeenCalled();
    expect(app.peopleChanged).not.toHaveBeenCalled();
  });

  it("refuses a missing job or start date", async () => {
    expect(
      await call("people_add_job", { id: "anon", start_date: "1950" }),
    ).toEqual(error("job must be a string."));
    expect(await call("people_add_job", { id: "anon", job: "Clerk" })).toEqual(
      error("start_date must be a string."),
    );
    expect(api.updatePerson).not.toHaveBeenCalled();
  });
});

describe("people_edit_job", () => {
  it("changes only the given fields of the job", async () => {
    expect(
      await call("people_edit_job", {
        id: "karl-weber",
        job_id: "job-printer",
        employer: "Pravda",
        end_date: "",
      }),
    ).toEqual(ok("Edited the job job-printer of Karl Weber (karl-weber)."));
    expect(store.characters[1].resume).toEqual([
      { ...karl.resume[0], employer: "Pravda", endDate: null },
      karl.resume[1],
    ]);
    expect(app.peopleChanged).toHaveBeenCalledTimes(1);
  });

  it("returns the job rules' errors by input name", async () => {
    expect(
      await call("people_edit_job", {
        id: "karl-weber",
        job_id: "job-printer",
        start_date: "1970",
      }),
    ).toEqual(
      error(
        [
          NOT_SAVED,
          "start_date: Start date is after the game date.",
          "end_date: End date is before the start date.",
        ].join("\n"),
      ),
    );
    expect(api.updatePerson).not.toHaveBeenCalled();
  });

  it("refuses an unknown job id", async () => {
    expect(
      await call("people_edit_job", {
        id: "karl-weber",
        job_id: "job-nope",
        job: "X",
      }),
    ).toEqual(
      error(
        'Karl Weber has no job with the id "job-nope". Use people_read to find the job ids.',
      ),
    );
    expect(api.updatePerson).not.toHaveBeenCalled();
  });
});

describe("people_remove_job", () => {
  it("removes the job and keeps the others", async () => {
    expect(
      await call("people_remove_job", {
        id: "karl-weber",
        job_id: "job-printer",
      }),
    ).toEqual(ok("Removed the job job-printer from Karl Weber (karl-weber)."));
    expect(store.characters[1].resume).toEqual([karl.resume[1]]);
    expect(app.peopleChanged).toHaveBeenCalledTimes(1);
  });

  it("refuses an unknown job id", async () => {
    expect(
      await call("people_remove_job", { id: "karl-weber", job_id: "job-nope" }),
    ).toEqual(
      error(
        'Karl Weber has no job with the id "job-nope". Use people_read to find the job ids.',
      ),
    );
    expect(api.updatePerson).not.toHaveBeenCalled();
  });

  it("names the other jobs' errors by their job id", async () => {
    // The game date moved back before the editor job started.
    store.world.gameDate = "1949-06-01";
    expect(
      await call("people_remove_job", {
        id: "karl-weber",
        job_id: "job-printer",
      }),
    ).toEqual(
      error(
        [
          NOT_SAVED,
          "death_date: Death date is after the game date.",
          'job_id "job-editor" start_date: Start date is after the game date.',
        ].join("\n"),
      ),
    );
  });
});

// Each job tool with an input that changes Karl's resume, and a line its
// approval card diff shows.
const JOB_CALLS: [string, Record<string, unknown>, string][] = [
  [
    "people_add_job",
    { id: "karl-weber", job: "Courier", start_date: "1955" },
    '+- job id: (new) | job: "Courier" | employer: none | dates: 1955 – 1961 (stored: start 1955, end open) | description: none',
  ],
  [
    "people_edit_job",
    { id: "karl-weber", job_id: "job-editor", employer: "Pravda" },
    '+- job id: job-editor | job: "Editor" | employer: "Pravda" | dates: 1950 – 1961 (stored: start 1950, end open) | description: none',
  ],
  [
    "people_remove_job",
    { id: "karl-weber", job_id: "job-editor" },
    '-- job id: job-editor | job: "Editor" | employer: none | dates: 1950 – 1961 (stored: start 1950, end open) | description: none',
  ],
];

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
      /^\+Name: "Bo"\n\+Birth date: unknown\n/,
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
        ' Name: "Karl Weber"',
        " Birth date: 1925-11-09",
        '-Birth city: "Berlin"',
        '+Birth city: "Hamburg"',
        " Birth state: unknown",
        ' Birth country: "Germany"',
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

  it.each(JOB_CALLS)(
    "in Manual mode %s asks with a diff of the sheet before it saves",
    async (name, args, line) => {
      const requests: ApprovalRequest[] = [];
      const output = await call(name, args, "manual", async (r) => {
        requests.push(r);
        expect(api.updatePerson).not.toHaveBeenCalled();
        return true;
      });

      expect(output.isError).toBe(false);
      expect(requests).toHaveLength(1);
      expect(requests[0].preview.target).toBe("Karl Weber (karl-weber)");
      expect(requests[0].preview.diff?.split("\n")).toContain(line);
      expect(api.updatePerson).toHaveBeenCalledTimes(1);
    },
  );

  it("shows an open end changed to the death year in the diff", async () => {
    const requests: ApprovalRequest[] = [];
    await call(
      "people_edit_job",
      { id: "karl-weber", job_id: "job-editor", end_date: "1961" },
      "manual",
      async (r) => {
        requests.push(r);
        return false;
      },
    );

    const lines = requests[0].preview.diff?.split("\n") ?? [];
    expect(lines).toContain(
      '-- job id: job-editor | job: "Editor" | employer: none | dates: 1950 – 1961 (stored: start 1950, end open) | description: none',
    );
    expect(lines).toContain(
      '+- job id: job-editor | job: "Editor" | employer: none | dates: 1950 – 1961 (stored: start 1950, end 1961) | description: none',
    );
  });

  it.each(JOB_CALLS)(
    "in Manual mode Reject of %s changes nothing",
    async (name, args) => {
      expect(await call(name, args, "manual", async () => false)).toEqual(
        error(REJECTED),
      );
      expect(api.updatePerson).not.toHaveBeenCalled();
      expect(store.characters[1]).toEqual(karl);
    },
  );

  it.each(JOB_CALLS)(
    "refuses %s when the person changed while the card waited",
    async (name, args) => {
      const output = await call(name, args, "manual", async () => {
        store.characters[1].description = "Changed in the form.";
        return true;
      });

      expect(output).toEqual(
        error(
          "The person changed while waiting for approval. Read them again.",
        ),
      );
      expect(api.updatePerson).not.toHaveBeenCalled();
    },
  );

  it.each(JOB_CALLS)(
    "in Auto mode %s runs without asking",
    async (name, args) => {
      const approve = vi.fn(async () => true);
      expect((await call(name, args, "auto", approve)).isError).toBe(false);
      expect(approve).not.toHaveBeenCalled();
      expect(api.updatePerson).toHaveBeenCalledTimes(1);
    },
  );
});
