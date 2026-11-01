// The chat agent's People of interest tools. They use the same commands as
// the People screens and check the fields with the form's rules, so the agent
// gets the form's error messages.

import type { Tool, ToolPreview } from "@/lib/chat/registry";
import { lineDiff } from "@/lib/diff";
import {
  ageOf,
  type CharacterDraft,
  canDelete,
  characterDraftToFields,
  characterToDraft,
  isDead,
  isPlayer,
  type JobDraft,
  jobToDraft,
  occupationLine,
  placeLine,
  resumeDateText,
  sheetDateLine,
  sortResume,
} from "@/lib/people";
import {
  type Character,
  type CharacterFields,
  createPerson,
  deletePerson,
  getWorld,
  listPeople,
  STAT_COUNT,
  type StatName,
  updatePerson,
} from "@/lib/peopleApi";

const object = (
  properties: Record<string, unknown>,
  required = Object.keys(properties),
) => ({ type: "object", properties, required, additionalProperties: false });

const ID = {
  type: "string",
  description: "The person's id, from people_list.",
};

const DATE = (what: string) => ({
  type: "string",
  description: `The ${what}, such as "21 January 1904", "January 21, 1904" or "1904-01-21". "" clears it.`,
});

const PLACE = (what: string) => ({
  type: "string",
  description: `The ${what}. "" clears it.`,
});

// The fields people_create and people_edit take, by input name.
const FIELDS = {
  name: { type: "string", description: "The person's name." },
  birth_date: DATE("birth date"),
  birth_city: PLACE("city of birth"),
  birth_state: PLACE("state or province of birth"),
  birth_country: PLACE("country of birth"),
  death_date: DATE("death date. A date makes the person dead"),
  death_city: PLACE("city of death"),
  death_state: PLACE("state or province of death"),
  death_country: PLACE("country of death"),
  stats: {
    type: "array",
    items: object({
      left: { type: ["integer", "null"] },
      right: { type: ["integer", "null"] },
    }),
    minItems: STAT_COUNT,
    maxItems: STAT_COUNT,
    description: `All ${STAT_COUNT} stat pairs in order, each with independent left and right values: a signed whole number or null. people_read shows the stat names.`,
  },
  description: {
    type: "string",
    description: "The person's description, in plain text.",
  },
};

type FieldName = keyof typeof FIELDS;

const INPUT_OF: Record<Exclude<FieldName, "stats">, keyof CharacterFields> = {
  name: "name",
  birth_date: "birthDate",
  birth_city: "birthCity",
  birth_state: "birthState",
  birth_country: "birthCountry",
  death_date: "deathDate",
  death_city: "deathCity",
  death_state: "deathState",
  death_country: "deathCountry",
  description: "description",
};

function text(input: Record<string, unknown>, name: string) {
  const value = input[name];
  if (typeof value !== "string") throw new Error(`${name} must be a string.`);
  return value;
}

// The person with `id` and the data around it.
async function findPerson(id: string) {
  const people = await listPeople();
  const person = people.characters.find((p) => p.id === id);
  if (!person) {
    throw new Error(
      `There is no person with the id "${id}". Use people_list to find the id.`,
    );
  }
  return { person, meId: people.meId };
}

// Puts the input's fields onto the draft. Types are checked here; values by
// the form's rules after.
function applyInput(
  draft: CharacterDraft,
  input: Record<string, unknown>,
): CharacterDraft {
  const next = { ...draft };
  for (const [name, key] of Object.entries(INPUT_OF)) {
    if (input[name] === undefined) continue;
    next[key as Exclude<keyof CharacterDraft, "stats" | "resume">] = text(
      input,
      name,
    );
  }
  if (input.stats !== undefined) {
    const stats = input.stats;
    if (
      !Array.isArray(stats) ||
      stats.length !== STAT_COUNT ||
      stats.some(
        (s) =>
          !s ||
          typeof s !== "object" ||
          Array.isArray(s) ||
          Object.keys(s).length !== 2 ||
          (["left", "right"] as const).some(
            (side) => s[side] !== null && typeof s[side] !== "number",
          ),
      )
    ) {
      throw new Error(
        `stats must be a list of ${STAT_COUNT} pairs, each with left and right numbers or null.`,
      );
    }
    next.stats = stats.map((s) => ({
      left: s.left === null ? "" : String(s.left),
      right: s.right === null ? "" : String(s.right),
    }));
  }
  return next;
}

const JOB_INPUT_OF = {
  job: "job",
  employer: "employer",
  start_date: "startDate",
  end_date: "endDate",
  description: "description",
} as const;

// The fields to save, or the form's errors as one message the agent can act
// on. The errors of resume row `row`, the job a job tool changes, are named
// by the tool's inputs; other rows' errors by their job id.
function checkedFields(
  draft: CharacterDraft,
  gameDate: string,
  row?: number,
): CharacterFields {
  const result = characterDraftToFields(draft, gameDate);
  if ("errors" in result) {
    const { errors } = result;
    const lines = [
      errors.name && `name: ${errors.name}`,
      errors.birthDate && `birth_date: ${errors.birthDate}`,
      errors.deathDate && `death_date: ${errors.deathDate}`,
      ...errors.stats.flatMap((e, i) =>
        (["left", "right"] as const).map(
          (side) => e[side] && `stats item ${i + 1} ${side}: ${e[side]}`,
        ),
      ),
      ...(errors.resume ?? []).flatMap((e, i) =>
        (["job", "start_date", "end_date"] as const).map((name) => {
          const message = e[JOB_INPUT_OF[name]];
          const where = i === row ? "" : `job_id "${draft.resume[i].id}" `;
          return message && `${where}${name}: ${message}`;
        }),
      ),
    ].filter(Boolean);
    throw new Error(
      `Not saved. Fix these fields and try again:\n${lines.join("\n")}`,
    );
  }
  return result.fields;
}

// The full sheet as text, for people_read and the approval card. Stored
// texts are quoted, so a text can't read as a word for an empty value, and
// every stored value shows: a change to one always changes the diff.
function sheet(
  fields: CharacterFields,
  statNames: StatName[],
  gameDate: string,
) {
  const age = ageOf(fields, gameDate);
  const quoted = (value: string, none = "unknown") =>
    value ? JSON.stringify(value) : none;
  return [
    `Name: ${quoted(fields.name)}`,
    `Birth date: ${fields.birthDate ?? "unknown"}`,
    `Birth city: ${quoted(fields.birthCity)}`,
    `Birth state: ${quoted(fields.birthState)}`,
    `Birth country: ${quoted(fields.birthCountry)}`,
    `Death date: ${fields.deathDate ?? "none (alive)"}`,
    `Death city: ${quoted(fields.deathCity)}`,
    `Death state: ${quoted(fields.deathState)}`,
    `Death country: ${quoted(fields.deathCountry)}`,
    `Age: ${age === null ? "unknown" : age}`,
    `Occupation: ${quoted(occupationLine(fields, gameDate), "none")}`,
    "Stats (left value / right value):",
    ...fields.stats.map((value, i) => {
      const names = statNames[i] ?? { left: "?", right: "?" };
      return `${i + 1}. ${names.left} ${value.left ?? "not set"} / ${names.right} ${value.right ?? "not set"}`;
    }),
    "Resume (newest first):",
    ...(fields.resume.length === 0
      ? ["(none)"]
      : sortResume(fields.resume).map((job) =>
          [
            `- job id: ${job.id || "(new)"}`,
            `job: ${quoted(job.job, "none")}`,
            `employer: ${quoted(job.employer, "none")}`,
            `dates: ${resumeDateText(job, fields.deathDate)} (stored: start ${job.startDate}, end ${job.endDate ?? "open"})`,
            `description: ${quoted(job.description, "none")}`,
          ].join(" | "),
        )),
    // An empty description is on the heading line, so no text can match it.
    fields.description ? "Description:" : "Description: (none)",
    ...(fields.description ? [fields.description] : []),
  ].join("\n");
}

// Refuses a change when the person changed while the card waited.
function checkApproved(seen: Character, approved: ToolPreview | undefined) {
  if (approved?.seen !== undefined && approved.seen !== JSON.stringify(seen)) {
    throw new Error(
      "The person changed while waiting for approval. Read them again.",
    );
  }
}

const label = (person: Pick<Character, "id" | "name">) =>
  `${person.name} (${person.id})`;

const FILTERS = ["all", "players", "npcs"];

export const peopleList: Tool = {
  name: "people_list",
  description:
    "Lists the People of interest, one per line: id, name, dates, places, age, and whether the person is the user's character or dead.",
  inputSchema: object(
    {
      filter: {
        type: "string",
        enum: FILTERS,
        description:
          'Which people: "all" (default), "players" (the user\'s character) or "npcs" (everyone else).',
      },
      search: {
        type: "string",
        description: "Only names that contain this text, ignoring case.",
      },
    },
    [],
  ),
  kind: "read",
  run: async (input) => {
    const filter = input.filter ?? "all";
    if (typeof filter !== "string" || !FILTERS.includes(filter)) {
      throw new Error('filter must be "all", "players" or "npcs".');
    }
    const search = input.search === undefined ? "" : text(input, "search");
    const [{ characters, meId }, { gameDate }] = await Promise.all([
      listPeople(),
      getWorld(),
    ]);
    const query = search.trim().toLowerCase();
    const rows = characters
      .filter((p) => !query || p.name.toLowerCase().includes(query))
      .filter(
        (p) => filter === "all" || (filter === "players") === isPlayer(p, meId),
      )
      .map((p) => {
        const age = ageOf(p, gameDate);
        return [
          `id: ${p.id}`,
          p.name,
          sheetDateLine(p) || "dates unknown",
          placeLine(p) || "places unknown",
          age === null ? "age unknown" : `age ${age}`,
          isPlayer(p, meId) && "the user's character",
          isDead(p) && "dead",
        ]
          .filter(Boolean)
          .join(" | ");
      });
    if (rows.length > 0) return rows.join("\n");
    return characters.length === 0
      ? "There are no people yet."
      : "No one matches.";
  },
};

export const peopleRead: Tool = {
  name: "people_read",
  description:
    'Returns a person\'s full sheet: every field, the current occupation, the stats with their names, the resume and the description. The person\'s dates are YYYY-MM-DD. Texts are quoted; unknown, none and not set mean empty. Each resume line has the job id that the job tools take, the job, the employer, the dates and the description. The dates show as exactly as they were given, such as "1950", "Mar 1950" or "Mar 3, 1950"; an open job ends at "present", or at the death date for the dead. After them come the stored start and end, as YYYY, YYYY-MM or YYYY-MM-DD; end open means the job goes on.',
  inputSchema: object({ id: ID }),
  kind: "read",
  run: async (input) => {
    const id = text(input, "id");
    const [{ person, meId }, world] = await Promise.all([
      findPerson(id),
      getWorld(),
    ]);
    return [
      `id: ${person.id}`,
      `The user's character: ${isPlayer(person, meId) ? "yes" : "no"}`,
      sheet(person, world.statNames, world.gameDate),
    ].join("\n");
  },
};

export const peopleOpen: Tool = {
  name: "people_open",
  description:
    "Opens a person's sheet in World › People of interest, so the user sees it.",
  inputSchema: object({ id: ID }),
  kind: "read",
  run: async (input, { app }) => {
    const { person } = await findPerson(text(input, "id"));
    if (!(await app.showPerson(person.id))) {
      throw new Error(
        `${person.name}'s sheet wasn't opened: the user kept unsaved changes in a person form, or the open note couldn't be saved. Tell the user.`,
      );
    }
    return `Opened ${label(person)}.`;
  },
};

async function newFields(input: Record<string, unknown>) {
  const { gameDate, statNames } = await getWorld();
  const fields = checkedFields(applyInput(characterToDraft(), input), gameDate);
  return { fields, statNames, gameDate };
}

export const peopleCreate: Tool = {
  name: "people_create",
  description:
    "Adds a person to People of interest. Only name is required. Returns the new id.",
  inputSchema: object(FIELDS, ["name"]),
  kind: "write",
  preview: async (input) => {
    const { fields, statNames, gameDate } = await newFields(input);
    return {
      target: `${fields.name} (new person)`,
      diff: lineDiff("", sheet(fields, statNames, gameDate)),
    };
  },
  run: async (input, { app }) => {
    const { fields } = await newFields(input);
    const made = await createPerson(fields);
    app.peopleChanged();
    return `Created ${label(made)}.`;
  },
};

// The person now and their fields after the edit.
async function editedFields(input: Record<string, unknown>) {
  const id = text(input, "id");
  const [{ person }, world] = await Promise.all([findPerson(id), getWorld()]);
  const after = checkedFields(
    applyInput(characterToDraft(person), input),
    world.gameDate,
  );
  return { person, after, world };
}

export const peopleEdit: Tool = {
  name: "people_edit",
  description:
    "Changes a person's fields. Give only the fields to change; the others stay. The resume changes only with people_add_job, people_edit_job and people_remove_job.",
  inputSchema: object({ id: ID, ...FIELDS }, ["id"]),
  kind: "write",
  preview: async (input) => {
    const { person, after, world } = await editedFields(input);
    return {
      target: label(person),
      diff: lineDiff(
        sheet(person, world.statNames, world.gameDate),
        sheet(after, world.statNames, world.gameDate),
      ),
      seen: JSON.stringify(person),
    };
  },
  run: async (input, { app }, approved) => {
    const { person, after } = await editedFields(input);
    checkApproved(person, approved);
    const saved = await updatePerson(person.id, after);
    app.peopleChanged();
    return `Edited ${label(saved)}.`;
  },
};

// The person to delete. The user's own character can't be deleted.
async function deletable(id: string) {
  const { person, meId } = await findPerson(id);
  if (!canDelete(person, meId)) {
    throw new Error(
      `${person.name} is the user's own character and can't be deleted.`,
    );
  }
  return person;
}

export const peopleDelete: Tool = {
  name: "people_delete",
  description:
    "Deletes a person and their photo. This can't be undone. The user's own character can't be deleted.",
  inputSchema: object({ id: ID }),
  kind: "write",
  preview: async (input) => {
    const person = await deletable(text(input, "id"));
    return { target: `${label(person)} → deleted` };
  },
  run: async (input, { app }) => {
    const person = await deletable(text(input, "id"));
    await deletePerson(person.id);
    app.peopleChanged();
    return `Deleted ${label(person)}.`;
  },
};

const JOB_ID = {
  type: "string",
  description: "The job's id, from the resume in people_read.",
};

const JOB_DATE = (what: string) => ({
  type: "string",
  description: `The ${what}: a year "1950", a month "March 1950" or "1950-03", or a full date such as "21 March 1950" or "1950-03-21". Give it as exactly as it is known.`,
});

// The job inputs, by input name.
const JOB_FIELDS = {
  job: { type: "string", description: 'The job title, such as "Printer".' },
  employer: {
    type: "string",
    description: 'Who the person worked for. "" for none.',
  },
  start_date: JOB_DATE("start date"),
  end_date: JOB_DATE('end date. "" for a job that goes on'),
  description: {
    type: "string",
    description: 'The job\'s description, in plain text. "" for none.',
  },
};

// Puts the job inputs onto the row. Values are checked by the form's rules
// after.
function applyJobInput(
  row: JobDraft,
  input: Record<string, unknown>,
): JobDraft {
  const next = { ...row };
  for (const [name, key] of Object.entries(JOB_INPUT_OF)) {
    if (input[name] !== undefined) next[key] = text(input, name);
  }
  return next;
}

type ResumeChange = (
  resume: JobDraft[],
  person: Character,
  input: Record<string, unknown>,
) => { resume: JobDraft[]; row?: number };

// The person now and their fields after `change` makes the new draft
// resume. `change` gives the index of the row it changed, unless it removed
// it.
async function changedResume(
  input: Record<string, unknown>,
  change: ResumeChange,
) {
  const id = text(input, "id");
  const [{ person }, world] = await Promise.all([findPerson(id), getWorld()]);
  const draft = characterToDraft(person);
  const { resume, row } = change(draft.resume, person, input);
  const after = checkedFields({ ...draft, resume }, world.gameDate, row);
  return { person, after, world };
}

// The index of the job with the input's job_id.
function jobIndex(
  resume: JobDraft[],
  person: Character,
  input: Record<string, unknown>,
) {
  const jobId = text(input, "job_id");
  const index = resume.findIndex((row) => row.id === jobId);
  if (index === -1) {
    throw new Error(
      `${person.name} has no job with the id "${jobId}". Use people_read to find the job ids.`,
    );
  }
  return index;
}

// A write tool that changes a person's resume, with the sheet diff on the
// approval card.
function resumeTool(
  tool: Pick<Tool, "name" | "description" | "inputSchema">,
  change: ResumeChange,
  done: (
    before: Character,
    saved: Character,
    input: Record<string, unknown>,
  ) => string,
): Tool {
  return {
    ...tool,
    kind: "write",
    preview: async (input) => {
      const { person, after, world } = await changedResume(input, change);
      return {
        target: label(person),
        diff: lineDiff(
          sheet(person, world.statNames, world.gameDate),
          sheet(after, world.statNames, world.gameDate),
        ),
        seen: JSON.stringify(person),
      };
    },
    run: async (input, { app }, approved) => {
      const { person, after } = await changedResume(input, change);
      checkApproved(person, approved);
      const saved = await updatePerson(person.id, after);
      app.peopleChanged();
      return done(person, saved, input);
    },
  };
}

export const peopleAddJob = resumeTool(
  {
    name: "people_add_job",
    description:
      "Adds a job to a person's resume. id, job and start_date are required. Returns the new job's id.",
    inputSchema: object({ id: ID, ...JOB_FIELDS }, ["id", "job", "start_date"]),
  },
  (resume, _person, input) => {
    for (const name of ["job", "start_date"]) text(input, name);
    return { resume: [applyJobInput(jobToDraft(), input), ...resume], row: 0 };
  },
  (before, saved) => {
    const old = new Set(before.resume.map((job) => job.id));
    const made = saved.resume.find((job) => !old.has(job.id));
    return `Added the job ${made?.id} to ${label(saved)}.`;
  },
);

export const peopleEditJob = resumeTool(
  {
    name: "people_edit_job",
    description:
      "Changes a job in a person's resume. Give only the fields to change; the others stay.",
    inputSchema: object({ id: ID, job_id: JOB_ID, ...JOB_FIELDS }, [
      "id",
      "job_id",
    ]),
  },
  (resume, person, input) => {
    const row = jobIndex(resume, person, input);
    return {
      resume: resume.map((job, i) =>
        i === row ? applyJobInput(job, input) : job,
      ),
      row,
    };
  },
  (_before, saved, input) =>
    `Edited the job ${input.job_id} of ${label(saved)}.`,
);

export const peopleRemoveJob = resumeTool(
  {
    name: "people_remove_job",
    description: "Removes a job from a person's resume.",
    inputSchema: object({ id: ID, job_id: JOB_ID }),
  },
  (resume, person, input) => {
    const row = jobIndex(resume, person, input);
    return { resume: resume.filter((_, i) => i !== row) };
  },
  (_before, saved, input) =>
    `Removed the job ${input.job_id} from ${label(saved)}.`,
);

export const peopleTools = [
  peopleList,
  peopleRead,
  peopleOpen,
  peopleCreate,
  peopleEdit,
  peopleDelete,
  peopleAddJob,
  peopleEditJob,
  peopleRemoveJob,
];
