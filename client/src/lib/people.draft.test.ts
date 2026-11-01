import { describe, expect, it } from "vitest";
import {
  characterDraftToFields,
  characterToDraft,
  jobToDraft,
} from "@/lib/people";
import type { Character } from "@/lib/peopleApi";

const pairs = <T>(values: T[], right: T) =>
  values.map((left) => ({ left, right }));

const GAME = "1962-02-10";
const person: Character = {
  id: "rosa",
  photo: "rosa.png",
  name: "Rosa",
  birthDate: "1930-06-14",
  birthCity: "Havana",
  birthState: "La Habana",
  birthCountry: "Cuba",
  deathDate: "1961-08-03",
  deathCity: "London",
  deathState: "England",
  deathCountry: "UK",
  stats: pairs([0, 100, null, 45, null, 7, 50, null], null),
  description: "  A printer.\nKnows everyone.  ",
  resume: [
    {
      id: "job-1",
      job: "Printer",
      employer: "La Prensa",
      startDate: "1950",
      endDate: "1955-03",
      description: " Night shift.\n",
    },
    {
      id: "job-2",
      job: "Editor",
      employer: "",
      startDate: "1955-04-01",
      endDate: null,
      description: "",
    },
  ],
};

describe("character draft adapter", () => {
  it.each(["0001", "0849", "0999"])(
    "round-trips stored dates in year %s",
    (year) => {
      const fields = {
        ...person,
        birthDate: `${year}-01-01`,
        deathDate: `${year}-12-31`,
        resume: [],
      };
      const draft = characterToDraft(fields);
      expect(draft.birthDate).toBe(`1 January ${year}`);
      expect(draft.deathDate).toBe(`31 December ${year}`);
      expect(characterDraftToFields(draft, GAME)).toMatchObject({
        fields: { birthDate: `${year}-01-01`, deathDate: `${year}-12-31` },
      });
    },
  );

  it("creates independent blank drafts with eight empty stats", () => {
    const draft = characterToDraft();
    expect(draft).toEqual({
      name: "",
      birthDate: "",
      birthCity: "",
      birthState: "",
      birthCountry: "",
      deathDate: "",
      deathCity: "",
      deathState: "",
      deathCountry: "",
      stats: pairs(["", "", "", "", "", "", "", ""], ""),
      description: "",
      resume: [],
    });
    draft.stats[0].left = "50";
    expect(characterToDraft().stats[0].left).toBe("");
    expect(
      characterDraftToFields({ ...characterToDraft(), name: "Ada" }, GAME),
    ).toEqual({
      fields: {
        name: "Ada",
        birthDate: null,
        birthCity: "",
        birthState: "",
        birthCountry: "",
        deathDate: null,
        deathCity: "",
        deathState: "",
        deathCountry: "",
        stats: pairs([null, null, null, null, null, null, null, null], null),
        description: "",
        resume: [],
      },
    });
  });

  it("uses display dates and round-trips fields without identity or photo", () => {
    const draft = characterToDraft(person);
    expect(draft.birthDate).toBe("14 June 1930");
    expect(draft.deathDate).toBe("3 August 1961");
    expect(draft.stats).toEqual(
      pairs(["0", "100", "", "45", "", "7", "50", ""], ""),
    );
    expect(draft.resume).toEqual([
      {
        id: "job-1",
        job: "Printer",
        employer: "La Prensa",
        startDate: "1950",
        endDate: "March 1955",
        description: " Night shift.\n",
      },
      {
        id: "job-2",
        job: "Editor",
        employer: "",
        startDate: "1 April 1955",
        endDate: "",
        description: "",
      },
    ]);
    expect(draft).not.toHaveProperty("id");
    expect(draft).not.toHaveProperty("photo");
    const { id: _id, photo: _photo, ...fields } = person;
    expect(characterDraftToFields(draft, GAME)).toEqual({ fields });
    draft.stats[0].left = "20";
    expect(person.stats[0].left).toBe(0);
  });

  it("normalizes names, places, dates and stats while preserving description", () => {
    expect(
      characterDraftToFields(
        {
          ...characterToDraft(person),
          name: "  Rosa  ",
          birthDate: " June 14, 1930 ",
          birthCity: " Havana ",
          birthState: " La Habana ",
          birthCountry: " Cuba ",
          deathDate: "  ",
          deathCity: " London ",
          deathState: " England ",
          deathCountry: " UK ",
          stats: pairs([" 0 ", "100", " ", "045", "", "7", "50", " "], ""),
          resume: [
            {
              id: "",
              job: " Printer ",
              employer: " La Prensa ",
              startDate: " Mar 1950 ",
              endDate: " 1955-3 ",
              description: " Night shift.\n",
            },
            {
              id: "job-2",
              job: "Editor",
              employer: "",
              startDate: "April 1, 1955",
              endDate: "  ",
              description: "",
            },
          ],
        },
        GAME,
      ),
    ).toEqual({
      fields: {
        name: "Rosa",
        birthDate: "1930-06-14",
        birthCity: "Havana",
        birthState: "La Habana",
        birthCountry: "Cuba",
        deathDate: null,
        deathCity: "London",
        deathState: "England",
        deathCountry: "UK",
        stats: pairs([0, 100, null, 45, null, 7, 50, null], null),
        description: "  A printer.\nKnows everyone.  ",
        resume: [
          {
            id: "",
            job: "Printer",
            employer: "La Prensa",
            startDate: "1950-03",
            endDate: "1955-03",
            description: " Night shift.\n",
          },
          {
            id: "job-2",
            job: "Editor",
            employer: "",
            startDate: "1955-04-01",
            endDate: null,
            description: "",
          },
        ],
      },
    });
  });

  it("returns all field errors and no saveable fields for invalid drafts", () => {
    const result = characterDraftToFields(
      {
        ...characterToDraft(),
        name: "  ",
        birthDate: "31 April 1904",
        deathDate: "11 February 1962",
        stats: pairs(["-1", "101", "4.5", "1e2", "no", "", "50"], ""),
        resume: [
          { ...jobToDraft(), job: "Clerk", startDate: "1950" },
          { ...jobToDraft(), startDate: "1962-03" },
        ],
      },
      GAME,
    );
    expect(result).toEqual({
      errors: {
        name: "Enter a name.",
        birthDate: "Not a real date.",
        deathDate: "Death date is after the game date.",
        stats: pairs(
          [
            undefined,
            undefined,
            "Use a whole number within the safe integer range.",
            "Use a whole number within the safe integer range.",
            "Use a whole number within the safe integer range.",
            undefined,
            undefined,
          ],
          undefined,
        ),
        resume: [
          { job: undefined, startDate: undefined, endDate: undefined },
          {
            job: "Enter a job.",
            startDate: "Start date is after the game date.",
            endDate: undefined,
          },
        ],
      },
    });
    expect(result).not.toHaveProperty("fields");
  });

  it("refuses death before birth and accepts dates on the boundaries", () => {
    const draft = {
      ...characterToDraft(),
      name: "Ada",
      birthDate: "10 February 1962",
    };
    expect(
      characterDraftToFields({ ...draft, deathDate: "9 February 1962" }, GAME),
    ).toMatchObject({
      errors: { deathDate: "Death date is before the birth date." },
    });
    expect(
      characterDraftToFields({ ...draft, deathDate: "10/2/1962" }, GAME),
    ).toMatchObject({ fields: { birthDate: GAME, deathDate: GAME } });
  });
});
