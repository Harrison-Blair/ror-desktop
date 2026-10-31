import { vi } from "vitest";
import type {
  Character,
  CharacterFields,
  People,
  StatName,
  World,
} from "@/lib/peopleApi";

// An in-memory stand-in for the Rust people and world commands
// (src-tauri/src/world.rs), with their refusals and messages. Use it with
//   vi.mock("@/lib/peopleApi", async () => (await import("@/test/fakePeople")).mockModule());

const DEFAULT_NAMES: StatName[] = Array.from({ length: 7 }, (_, i) => ({
  left: `[Stat ${i + 1}A]`,
  right: `[Stat ${i + 1}B]`,
}));

type Store = {
  characters: Character[];
  meId: string | null;
  world: World;
  // Bytes by character id.
  photos: Map<string, ArrayBuffer>;
  // A damaged file makes its commands fail with this message.
  damaged: { characters?: string; world?: string; config?: string };
  // What the photo picker returns next.
  pick: string | null;
  nextId: number;
};

const fresh = (): Store => ({
  characters: [],
  meId: null,
  world: { gameDate: "1962-02-10", statNames: DEFAULT_NAMES },
  photos: new Map(),
  damaged: {},
  pick: null,
  nextId: 1,
});

export const store: Store = fresh();

export const resetPeople = () => {
  Object.assign(store, fresh());
};

// A character with every field empty but the name; `extra` overrides.
export const character = (
  name: string,
  extra: Partial<Character> = {},
): Character => ({
  id: name.toLowerCase().replace(/\W+/g, "-"),
  name,
  birthDate: null,
  birthCity: "",
  birthCountry: "",
  deathDate: null,
  deathCity: "",
  deathCountry: "",
  stats: Array(7).fill(null),
  description: "",
  photo: null,
  ...extra,
});

const copy = <T>(value: T): T => structuredClone(value);

const charactersOk = () => {
  if (store.damaged.characters) throw store.damaged.characters;
};

const configOk = () => {
  if (store.damaged.config) throw store.damaged.config;
};

const checked = (fields: CharacterFields): CharacterFields => {
  const name = fields.name.trim();
  if (!name) throw "Enter a name.";
  if (
    fields.birthDate &&
    fields.deathDate &&
    fields.deathDate < fields.birthDate
  ) {
    throw "Death date is before the birth date.";
  }
  if (fields.stats.some((s) => s !== null && (s < 0 || s > 100))) {
    throw "Use a whole number from 0 to 100.";
  }
  return {
    ...fields,
    name,
    birthCity: fields.birthCity.trim(),
    birthCountry: fields.birthCountry.trim(),
    deathCity: fields.deathCity.trim(),
    deathCountry: fields.deathCountry.trim(),
  };
};

const find = (id: string) => {
  const found = store.characters.find((c) => c.id === id);
  if (!found) throw "That character isn't in the list.";
  return found;
};

export const api = {
  listPeople: vi.fn(async (): Promise<People> => {
    charactersOk();
    configOk();
    const known = store.characters.some((c) => c.id === store.meId);
    return copy({
      characters: store.characters,
      meId: known ? store.meId : null,
    });
  }),
  createPerson: vi.fn(async (fields: CharacterFields) => {
    charactersOk();
    const made: Character = {
      ...checked(fields),
      id: `person-${store.nextId++}`,
      photo: null,
    };
    store.characters.push(made);
    return copy(made);
  }),
  updatePerson: vi.fn(async (id: string, fields: CharacterFields) => {
    charactersOk();
    const old = find(id);
    const next = { ...checked(fields), id, photo: old.photo };
    store.characters = store.characters.map((c) => (c.id === id ? next : c));
    return copy(next);
  }),
  deletePerson: vi.fn(async (id: string) => {
    charactersOk();
    configOk();
    find(id);
    if (id === store.meId) throw "You can't delete your own character.";
    store.characters = store.characters.filter((c) => c.id !== id);
    store.photos.delete(id);
  }),
  setMe: vi.fn(async (id: string) => {
    charactersOk();
    configOk();
    if (find(id).deathDate !== null) {
      throw "A dead character can't be your character.";
    }
    store.meId = id;
  }),
  choosePhoto: vi.fn(async () => store.pick),
  setPhoto: vi.fn(async (id: string, source: string) => {
    charactersOk();
    const ext = source.slice(source.lastIndexOf(".") + 1).toLowerCase();
    const old = find(id);
    const next = { ...old, photo: `${id}.${ext}` };
    store.characters = store.characters.map((c) => (c.id === id ? next : c));
    store.photos.set(id, new TextEncoder().encode(source).buffer);
    return copy(next);
  }),
  readPhoto: vi.fn(async (id: string) => {
    const bytes = store.photos.get(id);
    if (!bytes) throw "This character has no photo.";
    return bytes;
  }),
  getWorld: vi.fn(async () => {
    if (store.damaged.world) throw store.damaged.world;
    return copy(store.world);
  }),
  setGameDate: vi.fn(async (date: string) => {
    if (store.damaged.world) throw store.damaged.world;
    store.world = { ...store.world, gameDate: date };
    return copy(store.world);
  }),
  setStatNames: vi.fn(async (names: StatName[]) => {
    if (store.damaged.world) throw store.damaged.world;
    store.world = {
      ...store.world,
      statNames: names.map((n, i) => ({
        left: n.left.trim() || store.world.statNames[i].left,
        right: n.right.trim() || store.world.statNames[i].right,
      })),
    };
    return copy(store.world);
  }),
};

export const mockModule = async () => ({
  ...(await vi.importActual<typeof import("@/lib/peopleApi")>(
    "@/lib/peopleApi",
  )),
  ...api,
});
