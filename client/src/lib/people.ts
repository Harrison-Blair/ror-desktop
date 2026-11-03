import {
  type Character,
  type CharacterFields,
  type Job,
  STAT_COUNT,
} from "@/lib/peopleApi";

// Rules for People of interest. Dates are "YYYY-MM-DD" strings throughout, so
// no time zone can shift them. Job dates may also be "YYYY" or "YYYY-MM".

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
export const JOB_UNKNOWN_FORM = "Use a year, a month and year, or a full date.";
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

const tidy = (text: string) =>
  text.trim().replace(/,/g, " ").replace(/\s+/g, " ");

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
  const t = tidy(text);
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

// Reads a typed job date: a year "1950", a month "March 1950", "Mar 1950" or
// "1950-03", or any full date that parseDate reads. Gives "YYYY", "YYYY-MM"
// or "YYYY-MM-DD".
export const parseJobDate = (
  text: string,
): { date: string } | { error: string } => {
  const t = tidy(text);
  if (/^\d{4}$/.test(t)) return { date: t };
  const named = /^([A-Za-z]+\.?) (\d{4})$/.exec(t);
  const numbered = /^(\d{4})-(\d{1,2})$/.exec(t);
  if (named || numbered) {
    const month = named ? monthOf(named[1]) : Number(numbered?.[2]);
    const year = named ? named[2] : numbered?.[1];
    if (named && month === 0) return { error: JOB_UNKNOWN_FORM };
    if (month < 1 || month > 12) return { error: NOT_REAL };
    return { date: `${year}-${pad(month, 2)}` };
  }
  const full = parseDate(t);
  return "error" in full && full.error === UNKNOWN_FORM
    ? { error: JOB_UNKNOWN_FORM }
    : full;
};

// The first day, "YYYY-MM-DD", of a job date's period.
export const periodStart = (date: string) =>
  date.length === 4 ? `${date}-01-01` : date.length === 7 ? `${date}-01` : date;

// The last day, "YYYY-MM-DD", of a job date's period.
export const periodEnd = (date: string) => {
  if (date.length === 4) return `${date}-12-31`;
  if (date.length !== 7) return date;
  const [year, month] = date.split("-").map(Number);
  return `${date}-${pad(daysIn(year, month), 2)}`;
};

// For the job date box: "1950", "March 1950" or "3 March 1950".
export const formatJobBoxDate = (date: string) => {
  if (date.length === 4) return date;
  if (date.length !== 7) return formatBoxDate(date);
  const [year, month] = date.split("-");
  return `${MONTHS[Number(month) - 1]} ${year}`;
};

// For the sheet: "1950", "Mar 1950" or "Mar 3, 1950".
export const formatJobShortDate = (date: string) => {
  if (date.length === 4) return date;
  if (date.length !== 7) return formatShortDate(date);
  const [year, month] = date.split("-");
  return `${MONTHS[Number(month) - 1].slice(0, 3)} ${year}`;
};

// For the date box: "21 January 1904". Keep four year digits for parseDate.
export const formatBoxDate = (iso: string) => {
  const { year, month, day } = fromIso(iso);
  return `${day} ${MONTHS[month - 1]} ${pad(year, 4)}`;
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

const place = (...parts: string[]) =>
  parts
    .map((part) => part.trim())
    .filter(Boolean)
    .join(", ");

// "City, State, Country" for the birthplace; the dead add " – " and the death
// place. Empty parts are dropped, and the line is empty when both places are.
export const placeLine = (
  person: Pick<
    Character,
    | "birthCity"
    | "birthState"
    | "birthCountry"
    | "deathDate"
    | "deathCity"
    | "deathState"
    | "deathCountry"
  >,
) =>
  [
    place(person.birthCity, person.birthState, person.birthCountry),
    isDead(person)
      ? place(person.deathCity, person.deathState, person.deathCountry)
      : "",
  ]
    .filter(Boolean)
    .join(DASH);

// "City, State, Country" of the birthplace, for the table.
export const birthplace = (
  person: Pick<Character, "birthCity" | "birthState" | "birthCountry">,
) => place(person.birthCity, person.birthState, person.birthCountry);

// The jobs, newest start first. A partial start counts from the first day of
// its period. Jobs that start together keep their order.
export const sortResume = (resume: Job[]) =>
  [...resume].sort((a, b) => {
    const x = periodStart(a.startDate);
    const y = periodStart(b.startDate);
    return x < y ? 1 : x > y ? -1 : 0;
  });

// The jobs whose period holds the game date, or the death date for the dead,
// newest start first. An open job holds every later date.
export const currentJobs = (
  person: Pick<Character, "deathDate" | "resume">,
  gameDate: string,
) => {
  const at = person.deathDate ?? gameDate;
  return sortResume(person.resume).filter(
    (job) =>
      periodStart(job.startDate) <= at &&
      (job.endDate === null || at <= periodEnd(job.endDate)),
  );
};

// What the person does now: "Job, Employer" for one current job, or the job
// alone with no employer; the job names joined by " · " for more; "" for
// none.
export const occupationLine = (
  person: Pick<Character, "deathDate" | "resume">,
  gameDate: string,
) => {
  const jobs = currentJobs(person, gameDate);
  if (jobs.length === 1) {
    return [jobs[0].job, jobs[0].employer].filter(Boolean).join(", ");
  }
  return jobs.map((job) => job.job).join(" · ");
};

// The resume's date text: "Mar 1950 – 1955", or "1950 – present" for an open
// job. For the dead an open job ends at the death date, shown as exactly as
// the start: "1931 – 1961", "Mar 1931 – Aug 1961".
export const resumeDateText = (
  job: Pick<Job, "startDate" | "endDate">,
  deathDate: string | null,
) => {
  const end = job.endDate
    ? formatJobShortDate(job.endDate)
    : deathDate
      ? formatJobShortDate(deathDate.slice(0, job.startDate.length))
      : "present";
  return `${formatJobShortDate(job.startDate)}${DASH}${end}`;
};

// Orders two people by occupation line for a sort in `direction`. People with
// no line come last in both directions.
export const compareOccupation = (
  a: Pick<Character, "deathDate" | "resume">,
  b: Pick<Character, "deathDate" | "resume">,
  gameDate: string,
  direction: "asc" | "desc",
) => {
  const x = occupationLine(a, gameDate);
  const y = occupationLine(b, gameDate);
  if (!x || !y) return Number(!x) - Number(!y);
  return (direction === "asc" ? 1 : -1) * x.localeCompare(y);
};

// A resume row as typed. A new row has the id "".
export type JobDraft = {
  id: string;
  job: string;
  employer: string;
  startDate: string;
  endDate: string;
  description: string;
};

// A new empty row, or a stored job in the date boxes' display form.
export const jobToDraft = (job?: Job): JobDraft => ({
  id: job?.id ?? "",
  job: job?.job ?? "",
  employer: job?.employer ?? "",
  startDate: job ? formatJobBoxDate(job.startDate) : "",
  endDate: job?.endDate ? formatJobBoxDate(job.endDate) : "",
  description: job?.description ?? "",
});

// The edit form as typed, with independent values for both sides. No resume
// is an empty one.
export type CharacterForm = {
  name: string;
  birthDate: string;
  deathDate: string;
  stats: { left: string; right: string }[];
  resume?: JobDraft[];
};

// Shared editable fields. Photo selection and world stat names belong to the UI.
export type CharacterDraft = Omit<
  CharacterFields,
  "birthDate" | "deathDate" | "stats" | "resume"
> &
  CharacterForm & { resume: JobDraft[] };

// Starts a new draft, or copies stored fields into the date boxes' display form.
export const characterToDraft = (fields?: CharacterFields): CharacterDraft => ({
  name: fields?.name ?? "",
  birthDate: fields?.birthDate ? formatBoxDate(fields.birthDate) : "",
  birthCity: fields?.birthCity ?? "",
  birthState: fields?.birthState ?? "",
  birthCountry: fields?.birthCountry ?? "",
  deathDate: fields?.deathDate ? formatBoxDate(fields.deathDate) : "",
  deathCity: fields?.deathCity ?? "",
  deathState: fields?.deathState ?? "",
  deathCountry: fields?.deathCountry ?? "",
  stats: Array.from({ length: STAT_COUNT }, (_, i) => {
    const pair = fields?.stats[i];
    return {
      left: pair?.left == null ? "" : String(pair.left),
      right: pair?.right == null ? "" : String(pair.right),
    };
  }),
  description: fields?.description ?? "",
  resume: (fields?.resume ?? []).map(jobToDraft),
});

// The errors of one resume row.
export type JobErrors = { job?: string; startDate?: string; endDate?: string };

// `resume` has one entry per resume row; validateForm always sets it.
export type FormErrors = {
  name?: string;
  birthDate?: string;
  deathDate?: string;
  stats: { left?: string; right?: string }[];
  resume?: JobErrors[];
};

const dateError = (text: string) => {
  if (!text.trim()) return undefined;
  const parsed = parseDate(text);
  return "error" in parsed ? parsed.error : undefined;
};

// The stored form of a typed job date, or undefined when it is empty or
// can't be read.
const jobDateOf = (text: string) => {
  const parsed = parseJobDate(text);
  return "date" in parsed ? parsed.date : undefined;
};

// A partial job date conflicts with the birth or death date only when its
// whole period is outside the life.
const startsBeforeBirth = (start: string, birth: string) =>
  periodEnd(start) < birth;
const endsAfterDeath = (end: string, death: string) => periodStart(end) > death;

// A row's errors against the birth and death dates ("YYYY-MM-DD").
const jobErrors = (
  row: JobDraft,
  birth: string | undefined,
  death: string | undefined,
): JobErrors => {
  const typedError = (text: string) => {
    const parsed = parseJobDate(text);
    return "error" in parsed ? parsed.error : undefined;
  };
  const start = jobDateOf(row.startDate);
  const end = row.endDate.trim() ? jobDateOf(row.endDate) : undefined;
  const first = start && periodStart(start);
  const last = end && periodEnd(end);
  const startDate = !row.startDate.trim()
    ? "Enter a start date."
    : (typedError(row.startDate) ??
      (start && birth && startsBeforeBirth(start, birth)
        ? "Start date is before the birth date."
        : undefined));
  const endDate = !row.endDate.trim()
    ? undefined
    : (typedError(row.endDate) ??
      (last && first && last < first
        ? "End date is before the start date."
        : end && death && endsAfterDeath(end, death)
          ? "End date is after the death date."
          : undefined));
  return {
    job: row.job.trim() ? undefined : "Enter a job.",
    startDate,
    endDate,
  };
};

const statError = (text: string) => {
  const t = text.trim();
  return !t || (/^[+-]?\d+$/.test(t) && Number.isSafeInteger(Number(t)))
    ? undefined
    : "Use a whole number within the safe integer range.";
};

// Checks the edit form.
export const validateForm = (form: CharacterForm): FormErrors => {
  const errors: FormErrors = {
    name: form.name.trim() ? undefined : "Enter a name.",
    birthDate: dateError(form.birthDate),
    deathDate: dateError(form.deathDate),
    stats: form.stats.map((pair) => ({
      left: statError(pair.left),
      right: statError(pair.right),
    })),
  };
  const birth = parseDate(form.birthDate);
  const death = parseDate(form.deathDate);
  if ("date" in death && "date" in birth && death.date < birth.date) {
    errors.deathDate = "Death date is before the birth date.";
  }
  const birthDate = "date" in birth ? birth.date : undefined;
  const deathDate = "date" in death ? death.date : undefined;
  const rows = form.resume ?? [];
  errors.resume = rows.map((row) => jobErrors(row, birthDate, deathDate));
  // The same conflicts, shown on the person's own dates too. An open job
  // ends at the death date, so it never conflicts.
  for (const row of rows) {
    const start = jobDateOf(row.startDate);
    const end = row.endDate.trim() ? jobDateOf(row.endDate) : undefined;
    if (
      !errors.birthDate &&
      birthDate &&
      start &&
      startsBeforeBirth(start, birthDate)
    ) {
      errors.birthDate = `Birth date is after the start of a job (${row.job.trim()}, ${formatJobBoxDate(start)}).`;
    }
    if (
      !errors.deathDate &&
      deathDate &&
      end &&
      endsAfterDeath(end, deathDate)
    ) {
      errors.deathDate = `Death date is before the end of a job (${row.job.trim()}, ${formatJobBoxDate(end)}).`;
    }
  }
  return errors;
};

export const hasErrors = (errors: FormErrors) =>
  !!(
    errors.name ||
    errors.birthDate ||
    errors.deathDate ||
    errors.stats.some((pair) => pair.left || pair.right) ||
    errors.resume?.some((row) => row.job || row.startDate || row.endDate)
  );

// The error for the typed game date, or undefined when it is a real date.
export const gameDateError = (text: string) =>
  text.trim() ? dateError(text) : "Enter a game date.";

// Invalid drafts never produce fields that a caller could accidentally save.
export type CharacterDraftResult =
  | { fields: CharacterFields }
  | { errors: FormErrors };

export const characterDraftToFields = (
  draft: CharacterDraft,
): CharacterDraftResult => {
  const errors = validateForm(draft);
  if (hasErrors(errors)) return { errors };
  const dateOf = (text: string) => {
    const parsed = parseDate(text);
    return "date" in parsed ? parsed.date : null;
  };
  return {
    fields: {
      name: draft.name.trim(),
      birthDate: dateOf(draft.birthDate),
      birthCity: draft.birthCity.trim(),
      birthState: draft.birthState.trim(),
      birthCountry: draft.birthCountry.trim(),
      deathDate: dateOf(draft.deathDate),
      deathCity: draft.deathCity.trim(),
      deathState: draft.deathState.trim(),
      deathCountry: draft.deathCountry.trim(),
      stats: draft.stats.map((pair) => ({
        left: pair.left.trim() ? Number(pair.left) : null,
        right: pair.right.trim() ? Number(pair.right) : null,
      })),
      description: draft.description,
      // Without errors every start date reads.
      resume: draft.resume.map((row) => ({
        id: row.id,
        job: row.job.trim(),
        employer: row.employer.trim(),
        startDate: jobDateOf(row.startDate) ?? "",
        endDate: jobDateOf(row.endDate) ?? null,
        description: row.description,
      })),
    },
  };
};
