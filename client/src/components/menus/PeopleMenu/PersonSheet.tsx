import { Pencil, Star, Trash2 } from "lucide-react";
import {
  ageOf,
  canClaim,
  canDelete,
  isPlayer,
  placeLine,
  sheetDateLine,
} from "@/lib/people";
import type { Character, StatName } from "@/lib/peopleApi";
import styles from "./PeopleMenu.module.css";
import { PersonPhoto } from "./PersonPhoto";
import { BackLink, MineStar, StatBar } from "./parts";

export type PersonSheetProps = {
  person: Character;
  meId: string | null;
  gameDate: string;
  statNames: StatName[];
  photoVersion: number;
  onBack: () => void;
  onClaim: () => void;
  onUnclaim: () => void;
  onEdit: () => void;
  onDelete: () => void;
};

export function PersonSheet({
  person,
  meId,
  gameDate,
  statNames,
  photoVersion,
  onBack,
  onClaim,
  onUnclaim,
  onEdit,
  onDelete,
}: PersonSheetProps) {
  const age = ageOf(person, gameDate);
  const dates = sheetDateLine(person);
  const places = placeLine(person);
  return (
    <div className={styles.sheet}>
      <div className={styles.sheetBar}>
        <BackLink onClick={onBack} />
        <div className={styles.actions}>
          {canClaim(person, meId) && (
            <button
              type="button"
              className={styles.starButton}
              aria-label="This is me"
              title="This is me"
              onClick={onClaim}
            >
              <Star size={20} strokeWidth={1.75} aria-hidden />
            </button>
          )}
          {isPlayer(person, meId) && (
            <button
              type="button"
              className={styles.starButton}
              aria-label="Not my character"
              title="Not my character"
              onClick={onUnclaim}
            >
              <Star
                size={20}
                strokeWidth={1.75}
                fill="currentColor"
                aria-hidden
              />
            </button>
          )}
          <button
            type="button"
            className={`${styles.button} ${styles.quiet}`}
            onClick={onEdit}
          >
            <Pencil size={16} strokeWidth={1.75} aria-hidden />
            Edit
          </button>
          {canDelete(person, meId) && (
            <button
              type="button"
              className={`${styles.button} ${styles.danger}`}
              aria-label={`Delete ${person.name}`}
              onClick={onDelete}
            >
              <Trash2 size={16} strokeWidth={1.75} aria-hidden />
              Delete
            </button>
          )}
        </div>
      </div>
      <div className={styles.sheetHead}>
        <h1 className={styles.sheetName}>
          {person.name}
          {age !== null && <span className={styles.sheetAge}>({age})</span>}
          {isPlayer(person, meId) && <MineStar size={20} />}
        </h1>
        {dates && <p className={styles.sheetLine}>{dates}</p>}
        {places && (
          <p className={`${styles.sheetLine} ${styles.clip}`} title={places}>
            {places}
          </p>
        )}
      </div>
      <div className={styles.sheetBody}>
        <PersonPhoto
          person={person}
          photoVersion={photoVersion}
          className={styles.portrait}
        />
        <section className={styles.stats} aria-labelledby="sheet-stats">
          <h2 id="sheet-stats" className={styles.h3}>
            Stats
          </h2>
          {statNames.map((name, i) => {
            const value = person.stats[i] ?? null;
            return (
              // The pairs are fixed in number and order.
              // biome-ignore lint/suspicious/noArrayIndexKey: see above
              <div key={i} className={styles.pair}>
                <span className={styles.statName}>{name.left}</span>
                <span className={`${styles.statValue} ${styles.mono}`}>
                  {value ?? ""}
                </span>
                <StatBar value={value} />
                <span className={styles.mono}>
                  {value === null ? "" : 100 - value}
                </span>
                <span className={`${styles.statName} ${styles.right}`}>
                  {name.right}
                </span>
              </div>
            );
          })}
        </section>
      </div>
      <section className={styles.section} aria-labelledby="sheet-description">
        <h2 id="sheet-description" className={styles.h3}>
          Description
        </h2>
        <p className={styles.description}>{person.description}</p>
      </section>
    </div>
  );
}
