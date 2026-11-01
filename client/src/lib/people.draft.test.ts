import { describe, expect, it } from "vitest";
import { characterDraftToFields, characterToDraft } from "@/lib/people";
import type { Character } from "@/lib/peopleApi";

const GAME = "1962-02-10";
const person: Character = {
  id: "rosa",
  photo: "rosa.png",
  name: "Rosa",
  birthDate: "1930-06-14",
  birthCity: "Havana",
  birthCountry: "Cuba",
  deathDate: "1961-08-03",
  deathCity: "London",
  deathCountry: "UK",
  stats: [0, 100, null, 45, null, 7, 50],
  description: "  A printer.\nKnows everyone.  ",
};

describe("character draft adapter", () => {
  it.each(["0001", "0849", "0999"])(
    "round-trips stored dates in year %s",
    (year) => {
      const fields = {
        ...person,
        birthDate: `${year}-01-01`,
        deathDate: `${year}-12-31`,
      };
      const draft = characterToDraft(fields);
      expect(draft.birthDate).toBe(`1 January ${year}`);
      expect(draft.deathDate).toBe(`31 December ${year}`);
      expect(characterDraftToFields(draft, GAME)).toMatchObject({
        fields: { birthDate: `${year}-01-01`, deathDate: `${year}-12-31` },
      });
    },
  );

  it("creates independent blank drafts with seven empty stats", () => {
    const draft = characterToDraft();
    expect(draft).toEqual({
      name: "",
      birthDate: "",
      birthCity: "",
      birthCountry: "",
      deathDate: "",
      deathCity: "",
      deathCountry: "",
      stats: ["", "", "", "", "", "", ""],
      description: "",
    });
    draft.stats[0] = "50";
    expect(characterToDraft().stats[0]).toBe("");
    expect(
      characterDraftToFields({ ...characterToDraft(), name: "Ada" }, GAME),
    ).toEqual({
      fields: {
        name: "Ada",
        birthDate: null,
        birthCity: "",
        birthCountry: "",
        deathDate: null,
        deathCity: "",
        deathCountry: "",
        stats: [null, null, null, null, null, null, null],
        description: "",
      },
    });
  });

  it("uses display dates and round-trips fields without identity or photo", () => {
    const draft = characterToDraft(person);
    expect(draft.birthDate).toBe("14 June 1930");
    expect(draft.deathDate).toBe("3 August 1961");
    expect(draft.stats).toEqual(["0", "100", "", "45", "", "7", "50"]);
    expect(draft).not.toHaveProperty("id");
    expect(draft).not.toHaveProperty("photo");
    const { id: _id, photo: _photo, ...fields } = person;
    expect(characterDraftToFields(draft, GAME)).toEqual({ fields });
    draft.stats[0] = "20";
    expect(person.stats[0]).toBe(0);
  });

  it("normalizes names, places, dates and stats while preserving description", () => {
    expect(
      characterDraftToFields(
        {
          ...characterToDraft(person),
          name: "  Rosa  ",
          birthDate: " June 14, 1930 ",
          birthCity: " Havana ",
          birthCountry: " Cuba ",
          deathDate: "  ",
          deathCity: " London ",
          deathCountry: " UK ",
          stats: [" 0 ", "100", " ", "045", "", "7", "50"],
        },
        GAME,
      ),
    ).toEqual({
      fields: {
        name: "Rosa",
        birthDate: "1930-06-14",
        birthCity: "Havana",
        birthCountry: "Cuba",
        deathDate: null,
        deathCity: "London",
        deathCountry: "UK",
        stats: [0, 100, null, 45, null, 7, 50],
        description: "  A printer.\nKnows everyone.  ",
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
        stats: ["-1", "101", "4.5", "1e2", "no", "", "50"],
      },
      GAME,
    );
    expect(result).toEqual({
      errors: {
        name: "Enter a name.",
        birthDate: "Not a real date.",
        deathDate: "Death date is after the game date.",
        stats: [
          "Use a whole number from 0 to 100.",
          "Use a whole number from 0 to 100.",
          "Use a whole number from 0 to 100.",
          "Use a whole number from 0 to 100.",
          "Use a whole number from 0 to 100.",
          undefined,
          undefined,
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
