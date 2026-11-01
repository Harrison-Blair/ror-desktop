import { describe, expect, it } from "vitest";
import {
  ageOf,
  birthplace,
  type CharacterForm,
  canClaim,
  canDelete,
  cardDateLine,
  compareAge,
  formatBoxDate,
  formatLongDate,
  formatShortDate,
  gameDateError,
  hasErrors,
  initials,
  isDead,
  isPlayer,
  parseDate,
  placeLine,
  sheetDateLine,
  validateForm,
} from "@/lib/people";

const GAME = "1962-02-10";

describe("parseDate", () => {
  it.each([
    ["21 January 1904", "1904-01-21"],
    ["21 Jan 1904", "1904-01-21"],
    ["21 jan. 1904", "1904-01-21"],
    ["3 Sept 1961", "1961-09-03"],
    ["January 21, 1904", "1904-01-21"],
    ["Jan 21 1904", "1904-01-21"],
    ["1904-01-21", "1904-01-21"],
    ["21/01/1904", "1904-01-21"],
    ["3/8/1961", "1961-08-03"],
    ["3.8.1961", "1961-08-03"],
    ["3-8-1961", "1961-08-03"],
    ["  29 February 1960 ", "1960-02-29"],
    ["29/02/2000", "2000-02-29"],
  ])("reads %s", (text, date) => {
    expect(parseDate(text)).toEqual({ date });
  });

  it.each([
    "",
    "1904",
    "January 1904",
    "21 Ja 1904",
    "21 Foo 1904",
    "21 January 04",
    "3/8/61",
    "21/01/04",
    "61-08-03",
    "21/01-1904",
    "1904/01/21",
    "next Tuesday",
  ])("refuses the form of %j", (text) => {
    expect(parseDate(text)).toEqual({ error: "Use day, month and year." });
  });

  it.each([
    "31 February 1904",
    "29 February 1900",
    "31/04/1961",
    "0 March 1961",
    "1/13/1961",
    "1961-00-10",
  ])("refuses %s as not real", (text) => {
    expect(parseDate(text)).toEqual({ error: "Not a real date." });
  });
});

describe("date formats", () => {
  it("writes the box, sheet and card forms", () => {
    expect(formatBoxDate("1904-01-21")).toBe("21 January 1904");
    expect(formatLongDate("1904-01-21")).toBe("January 21, 1904");
    expect(formatShortDate("1904-01-21")).toBe("Jan 21, 1904");
    expect(formatBoxDate("1961-09-03")).toBe("3 September 1961");
    expect(formatLongDate("1961-09-03")).toBe("September 3, 1961");
    expect(formatShortDate("1961-09-03")).toBe("Sep 3, 1961");
    expect(formatShortDate("1930-05-01")).toBe("May 1, 1930");
  });
});

describe("ageOf", () => {
  const person = (birthDate: string | null, deathDate: string | null) => ({
    birthDate,
    deathDate,
  });

  it("counts the living to the game date", () => {
    expect(ageOf(person("1930-06-14", null), GAME)).toBe(31);
    expect(ageOf(person("1904-02-10", null), GAME)).toBe(58);
    expect(ageOf(person("1904-02-11", null), GAME)).toBe(57);
  });

  it("counts the dead to the death date", () => {
    expect(ageOf(person("1925-11-09", "1961-08-03"), GAME)).toBe(35);
  });

  it("has no age without a birth date", () => {
    expect(ageOf(person(null, null), GAME)).toBeNull();
    expect(ageOf(person(null, "1961-08-03"), GAME)).toBeNull();
  });

  it("returns a negative age for a birth after the game date", () => {
    expect(ageOf(person("1970-01-01", null), GAME)).toBe(-8);
    expect(ageOf(person("1962-02-11", null), GAME)).toBe(-1);
  });
});

describe("rules", () => {
  const living = { id: "a", deathDate: null };
  const dead = { id: "b", deathDate: "1961-08-03" };

  it("knows the dead", () => {
    expect(isDead(living)).toBe(false);
    expect(isDead(dead)).toBe(true);
  });

  it("deletes everyone except my character", () => {
    expect(canDelete(living, "a")).toBe(false);
    expect(canDelete(living, "z")).toBe(true);
    expect(canDelete(dead, "a")).toBe(true);
    expect(canDelete(living, null)).toBe(true);
  });

  it("claims only living characters that are not mine", () => {
    expect(canClaim(living, null)).toBe(true);
    expect(canClaim(living, "b")).toBe(true);
    expect(canClaim(living, "a")).toBe(false);
    expect(canClaim(dead, null)).toBe(false);
  });

  it("counts only my character as a player", () => {
    expect(isPlayer(living, "a")).toBe(true);
    expect(isPlayer(living, "b")).toBe(false);
    expect(isPlayer(living, null)).toBe(false);
  });
});

describe("date lines", () => {
  it("writes the living", () => {
    const p = { birthDate: "1930-06-14", deathDate: null };
    expect(sheetDateLine(p)).toBe("June 14, 1930");
    expect(cardDateLine(p, GAME)).toBe("Jun 14, 1930 (31)");
  });

  it("writes the dead with a dash and the age at death", () => {
    const p = { birthDate: "1925-11-09", deathDate: "1961-08-03" };
    expect(sheetDateLine(p)).toBe("November 9, 1925 – August 3, 1961");
    expect(cardDateLine(p, GAME)).toBe("Nov 9, 1925 – Aug 3, 1961 (35)");
  });

  it("is empty for the living without a birth date", () => {
    const p = { birthDate: null, deathDate: null };
    expect(sheetDateLine(p)).toBe("");
    expect(cardDateLine(p, GAME)).toBe("");
  });

  it("shows Unknown for the dead without a birth date, and no age", () => {
    const p = { birthDate: null, deathDate: "1961-08-03" };
    expect(sheetDateLine(p)).toBe("Unknown – August 3, 1961");
    expect(cardDateLine(p, GAME)).toBe("Unknown – Aug 3, 1961");
  });
});

describe("compareAge", () => {
  const born = (birthDate: string | null, name: string) => ({
    birthDate,
    deathDate: null,
    name,
  });
  const people = [
    born(null, "no age 1"),
    born("1904-01-21", "58"),
    born("1930-06-14", "31"),
    born(null, "no age 2"),
    born("1918-12-12", "43"),
  ];
  const sorted = (direction: "asc" | "desc") =>
    [...people]
      .sort((a, b) => compareAge(a, b, GAME, direction))
      .map((p) => p.name);

  it("sorts young to old with no age last", () => {
    expect(sorted("asc")).toEqual(["31", "43", "58", "no age 1", "no age 2"]);
  });

  it("sorts old to young with no age still last", () => {
    expect(sorted("desc")).toEqual(["58", "43", "31", "no age 1", "no age 2"]);
  });
});

describe("place lines", () => {
  const p = (
    birthCity: string,
    birthCountry: string,
    deathDate: string | null = null,
    deathCity = "",
    deathCountry = "",
  ) => ({ birthCity, birthCountry, deathDate, deathCity, deathCountry });

  it.each([
    [p("Dortmund", "Germany"), "Dortmund, Germany"],
    [p("", "Germany"), "Germany"],
    [p("Dortmund", ""), "Dortmund"],
    [p("", ""), ""],
    [
      p("Osaka", "Japan", "1961-08-03", "Tokyo", "Japan"),
      "Osaka, Japan – Tokyo, Japan",
    ],
    [p("Osaka", "", "1961-08-03", "", "Japan"), "Osaka – Japan"],
    [p("Osaka", "Japan", "1961-08-03"), "Osaka, Japan"],
    [p("", "", "1961-08-03", "Tokyo", "Japan"), "Tokyo, Japan"],
    [p("", "", "1961-08-03"), ""],
    [p("Osaka", "Japan", null, "Tokyo", "Japan"), "Osaka, Japan"],
    [p(" Osaka ", "  "), "Osaka"],
  ])("writes %j as %j", (person, line) => {
    expect(placeLine(person)).toBe(line);
  });

  it("writes the birthplace for the table", () => {
    expect(birthplace(p("Brno", "Czechoslovakia"))).toBe(
      "Brno, Czechoslovakia",
    );
    expect(birthplace(p("", "Czechoslovakia"))).toBe("Czechoslovakia");
  });
});

describe("validateForm", () => {
  const blank: CharacterForm = {
    name: "Ada",
    birthDate: "",
    deathDate: "",
    stats: ["", "", "", "", "", "", ""],
  };
  const noStatErrors = [
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
  ];

  it("accepts a name alone", () => {
    const errors = validateForm(blank, GAME);
    expect(errors).toEqual({
      name: undefined,
      birthDate: undefined,
      deathDate: undefined,
      stats: noStatErrors,
    });
    expect(hasErrors(errors)).toBe(false);
  });

  it("asks for a name", () => {
    const errors = validateForm({ ...blank, name: "   " }, GAME);
    expect(errors.name).toBe("Enter a name.");
    expect(hasErrors(errors)).toBe(true);
  });

  it("reports date errors on each date", () => {
    const errors = validateForm(
      { ...blank, birthDate: "soon", deathDate: "31 February 1904" },
      GAME,
    );
    expect(errors.birthDate).toBe("Use day, month and year.");
    expect(errors.deathDate).toBe("Not a real date.");
  });

  it("refuses a death before the birth or after the game date", () => {
    expect(
      validateForm(
        { ...blank, birthDate: "14 June 1930", deathDate: "13 June 1930" },
        GAME,
      ).deathDate,
    ).toBe("Death date is before the birth date.");
    expect(
      validateForm({ ...blank, deathDate: "11 February 1962" }, GAME).deathDate,
    ).toBe("Death date is after the game date.");
  });

  it("accepts a death on the birth date or the game date", () => {
    expect(
      validateForm(
        { ...blank, birthDate: "14 June 1930", deathDate: "14/6/1930" },
        GAME,
      ).deathDate,
    ).toBeUndefined();
    expect(
      validateForm({ ...blank, deathDate: "10 February 1962" }, GAME).deathDate,
    ).toBeUndefined();
  });

  it("checks a death after the game date even when the birth date is bad", () => {
    expect(
      validateForm(
        { ...blank, birthDate: "soon", deathDate: "1 March 1962" },
        GAME,
      ),
    ).toMatchObject({
      birthDate: "Use day, month and year.",
      deathDate: "Death date is after the game date.",
    });
  });

  it("accepts whole numbers from 0 to 100 and empty stats", () => {
    const errors = validateForm(
      { ...blank, stats: ["0", "100", " 45 ", "", "7", "99", "50"] },
      GAME,
    );
    expect(errors.stats).toEqual(noStatErrors);
  });

  it("refuses other stat values", () => {
    const errors = validateForm(
      { ...blank, stats: ["101", "-1", "4.5", "abc", "1e2", "", "50"] },
      GAME,
    );
    const bad = "Use a whole number from 0 to 100.";
    expect(errors.stats).toEqual([
      bad,
      bad,
      bad,
      bad,
      bad,
      undefined,
      undefined,
    ]);
    expect(hasErrors(errors)).toBe(true);
  });
});

describe("gameDateError", () => {
  it("asks for a game date", () => {
    expect(gameDateError("")).toBe("Enter a game date.");
    expect(gameDateError("  ")).toBe("Enter a game date.");
  });

  it("reports date errors and accepts real dates", () => {
    expect(gameDateError("someday")).toBe("Use day, month and year.");
    expect(gameDateError("30 February 1962")).toBe("Not a real date.");
    expect(gameDateError("10 February 1962")).toBeUndefined();
  });
});

describe("initials", () => {
  it("takes the first letter of the first two words, in capitals", () => {
    expect(initials("Rosa Alvarez")).toBe("RA");
    expect(initials("  hélène  marchand ")).toBe("HM");
    expect(initials("Jean Paul Sartre")).toBe("JP");
    expect(initials("Ada")).toBe("A");
    expect(initials("")).toBe("");
  });
});
