import { invoke } from "@tauri-apps/api/core";

// Dates are "YYYY-MM-DD" or null. An empty place is unknown.
export const STAT_COUNT = 8;

// Each side is independent and can be blank.
export type Stats = { left: number | null; right: number | null }[];

// Everything about a character that the edit form sets.
export type CharacterFields = {
  name: string;
  birthDate: string | null;
  birthCity: string;
  birthCountry: string;
  deathDate: string | null;
  deathCity: string;
  deathCountry: string;
  stats: Stats;
  description: string;
};

export type Character = CharacterFields & {
  id: string;
  // The file name in the app's photos folder, or null.
  photo: string | null;
};

// `meId` is this device's character, or null.
export type People = { characters: Character[]; meId: string | null };

export type StatName = { left: string; right: string };

export type World = { gameDate: string; statNames: StatName[] };

// Rejects with a message when a file is damaged; the file is left as it is.
export const listPeople = () => invoke<People>("people_list");

// The name is trimmed. Rejects with a message for an empty name, a date that
// doesn't exist or a death date before the birth date.
export const createPerson = (fields: CharacterFields) =>
  invoke<Character>("people_create", { fields });

// Replaces every field. The id and photo stay.
export const updatePerson = (id: string, fields: CharacterFields) =>
  invoke<Character>("people_update", { id, fields });

// Deletes the character and its photo. Rejects for this device's character.
export const deletePerson = (id: string) =>
  invoke<void>("people_delete", { id });

// Makes the character this device's character. Rejects for a dead character.
export const setMe = (id: string) => invoke<void>("people_set_me", { id });

// Leaves this device with no character. The character stays in the list.
export const clearMe = () => invoke<void>("people_clear_me");

// Opens the image picker. Resolves to the picked file's path, or null on
// Cancel.
export const choosePhoto = () => invoke<string | null>("people_choose_photo");

// Copies the image at `source` into the photos folder and replaces the old
// photo.
export const setPhoto = (id: string, source: string) =>
  invoke<Character>("people_set_photo", { id, source });

// The bytes of the character's photo. Rejects when it has none.
export const readPhoto = (id: string) =>
  invoke<ArrayBuffer>("people_read_photo", { id });

export const getWorld = () => invoke<World>("world_get");

// Saves the full World together. Blank stat labels keep their saved values.
export const updateWorld = (world: World) =>
  invoke<World>("world_update", { world });
