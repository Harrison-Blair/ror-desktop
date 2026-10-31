import {
  ArrowDown,
  ArrowUp,
  LayoutGrid,
  Menu as Rows,
  Search,
} from "lucide-react";
import type { Dispatch, ReactNode, SetStateAction } from "react";
import {
  ageOf,
  birthplace,
  cardDateLine,
  compareAge,
  isDead,
  isPlayer,
  placeLine,
} from "@/lib/people";
import type { Character } from "@/lib/peopleApi";
import styles from "./PeopleMenu.module.css";
import { PersonPhoto } from "./PersonPhoto";
import { MineStar } from "./parts";

type SortKey = "name" | "birthplace" | "age";
type SortDir = "asc" | "desc";
type Filter = "all" | "players" | "npcs";

// How the list is shown. Kept by the caller so it outlasts a visit to a
// sheet.
export type ListPrefs = {
  view: "cards" | "table";
  filter: Filter;
  search: string;
  sortKey: SortKey;
  sortDir: SortDir;
};

export const DEFAULT_PREFS: ListPrefs = {
  view: "cards",
  filter: "all",
  search: "",
  sortKey: "name",
  sortDir: "asc",
};

// The cards sort by name or age only.
const CARD_KEYS: SortKey[] = ["name", "age"];

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "players", label: "Players" },
  { id: "npcs", label: "NPCs" },
];

const COLUMNS: { key: SortKey; label: string }[] = [
  { key: "name", label: "Name" },
  { key: "birthplace", label: "Birthplace" },
  { key: "age", label: "Age" },
];

const byName = (a: Character, b: Character) => a.name.localeCompare(b.name);

// Your character first, then by `key`; people with no age or no birthplace
// last in both directions; ties by name.
function sorted(
  people: Character[],
  meId: string | null,
  key: SortKey,
  dir: SortDir,
  gameDate: string,
) {
  const sign = dir === "asc" ? 1 : -1;
  const compare = (a: Character, b: Character) => {
    const mine = Number(isPlayer(b, meId)) - Number(isPlayer(a, meId));
    if (mine) return mine;
    let order = 0;
    if (key === "name") order = sign * byName(a, b);
    if (key === "age") order = compareAge(a, b, gameDate, dir);
    if (key === "birthplace") {
      const x = birthplace(a);
      const y = birthplace(b);
      order = !x || !y ? Number(!x) - Number(!y) : sign * x.localeCompare(y);
    }
    return order || byName(a, b);
  };
  return [...people].sort(compare);
}

export type PeopleListProps = {
  people: Character[];
  meId: string | null;
  gameDate: string;
  photoVersion: number;
  prefs: ListPrefs;
  setPrefs: Dispatch<SetStateAction<ListPrefs>>;
  onOpen: (id: string) => void;
  addButton: ReactNode;
};

export function PeopleList({
  people,
  meId,
  gameDate,
  photoVersion,
  prefs,
  setPrefs,
  onOpen,
  addButton,
}: PeopleListProps) {
  const set = (change: Partial<ListPrefs>) =>
    setPrefs((prev) => ({ ...prev, ...change }));
  const cards = prefs.view === "cards";
  const key =
    cards && !CARD_KEYS.includes(prefs.sortKey) ? "name" : prefs.sortKey;

  // Until sync, the name is all there is to match: no player names are known.
  const query = prefs.search.trim().toLowerCase();
  const found = people.filter(
    (p) => !query || p.name.toLowerCase().includes(query),
  );
  const inFilter = (p: Character, filter: Filter) =>
    filter === "all" || (filter === "players") === isPlayer(p, meId);
  const rows = sorted(
    found.filter((p) => inFilter(p, prefs.filter)),
    meId,
    key,
    prefs.sortDir,
    gameDate,
  );
  // No one but your character: the list invites you to add people.
  const noOthers = people.every((p) => isPlayer(p, meId));

  const flipDir = () =>
    set({ sortDir: prefs.sortDir === "asc" ? "desc" : "asc" });
  const dirLabel = prefs.sortDir === "asc" ? "Ascending" : "Descending";
  const DirIcon = prefs.sortDir === "asc" ? ArrowUp : ArrowDown;

  let body: ReactNode;
  if (rows.length === 0 && !(noOthers && !query && prefs.filter === "all")) {
    body = (
      <div className={styles.empty}>
        <p>
          {query
            ? `No one matches “${prefs.search.trim()}”.`
            : "No one in this view."}
        </p>
        {query && (
          <button
            type="button"
            className={styles.link}
            onClick={() => set({ search: "" })}
          >
            Clear search
          </button>
        )}
      </div>
    );
  } else if (rows.length === 0) {
    body = null;
  } else if (cards) {
    body = (
      <div className={styles.grid}>
        {rows.map((p) => {
          const dates = cardDateLine(p, gameDate);
          const places = placeLine(p);
          return (
            <button
              key={p.id}
              type="button"
              className={[
                styles.card,
                isPlayer(p, meId) && styles.mine,
                isDead(p) && styles.dead,
              ]
                .filter(Boolean)
                .join(" ")}
              onClick={() => onOpen(p.id)}
            >
              <PersonPhoto
                person={p}
                photoVersion={photoVersion}
                className={styles.cardPhoto}
              />
              <span className={styles.cardBody}>
                <span className={styles.cardName}>
                  <span className={styles.clip}>{p.name}</span>
                  {isPlayer(p, meId) && <MineStar />}
                </span>
                {dates && <span className={styles.cardLine}>{dates}</span>}
                {places && (
                  <span
                    className={`${styles.cardLine} ${styles.clip}`}
                    title={places}
                  >
                    {places}
                  </span>
                )}
              </span>
            </button>
          );
        })}
      </div>
    );
  } else {
    body = (
      <table className={styles.table} aria-label="People of interest">
        <thead>
          <tr className={`${styles.tr} ${styles.thead}`}>
            {COLUMNS.map((column) => {
              const on = prefs.sortKey === column.key;
              return (
                <th
                  key={column.key}
                  className={styles.th}
                  aria-sort={
                    on
                      ? prefs.sortDir === "asc"
                        ? "ascending"
                        : "descending"
                      : "none"
                  }
                >
                  <button
                    type="button"
                    className={styles.sortButton}
                    onClick={() =>
                      set({
                        sortKey: column.key,
                        sortDir: on && prefs.sortDir === "asc" ? "desc" : "asc",
                      })
                    }
                  >
                    {column.label}
                    {on && <DirIcon size={14} strokeWidth={1.75} aria-hidden />}
                  </button>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => {
            const place = birthplace(p);
            return (
              // A click anywhere in the row opens the sheet. Keyboard users
              // open it with the name button, whose click reaches the row.
              <tr
                key={p.id}
                onClick={() => onOpen(p.id)}
                className={[
                  styles.tr,
                  isPlayer(p, meId) && styles.mine,
                  isDead(p) && styles.dead,
                ]
                  .filter(Boolean)
                  .join(" ")}
              >
                <td className={styles.cell}>
                  <button type="button" className={styles.nameButton}>
                    <PersonPhoto
                      person={p}
                      photoVersion={photoVersion}
                      className={styles.avatar}
                    />
                    <span className={`${styles.rowName} ${styles.clip}`}>
                      {p.name}
                    </span>
                    {isPlayer(p, meId) && <MineStar />}
                  </button>
                </td>
                <td className={styles.cell} title={place}>
                  {place}
                </td>
                <td className={`${styles.cell} ${styles.mono}`}>
                  {ageOf(p, gameDate) ?? ""}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    );
  }

  return (
    <>
      <div className={styles.top}>
        <h1 className={styles.h1}>People of interest</h1>
        <div className={styles.spacer} />
        <fieldset className={styles.segments} aria-label="View">
          <button
            type="button"
            className={`${styles.segment} ${styles.iconSegment}`}
            aria-pressed={cards}
            aria-label="Cards"
            title="Cards"
            onClick={() => set({ view: "cards" })}
          >
            <LayoutGrid size={16} strokeWidth={1.75} aria-hidden />
          </button>
          <button
            type="button"
            className={`${styles.segment} ${styles.iconSegment}`}
            aria-pressed={!cards}
            aria-label="Table"
            title="Table"
            onClick={() => set({ view: "table" })}
          >
            <Rows size={16} strokeWidth={1.75} aria-hidden />
          </button>
        </fieldset>
        {addButton}
      </div>
      <div className={styles.top}>
        <fieldset className={styles.segments} aria-label="Show">
          {FILTERS.map((filter) => (
            <button
              key={filter.id}
              type="button"
              className={styles.segment}
              aria-pressed={prefs.filter === filter.id}
              onClick={() => set({ filter: filter.id })}
            >
              {filter.label}
              <span className={styles.count}>
                {found.filter((p) => inFilter(p, filter.id)).length}
              </span>
            </button>
          ))}
        </fieldset>
        <label className={styles.search}>
          <Search size={16} strokeWidth={1.75} aria-hidden />
          <input
            type="search"
            placeholder="Search people"
            aria-label="Search people"
            value={prefs.search}
            onChange={(e) => set({ search: e.target.value })}
          />
        </label>
        {cards && (
          <>
            <div className={styles.spacer} />
            <label className={styles.sortLabel}>
              Sort by
              <select
                className={styles.select}
                value={key}
                onChange={(e) => set({ sortKey: e.target.value as SortKey })}
              >
                <option value="name">Name</option>
                <option value="age">Age</option>
              </select>
            </label>
            <button
              type="button"
              className={`${styles.button} ${styles.quiet}`}
              aria-label={`${dirLabel}, change order`}
              onClick={flipDir}
            >
              <DirIcon size={16} strokeWidth={1.75} aria-hidden />
              {dirLabel}
            </button>
          </>
        )}
      </div>
      {body}
      {noOthers && !query && prefs.filter === "all" && (
        <div className={styles.empty}>
          <p>
            {people.length === 0
              ? "No people yet. Add person creates a character that no player plays."
              : "No other people yet. Add person creates a character that no player plays."}
          </p>
          {addButton}
        </div>
      )}
    </>
  );
}
