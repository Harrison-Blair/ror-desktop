import type { Character } from "@/lib/peopleApi";

// Rules for People of interest. Dates are "YYYY-MM-DD" strings throughout, so
// no time zone can shift them.

export const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

export const UNKNOWN_FORM = "Use day, month and year.";
export const NOT_REAL = "Not a real date.";

type Parts = { year: number; month: number; day: number };

const pad = (n: number, width: number) => String(n).padStart(width, "0");

const toIso = ({ year, month, day }: Parts) =>
  `${pad(year, 4)}-${pad(month, 2)}-${pad(day, 2)}`;

const fromIso = (iso: string): Parts => {
  const [year, month, day] = iso.split("-").map(Number);
  return { year, month, day };
};

const daysIn = (year: number, month: number) => {
  const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  return [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][
    month - 1
  ];
};

// A month word: the full name or its first three or more letters ("Jan",
// "Sept"), any case, with an optional final dot. 0 when it is no month.
const monthOf = (word: string) => {
  const w = word.toLowerCase().replace(/\.$/, "");
  if (w.length < 3) return 0;
  return MONTHS.findIndex((m) => m.toLowerCase().startsWith(w)) + 1;
};

// The forms typed dates may take, each read into day, month and year. A
// month word that is no month gives month 0.
const FORMS: [RegExp, (m: RegExpExecArray) => Parts][] = [
  [
    /^(\d{1,2}) ([A-Za-z]+\.?) (\d{4})$/,
    (m) => ({ day: Number(m[1]), month: monthOf(m[2]), year: Number(m[3]) }),
  ],
  [
    /^([A-Za-z]+\.?) (\d{1,2}) (\d{4})$/,
    (m) => ({ day: Number(m[2]), month: monthOf(m[1]), year: Number(m[3]) }),
  ],
  [
    /^(\d{4})-(\d{1,2})-(\d{1,2})$/,
    (m) => ({ year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) }),
  ],
  [
    /^(\d{1,2})([/.-])(\d{1,2})\2(\d{4})$/,
    (m) => ({ day: Number(m[1]), month: Number(m[3]), year: Number(m[4]) }),
  ],
];

// Reads typed text: "21 January 1904", "21 Jan 1904", "January 21, 1904",
// "1904-01-21", and day first "21/01/1904" (also with "." or "-").
export const parseDate = (
  text: string,
): { date: string } | { error: string } => {
  const t = text.trim().replace(/,/g, " ").replace(/\s+/g, " ");
  let parts: Parts | undefined;
  for (const [pattern, read] of FORMS) {
    const m = pattern.exec(t);
    if (m) {
      parts = read(m);
      break;
    }
  }
  // A word that is no month is an unknown form, not a wrong date.
  if (!parts || (parts.month === 0 && /[A-Za-z]/.test(t))) {
    return { error: UNKNOWN_FORM };
  }
  const { year, month, day } = parts;
  if (month < 1 || month > 12 || day < 1 || day > daysIn(year, month)) {
    return { error: NOT_REAL };
  }
  return { date: toIso(parts) };
};

// For the date box: "21 January 1904".
export const formatBoxDate = (iso: string) => {
  const { year, month, day } = fromIso(iso);
  return `${day} ${MONTHS[month - 1]} ${year}`;
};

// For the sheet: "January 21, 1904".
export const formatLongDate = (iso: string) => {
  const { year, month, day } = fromIso(iso);
  return `${MONTHS[month - 1]} ${day}, ${year}`;
};

// For cards: "Jan 21, 1904".
export const formatShortDate = (iso: string) => {
  const { year, month, day } = fromIso(iso);
  return `${MONTHS[month - 1].slice(0, 3)} ${day}, ${year}`;
};

// Whole years from the birth date to the death date, or to the game date for
// the living. Null without a birth date. A birth date after the end gives a
// negative age.
export const ageOf = (
  person: Pick<Character, "birthDate" | "deathDate">,
  gameDate: string,
): number | null => {
  if (!person.birthDate) return null;
  const b = fromIso(person.birthDate);
  const e = fromIso(person.deathDate ?? gameDate);
  const beforeBirthday =
    e.month < b.month || (e.month === b.month && e.day < b.day);
  return e.year - b.year - (beforeBirthday ? 1 : 0);
};

// Up to two initials for a photo stand-in: "Rosa Alvarez" gives "RA".
export const initials = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => [...word][0] ?? "")
    .join("")
    .toUpperCase();

export const isDead = (person: Pick<Character, "deathDate">) =>
  person.deathDate !== null;

// Until sync exists, the only player character is this device's character.
export const isPlayer = (person: Pick<Character, "id">, meId: string | null) =>
  person.id === meId;

export const canDelete = (person: Pick<Character, "id">, meId: string | null) =>
  person.id !== meId;

export const canClaim = (
  person: Pick<Character, "id" | "deathDate">,
  meId: string | null,
) => person.id !== meId && !isDead(person);

const DASH = " – ";

// The dates joined by the dash. The dead with no birth date show "Unknown"
// for it. Empty for the living with no birth date.
const dates = (
  person: Pick<Character, "birthDate" | "deathDate">,
  format: (iso: string) => string,
) => {
  const { birthDate, deathDate } = person;
  const birth = birthDate ? format(birthDate) : deathDate ? "Unknown" : "";
  return [birth, deathDate ? format(deathDate) : ""].filter(Boolean).join(DASH);
};

// The sheet's date line: "January 21, 1904", dead "November 9, 1925 – August
// 3, 1961", dead with no birth date "Unknown – August 3, 1961".
export const sheetDateLine = (
  person: Pick<Character, "birthDate" | "deathDate">,
) => dates(person, formatLongDate);

// The card's date line with the age: "Jun 14, 1930 (31)", dead "Nov 9, 1925 –
// Aug 3, 1961 (35)", dead with no birth date "Unknown – Aug 3, 1961".
export const cardDateLine = (
  person: Pick<Character, "birthDate" | "deathDate">,
  gameDate: string,
) => {
  const age = ageOf(person, gameDate);
  return [dates(person, formatShortDate), age === null ? "" : `(${age})`]
    .filter(Boolean)
    .join(" ");
};

// Orders two people by age for a sort in `direction`. People with no age
// come last in both directions.
export const compareAge = (
  a: Pick<Character, "birthDate" | "deathDate">,
  b: Pick<Character, "birthDate" | "deathDate">,
  gameDate: string,
  direction: "asc" | "desc",
) => {
  const x = ageOf(a, gameDate);
  const y = ageOf(b, gameDate);
  if (x === null || y === null)
    return (x === null ? 1 : 0) - (y === null ? 1 : 0);
  return direction === "asc" ? x - y : y - x;
};

const place = (city: string, country: string) =>
  [city.trim(), country.trim()].filter(Boolean).join(", ");

// "City, Country" for the birthplace; the dead add " – " and the death place.
// Empty parts are dropped, and the line is empty when both places are.
export const placeLine = (
  person: Pick<
    Character,
    "birthCity" | "birthCountry" | "deathDate" | "deathCity" | "deathCountry"
  >,
) =>
  [
    place(person.birthCity, person.birthCountry),
    isDead(person) ? place(person.deathCity, person.deathCountry) : "",
  ]
    .filter(Boolean)
    .join(DASH);

// "City, Country" of the birthplace, for the table.
export const birthplace = (
  person: Pick<Character, "birthCity" | "birthCountry">,
) => place(person.birthCity, person.birthCountry);

// The edit form as typed. `stats` holds the seven left values as text.
export type CharacterForm = {
  name: string;
  birthDate: string;
  deathDate: string;
  stats: string[];
};

export type FormErrors = {
  name?: string;
  birthDate?: string;
  deathDate?: string;
  // One entry per stat pair, undefined when the value is fine.
  stats: (string | undefined)[];
};

const dateError = (text: string) => {
  if (!text.trim()) return undefined;
  const parsed = parseDate(text);
  return "error" in parsed ? parsed.error : undefined;
};

const statError = (text: string) => {
  const t = text.trim();
  return !t || (/^\d+$/.test(t) && Number(t) <= 100)
    ? undefined
    : "Use a whole number from 0 to 100.";
};

// Checks the edit form against the game date ("YYYY-MM-DD").
export const validateForm = (
  form: CharacterForm,
  gameDate: string,
): FormErrors => {
  const errors: FormErrors = {
    name: form.name.trim() ? undefined : "Enter a name.",
    birthDate: dateError(form.birthDate),
    deathDate: dateError(form.deathDate),
    stats: form.stats.map(statError),
  };
  const birth = parseDate(form.birthDate);
  const death = parseDate(form.deathDate);
  if ("date" in death) {
    if ("date" in birth && death.date < birth.date) {
      errors.deathDate = "Death date is before the birth date.";
    } else if (death.date > gameDate) {
      errors.deathDate = "Death date is after the game date.";
    }
  }
  return errors;
};

export const hasErrors = (errors: FormErrors) =>
  !!(
    errors.name ||
    errors.birthDate ||
    errors.deathDate ||
    errors.stats.some(Boolean)
  );

// The error for the typed game date, or undefined when it is a real date.
export const gameDateError = (text: string) =>
  text.trim() ? dateError(text) : "Enter a game date.";
