import { describe, expect, it } from "vitest";
import {
  ageOf,
  birthplace,
  type CharacterForm,
  canClaim,
  canDelete,
  cardDateLine,
  compareAge,
  compareOccupation,
  currentJobs,
  formatBoxDate,
  formatJobBoxDate,
  formatJobShortDate,
  formatLongDate,
  formatShortDate,
  gameDateError,
  hasErrors,
  initials,
  isDead,
  isPlayer,
  type JobDraft,
  jobToDraft,
  occupationLine,
  parseDate,
  parseJobDate,
  periodEnd,
  periodStart,
  placeLine,
  resumeDateText,
  sheetDateLine,
  sortResume,
  validateForm,
} from "@/lib/people";
import type { Job } from "@/lib/peopleApi";

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
    birthState = "",
    deathState = "",
  ) => ({
    birthCity,
    birthState,
    birthCountry,
    deathDate,
    deathCity,
    deathState,
    deathCountry,
  });

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
    [p("Austin", "USA", null, "", "", "Texas"), "Austin, Texas, USA"],
    [p("", "USA", null, "", "", " Texas "), "Texas, USA"],
    [
      p(
        "Austin",
        "USA",
        "1961-08-03",
        "Paris",
        "France",
        "Texas",
        "Île-de-France",
      ),
      "Austin, Texas, USA – Paris, Île-de-France, France",
    ],
    [p("", "", "1961-08-03", "", "", "", "Bavaria"), "Bavaria"],
    [p("", "", null, "", "", "", "Bavaria"), ""],
  ])("writes %j as %j", (person, line) => {
    expect(placeLine(person)).toBe(line);
  });

  it("writes the birthplace for the table", () => {
    expect(birthplace(p("Brno", "Czechoslovakia"))).toBe(
      "Brno, Czechoslovakia",
    );
    expect(birthplace(p("", "Czechoslovakia"))).toBe("Czechoslovakia");
    expect(
      birthplace(p("Brno", "Czechoslovakia", null, "", "", "Moravia")),
    ).toBe("Brno, Moravia, Czechoslovakia");
  });
});

describe("validateForm", () => {
  const pairs = (values: string[]) =>
    values.map((left) => ({ left, right: "" }));
  const blank: CharacterForm = {
    name: "Ada",
    birthDate: "",
    deathDate: "",
    stats: pairs(["", "", "", "", "", "", "", ""]),
  };
  const noStatErrors = Array.from({ length: 8 }, () => ({
    left: undefined,
    right: undefined,
  }));

  it("accepts a name alone", () => {
    const errors = validateForm(blank);
    expect(errors).toEqual({
      name: undefined,
      birthDate: undefined,
      deathDate: undefined,
      stats: noStatErrors,
      resume: [],
    });
    expect(hasErrors(errors)).toBe(false);
  });

  it("asks for a name", () => {
    const errors = validateForm({ ...blank, name: "   " });
    expect(errors.name).toBe("Enter a name.");
    expect(hasErrors(errors)).toBe(true);
  });

  it("reports date errors on each date", () => {
    const errors = validateForm({
      ...blank,
      birthDate: "soon",
      deathDate: "31 February 1904",
    });
    expect(errors.birthDate).toBe("Use day, month and year.");
    expect(errors.deathDate).toBe("Not a real date.");
  });

  it("refuses a death before the birth", () => {
    expect(
      validateForm({
        ...blank,
        birthDate: "14 June 1930",
        deathDate: "13 June 1930",
      }).deathDate,
    ).toBe("Death date is before the birth date.");
  });

  it("accepts a death after the game date", () => {
    const errors = validateForm({
      ...blank,
      name: "Ada",
      deathDate: "11 February 1962",
    });
    expect(errors.deathDate).toBeUndefined();
    expect(hasErrors(errors)).toBe(false);
  });

  it("accepts a death on the birth date or the game date", () => {
    expect(
      validateForm({
        ...blank,
        birthDate: "14 June 1930",
        deathDate: "14/6/1930",
      }).deathDate,
    ).toBeUndefined();
    expect(
      validateForm({ ...blank, deathDate: "10 February 1962" }).deathDate,
    ).toBeUndefined();
  });

  it("accepts whole numbers from 0 to 100 and empty stats", () => {
    const errors = validateForm({
      ...blank,
      stats: pairs(["0", "100", " 45 ", "", "-7", "999", "50", "+100"]),
    });
    expect(errors.stats).toEqual(noStatErrors);
  });

  it("refuses other stat values", () => {
    const errors = validateForm({
      ...blank,
      stats: pairs(["101", "-1", "4.5", "abc", "1e2", "", "50", "1.0"]),
    });
    const bad = "Use a whole number within the safe integer range.";
    expect(errors.stats).toEqual(
      [undefined, undefined, bad, bad, bad, undefined, undefined, bad].map(
        (left) => ({ left, right: undefined }),
      ),
    );
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

describe("parseJobDate", () => {
  it.each([
    ["1950", "1950"],
    [" 1950 ", "1950"],
    ["March 1950", "1950-03"],
    ["Mar 1950", "1950-03"],
    ["mar. 1950", "1950-03"],
    ["Sept, 1950", "1950-09"],
    ["1950-03", "1950-03"],
    ["1950-3", "1950-03"],
    ["3 March 1950", "1950-03-03"],
    ["March 3, 1950", "1950-03-03"],
    ["1950-03-03", "1950-03-03"],
    ["3/3/1950", "1950-03-03"],
  ])("reads %j", (text, date) => {
    expect(parseJobDate(text)).toEqual({ date });
  });

  it.each(["", "50", "19501", "Foo 1950", "Ma 1950", "1950/03", "next year"])(
    "refuses the form of %j",
    (text) => {
      expect(parseJobDate(text)).toEqual({
        error: "Use a year, a month and year, or a full date.",
      });
    },
  );

  it.each(["1950-13", "1950-00", "30 February 1950", "1900-02-29"])(
    "refuses %j as not real",
    (text) => {
      expect(parseJobDate(text)).toEqual({ error: "Not a real date." });
    },
  );

  it("leaves birth and death dates needing a full date", () => {
    expect(parseDate("1950")).toEqual({ error: "Use day, month and year." });
    expect(parseDate("March 1950")).toEqual({
      error: "Use day, month and year.",
    });
  });
});

describe("job date periods and formats", () => {
  it("counts a partial date from the first to the last day of its period", () => {
    expect(periodStart("1950")).toBe("1950-01-01");
    expect(periodEnd("1950")).toBe("1950-12-31");
    expect(periodStart("1950-02")).toBe("1950-02-01");
    expect(periodEnd("1950-02")).toBe("1950-02-28");
    expect(periodEnd("1960-02")).toBe("1960-02-29");
    expect(periodEnd("1950-04")).toBe("1950-04-30");
    expect(periodStart("1950-02-14")).toBe("1950-02-14");
    expect(periodEnd("1950-02-14")).toBe("1950-02-14");
  });

  it("writes the box and the short forms", () => {
    expect(formatJobBoxDate("1950")).toBe("1950");
    expect(formatJobBoxDate("1950-03")).toBe("March 1950");
    expect(formatJobBoxDate("1950-03-03")).toBe("3 March 1950");
    expect(formatJobShortDate("1950")).toBe("1950");
    expect(formatJobShortDate("1950-03")).toBe("Mar 1950");
    expect(formatJobShortDate("1950-03-03")).toBe("Mar 3, 1950");
  });

  it.each(["1950", "1950-03", "1950-03-03"])(
    "reads its own box form of %s back",
    (date) => {
      expect(parseJobDate(formatJobBoxDate(date))).toEqual({ date });
    },
  );
});

const job = (
  name: string,
  startDate: string,
  endDate: string | null = null,
  employer = "",
): Job => ({
  id: name,
  job: name,
  employer,
  startDate,
  endDate,
  description: "",
});

describe("resume order and current jobs", () => {
  it("puts the newest start first, a partial start at its first day", () => {
    const resume = [
      job("a", "1950-06-15"),
      job("b", "1950"),
      job("c", "1951-01"),
      job("d", "1950-06"),
      job("e", "1950-01-01"),
    ];
    expect(sortResume(resume).map((j) => j.job)).toEqual([
      "c",
      "a",
      "d",
      "b",
      "e",
    ]);
    expect(resume.map((j) => j.job)).toEqual(["a", "b", "c", "d", "e"]);
  });

  it("finds the jobs whose period holds the game date", () => {
    const person = {
      deathDate: null,
      resume: [
        job("ended", "1940", "1950"),
        job("open", "1955"),
        job("this month", "1962-01", "1962-02"),
        job("ends on the day", "1960", "1962-02-10"),
        job("ended the day before", "1960", "1962-02-09"),
        job("starts tomorrow", "1962-02-11"),
      ],
    };
    expect(currentJobs(person, GAME).map((j) => j.job)).toEqual([
      "this month",
      "ends on the day",
      "open",
    ]);
  });

  it("uses the death date for the dead", () => {
    const person = {
      deathDate: "1961-08-03",
      resume: [
        job("before", "1950", "1961-07"),
        job("open", "1955"),
        job("held at death", "1960", "1961-12"),
      ],
    };
    expect(currentJobs(person, GAME).map((j) => j.job)).toEqual([
      "held at death",
      "open",
    ]);
  });
});

describe("occupationLine", () => {
  const at = (...resume: Job[]) =>
    occupationLine({ deathDate: null, resume }, GAME);

  it("writes one current job with its employer", () => {
    expect(at(job("Reporter", "1950", null, "Asahi"))).toBe("Reporter, Asahi");
    expect(at(job("Reporter", "1950"))).toBe("Reporter");
  });

  it("writes only the names of two or more current jobs, newest first", () => {
    expect(
      at(
        job("Reporter", "1950", null, "Asahi"),
        job("Poet", "1955", null, "Self"),
      ),
    ).toBe("Poet · Reporter");
  });

  it("is empty with no current job", () => {
    expect(at()).toBe("");
    expect(at(job("Reporter", "1950", "1955"))).toBe("");
  });
});

describe("resumeDateText", () => {
  it("writes the start and the end", () => {
    expect(resumeDateText(job("a", "1950", "1955"), null)).toBe("1950 – 1955");
    expect(resumeDateText(job("a", "1950-03", "1955-03-03"), null)).toBe(
      "Mar 1950 – Mar 3, 1955",
    );
  });

  it("writes present for an open job of the living", () => {
    expect(resumeDateText(job("a", "1950-03"), null)).toBe(
      "Mar 1950 – present",
    );
  });

  it("ends an open job of the dead at the death date, as exact as the start", () => {
    const death = "1961-08-03";
    expect(resumeDateText(job("a", "1931"), death)).toBe("1931 – 1961");
    expect(resumeDateText(job("a", "1931-03"), death)).toBe(
      "Mar 1931 – Aug 1961",
    );
    expect(resumeDateText(job("a", "1931-03-02"), death)).toBe(
      "Mar 2, 1931 – Aug 3, 1961",
    );
    expect(resumeDateText(job("a", "1931", "1940"), death)).toBe("1931 – 1940");
  });
});

describe("compareOccupation", () => {
  const people = [
    { name: "none 1", deathDate: null, resume: [] },
    { name: "typist", deathDate: null, resume: [job("Typist", "1950")] },
    { name: "clerk", deathDate: null, resume: [job("Clerk", "1950")] },
    { name: "none 2", deathDate: null, resume: [job("Old", "1940", "1941")] },
    { name: "mayor", deathDate: null, resume: [job("Mayor", "1950")] },
  ];
  const sorted = (direction: "asc" | "desc") =>
    [...people]
      .sort((a, b) => compareOccupation(a, b, GAME, direction))
      .map((p) => p.name);

  it("sorts A to Z with no occupation last", () => {
    expect(sorted("asc")).toEqual([
      "clerk",
      "mayor",
      "typist",
      "none 1",
      "none 2",
    ]);
  });

  it("sorts Z to A with no occupation still last", () => {
    expect(sorted("desc")).toEqual([
      "typist",
      "mayor",
      "clerk",
      "none 1",
      "none 2",
    ]);
  });
});

describe("validateForm resume rows", () => {
  const row = (extra: Partial<JobDraft> = {}): JobDraft => ({
    ...jobToDraft(),
    job: "Clerk",
    startDate: "1950",
    ...extra,
  });
  const form = (resume: JobDraft[], birthDate = "", deathDate = "") => ({
    name: "Ada",
    birthDate,
    deathDate,
    stats: Array.from({ length: 8 }, () => ({ left: "", right: "" })),
    resume,
  });
  const rowErrors = (r: JobDraft, birth = "", death = "") =>
    validateForm(form([r], birth, death)).resume?.[0];

  it("accepts a good row", () => {
    const errors = validateForm(form([row()]));
    expect(errors.resume).toEqual([
      { job: undefined, startDate: undefined, endDate: undefined },
    ]);
    expect(hasErrors(errors)).toBe(false);
  });

  it("asks for a job and a start date", () => {
    const errors = validateForm(form([row({ job: " ", startDate: " " })]));
    expect(errors.resume?.[0]).toEqual({
      job: "Enter a job.",
      startDate: "Enter a start date.",
      endDate: undefined,
    });
    expect(hasErrors(errors)).toBe(true);
  });

  it("reports date forms and dates that don't exist", () => {
    expect(rowErrors(row({ startDate: "soon", endDate: "1950-13" }))).toEqual({
      job: undefined,
      startDate: "Use a year, a month and year, or a full date.",
      endDate: "Not a real date.",
    });
  });

  it("refuses an end before the start, counting whole periods", () => {
    expect(
      rowErrors(row({ startDate: "June 1950", endDate: "31 May 1950" }))
        ?.endDate,
    ).toBe("End date is before the start date.");
    expect(
      rowErrors(row({ startDate: "June 1950", endDate: "1950" }))?.endDate,
    ).toBeUndefined();
    expect(
      rowErrors(row({ startDate: "1950", endDate: "1 January 1950" }))?.endDate,
    ).toBeUndefined();
  });

  it("accepts a start after the game date", () => {
    for (const startDate of ["11 February 1962", "March 1962", "1970"]) {
      const errors = validateForm(form([row({ startDate })]));
      expect(errors.resume?.[0]?.startDate).toBeUndefined();
      expect(hasErrors(errors)).toBe(false);
    }
  });

  it("refuses a start before the birth date and shows it on the birth date", () => {
    const errors = validateForm(
      form(
        [row({ job: " Clerk ", startDate: "February 1950" })],
        "2 March 1950",
      ),
    );
    expect(errors.resume?.[0].startDate).toBe(
      "Start date is before the birth date.",
    );
    expect(errors.birthDate).toBe(
      "Birth date is after the start of a job (Clerk, February 1950).",
    );
    for (const startDate of ["1949", "1 March 1950"]) {
      expect(
        validateForm(form([row({ startDate })], "2 March 1950")).resume?.[0]
          .startDate,
      ).toBe("Start date is before the birth date.");
    }
  });

  it.each(["1950", "March 1950", "2 March 1950"])(
    "lets a start of %j touch the birth date of 2 March 1950",
    (startDate) => {
      const errors = validateForm(form([row({ startDate })], "2 March 1950"));
      expect(errors.resume?.[0].startDate).toBeUndefined();
      expect(errors.birthDate).toBeUndefined();
    },
  );

  it("refuses an end after the death date and shows it on the death date", () => {
    const errors = validateForm(
      form([row({ endDate: "September 1961" })], "", "3 August 1961"),
    );
    expect(errors.resume?.[0].endDate).toBe(
      "End date is after the death date.",
    );
    expect(errors.deathDate).toBe(
      "Death date is before the end of a job (Clerk, September 1961).",
    );
    for (const endDate of ["1962", "4 August 1961"]) {
      expect(
        validateForm(form([row({ endDate })], "", "3 August 1961")).resume?.[0]
          .endDate,
      ).toBe("End date is after the death date.");
    }
  });

  it.each(["1961", "August 1961", "3/8/1961"])(
    "lets an end of %j touch the death date of 3 August 1961",
    (endDate) => {
      const errors = validateForm(
        form([row({ endDate })], "", "3 August 1961"),
      );
      expect(errors.resume?.[0].endDate).toBeUndefined();
      expect(errors.deathDate).toBeUndefined();
    },
  );

  it("lets an open job of the dead end at the death date", () => {
    const errors = validateForm(form([row()], "", "3 August 1961"));
    expect(errors.deathDate).toBeUndefined();
    expect(hasErrors(errors)).toBe(false);
  });

  it("keeps the person's own date errors first", () => {
    expect(
      validateForm(
        form([row({ startDate: "1920", endDate: "1965" })], "soon", ""),
      ).birthDate,
    ).toBe("Use day, month and year.");
    // The job also ends after the death date.
    expect(
      validateForm(
        form(
          [row({ startDate: "1940", endDate: "1965" })],
          "1 January 1930",
          "1 March 1925",
        ),
      ).deathDate,
    ).toBe("Death date is before the birth date.");
  });

  it("gives errors per row", () => {
    const errors = validateForm(form([row(), row({ job: "" }), row()]));
    expect(errors.resume?.map((e) => e.job)).toEqual([
      undefined,
      "Enter a job.",
      undefined,
    ]);
  });
});
