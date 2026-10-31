// The chat agent's People of interest tools. They use the same commands as
// the People screens and check the fields with the form's rules, so the agent
// gets the form's error messages.

import type { Tool, ToolPreview } from "@/lib/chat/registry";
import { lineDiff } from "@/lib/diff";
import {
  ageOf,
  canDelete,
  hasErrors,
  isDead,
  isPlayer,
  parseDate,
  placeLine,
  sheetDateLine,
  validateForm,
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
  birth_country: PLACE("country of birth"),
  death_date: DATE("death date. A date makes the person dead"),
  death_city: PLACE("city of death"),
  death_country: PLACE("country of death"),
  stats: {
    type: "array",
    items: { type: ["integer", "null"] },
    minItems: STAT_COUNT,
    maxItems: STAT_COUNT,
    description: `All ${STAT_COUNT} stats in order: the left value of each pair, a whole number from 0 to 100 (the right value is 100 minus it), or null when the pair is not set. people_read shows the stat names.`,
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
  birth_country: "birthCountry",
  death_date: "deathDate",
  death_city: "deathCity",
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

// The edit form as typed, made from stored fields: the form's rules check it.
type Draft = Omit<CharacterFields, "birthDate" | "deathDate" | "stats"> & {
  birthDate: string;
  deathDate: string;
  stats: string[];
};

const toDraft = (fields: CharacterFields): Draft => ({
  ...fields,
  birthDate: fields.birthDate ?? "",
  deathDate: fields.deathDate ?? "",
  stats: fields.stats.map((s) => (s === null ? "" : String(s))),
});

// Puts the input's fields onto the draft. Types are checked here; values by
// the form's rules after.
function applyInput(draft: Draft, input: Record<string, unknown>): Draft {
  const next = { ...draft };
  for (const [name, key] of Object.entries(INPUT_OF)) {
    if (input[name] === undefined) continue;
    next[key as Exclude<keyof Draft, "stats">] = text(input, name);
  }
  if (input.stats !== undefined) {
    const stats = input.stats;
    if (
      !Array.isArray(stats) ||
      stats.length !== STAT_COUNT ||
      stats.some((s) => s !== null && typeof s !== "number")
    ) {
      throw new Error(
        `stats must be a list of ${STAT_COUNT} items, each a number or null.`,
      );
    }
    next.stats = stats.map((s) => (s === null ? "" : String(s)));
  }
  return next;
}

const dateOf = (typed: string) => {
  const parsed = parseDate(typed);
  return typed.trim() && "date" in parsed ? parsed.date : null;
};

// The fields to save, or the form's errors as one message the agent can act
// on.
function checkedFields(draft: Draft, gameDate: string): CharacterFields {
  const errors = validateForm(draft, gameDate);
  if (hasErrors(errors)) {
    const lines = [
      errors.name && `name: ${errors.name}`,
      errors.birthDate && `birth_date: ${errors.birthDate}`,
      errors.deathDate && `death_date: ${errors.deathDate}`,
      ...errors.stats.map((e, i) => e && `stats item ${i + 1}: ${e}`),
    ].filter(Boolean);
    throw new Error(
      `Not saved. Fix these fields and try again:\n${lines.join("\n")}`,
    );
  }
  return {
    name: draft.name.trim(),
    birthDate: dateOf(draft.birthDate),
    birthCity: draft.birthCity.trim(),
    birthCountry: draft.birthCountry.trim(),
    deathDate: dateOf(draft.deathDate),
    deathCity: draft.deathCity.trim(),
    deathCountry: draft.deathCountry.trim(),
    stats: draft.stats.map((s) => (s.trim() ? Number(s) : null)),
    description: draft.description,
  };
}

const EMPTY: CharacterFields = {
  name: "",
  birthDate: null,
  birthCity: "",
  birthCountry: "",
  deathDate: null,
  deathCity: "",
  deathCountry: "",
  stats: Array(STAT_COUNT).fill(null),
  description: "",
};

// The full sheet as text, for people_read and the approval card.
function sheet(
  fields: CharacterFields,
  statNames: StatName[],
  gameDate: string,
) {
  const age = ageOf(fields, gameDate);
  const or = (value: string | null, none = "unknown") => value || none;
  return [
    `Name: ${fields.name}`,
    `Birth date: ${or(fields.birthDate)}`,
    `Birth city: ${or(fields.birthCity)}`,
    `Birth country: ${or(fields.birthCountry)}`,
    `Death date: ${or(fields.deathDate, "none (alive)")}`,
    `Death city: ${or(fields.deathCity)}`,
    `Death country: ${or(fields.deathCountry)}`,
    `Age: ${age === null ? "unknown" : age}`,
    "Stats (left value / right value):",
    ...fields.stats.map((value, i) => {
      const names = statNames[i] ?? { left: "?", right: "?" };
      return value === null
        ? `${i + 1}. ${names.left} / ${names.right}: not set`
        : `${i + 1}. ${names.left} ${value} / ${names.right} ${100 - value}`;
    }),
    "Description:",
    fields.description || "(none)",
  ].join("\n");
}

const fieldsOf = ({ id, photo, ...fields }: Character): CharacterFields =>
  fields;

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
    "Returns a person's full sheet: every field, the stats with their names, and the description. Dates are YYYY-MM-DD.",
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
  const fields = checkedFields(applyInput(toDraft(EMPTY), input), gameDate);
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
    applyInput(toDraft(fieldsOf(person)), input),
    world.gameDate,
  );
  return { person, after, world };
}

export const peopleEdit: Tool = {
  name: "people_edit",
  description:
    "Changes a person's fields. Give only the fields to change; the others stay.",
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

export const peopleTools = [
  peopleList,
  peopleRead,
  peopleOpen,
  peopleCreate,
  peopleEdit,
  peopleDelete,
];
