import { Pencil, Star, Trash2 } from "lucide-react";
import {
  DescriptionField,
  type Pending,
  ResumeRows,
  type SaveCharacter,
  type SheetSection,
  TopFields,
  usePersonDraft,
} from "@/components/forms/PersonForm/PersonFields";
import {
  ageOf,
  canClaim,
  canDelete,
  isPlayer,
  occupationLine,
  placeLine,
  resumeDateText,
  sheetDateLine,
  sortResume,
} from "@/lib/people";
import type { Character, StatName } from "@/lib/peopleApi";
import styles from "./PeopleMenu.module.css";
import { PersonPhoto } from "./PersonPhoto";
import { BackLink, MineStar } from "./parts";

export type { SheetSection };

export type PersonSheetProps = {
  person: Character;
  meId: string | null;
  gameDate: string;
  statNames: StatName[];
  photoVersion: number;
  // The open section, if any.
  editing?: SheetSection;
  // An unsaved photo for the open top section.
  pending?: Pending;
  onBack?: () => void;
  onClaim?: () => void;
  onUnclaim?: () => void;
  onEdit: (section: SheetSection) => void;
  onCancelEdit: () => void;
  onDirty?: (dirty: boolean) => void;
  onSave: SaveCharacter;
  onDelete: () => void;
};

const PENCIL_LABELS: Record<SheetSection, string> = {
  top: "Edit details",
  description: "Edit description",
  resume: "Edit resume",
};

export function PersonSheet({
  person,
  meId,
  gameDate,
  statNames,
  photoVersion,
  editing,
  pending,
  onBack,
  onClaim,
  onUnclaim,
  onEdit,
  onCancelEdit,
  onDirty,
  onSave,
  onDelete,
}: PersonSheetProps) {
  const age = ageOf(person, gameDate);
  const dates = sheetDateLine(person);
  const places = placeLine(person);
  const occupation = occupationLine(person, gameDate);
  // While a section is open, the other pencils wait.
  const pencil = (section: SheetSection) => (
    <button
      type="button"
      className={styles.iconButton}
      aria-label={PENCIL_LABELS[section]}
      title={PENCIL_LABELS[section]}
      disabled={editing !== undefined}
      onClick={() => onEdit(section)}
    >
      <Pencil size={16} strokeWidth={1.75} aria-hidden />
    </button>
  );
  const editor = (section: SheetSection) => (
    <SectionEditor
      section={section}
      person={person}
      statNames={statNames}
      photoVersion={photoVersion}
      pending={pending}
      onCancel={onCancelEdit}
      onDirty={onDirty}
      onSave={onSave}
    />
  );
  const jobs = sortResume(person.resume);

  // An open section blocks every other action until Save or Cancel.
  const star = (claim: boolean, onClick: () => void) => {
    const label = claim ? "This is me" : "Not my character";
    return (
      <button
        type="button"
        className={styles.starButton}
        aria-label={label}
        title={label}
        disabled={editing !== undefined}
        onClick={onClick}
      >
        <Star
          size={20}
          strokeWidth={1.75}
          fill={claim ? "none" : "currentColor"}
          aria-hidden
        />
      </button>
    );
  };
  const mine = isPlayer(person, meId);
  // Outside the heading, so that its name stays the person's name and age.
  const starButton =
    onClaim && canClaim(person, meId)
      ? star(true, onClaim)
      : onUnclaim && mine
        ? star(false, onUnclaim)
        : null;
  const back = onBack && (
    <BackLink onClick={onBack} disabled={editing !== undefined} />
  );
  const remove = canDelete(person, meId) && (
    <button
      type="button"
      className={`${styles.button} ${styles.danger}`}
      aria-label={`Delete ${person.name}`}
      disabled={editing !== undefined}
      onClick={onDelete}
    >
      <Trash2 size={16} strokeWidth={1.75} aria-hidden />
      Delete
    </button>
  );

  return (
    <div className={styles.sheet}>
      {/* Only with a control in it: an empty bar would push the name down. */}
      {(back || remove) && (
        <div className={styles.sheetBar}>
          {back}
          {remove && <div className={styles.actions}>{remove}</div>}
        </div>
      )}
      {editing === "top" ? (
        editor("top")
      ) : (
        <>
          <div className={styles.sheetHead}>
            <div className={styles.sectionHead}>
              <div className={styles.nameRow}>
                <h1 className={styles.sheetName}>
                  {person.name}
                  {age !== null && (
                    <span className={styles.sheetAge}>({age})</span>
                  )}
                  {/* The embedded sheet can't unclaim: a plain star. */}
                  {mine && !starButton && <MineStar size={20} />}
                </h1>
                {starButton}
              </div>
              {pencil("top")}
            </div>
            {/* Wraps: only the card and the table clip the occupation. */}
            {occupation && (
              <p className={`${styles.sheetLine} ${styles.wrap}`}>
                {occupation}
              </p>
            )}
            {dates && <p className={styles.sheetLine}>{dates}</p>}
            {places && (
              <p
                className={`${styles.sheetLine} ${styles.clip}`}
                title={places}
              >
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
              {statNames.map((name, i) => (
                // The pairs are fixed in number and order.
                // biome-ignore lint/suspicious/noArrayIndexKey: see above
                <div key={i} className={styles.pair}>
                  {(["left", "right"] as const).map((side) => (
                    <div key={side} className={styles.sheetStat}>
                      <span className={styles.statName}>{name[side]}</span>
                      <span className={styles.mono}>
                        {person.stats[i]?.[side] ?? ""}
                      </span>
                    </div>
                  ))}
                </div>
              ))}
            </section>
          </div>
        </>
      )}
      {editing === "description" ? (
        editor("description")
      ) : (
        <section className={styles.section} aria-labelledby="sheet-description">
          <div className={styles.sectionHead}>
            <h2 id="sheet-description" className={styles.h3}>
              Description
            </h2>
            {pencil("description")}
          </div>
          <p className={styles.description}>{person.description}</p>
        </section>
      )}
      {editing === "resume" ? (
        editor("resume")
      ) : (
        <section className={styles.section} aria-labelledby="sheet-resume">
          <div className={styles.sectionHead}>
            <h2 id="sheet-resume" className={styles.h3}>
              Resume
            </h2>
            {pencil("resume")}
          </div>
          {jobs.length === 0 ? (
            <p className={styles.noJobs}>No jobs.</p>
          ) : (
            <ul className={styles.jobs} aria-label="Jobs, newest first">
              {jobs.map((job) => (
                <li key={job.id} className={styles.job}>
                  <span className={styles.jobHead}>
                    <span className={styles.jobTitle}>{job.job}</span>
                    {job.employer && (
                      <span className={styles.jobEmployer}>
                        {" "}
                        · {job.employer}
                      </span>
                    )}
                  </span>
                  <span className={styles.jobDates}>
                    {resumeDateText(job, person.deathDate)}
                  </span>
                  {job.description && (
                    <p className={styles.jobDescription}>{job.description}</p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}

// One open section with Cancel and Save. It edits a draft of the whole
// person, so Save sends every field.
function SectionEditor({
  section,
  person,
  statNames,
  photoVersion,
  pending,
  onCancel,
  onDirty,
  onSave,
}: {
  section: SheetSection;
  person: Character;
  statNames: StatName[];
  photoVersion: number;
  pending?: Pending;
  onCancel: () => void;
  onDirty?: (dirty: boolean) => void;
  onSave: SaveCharacter;
}) {
  const { draft, setDraft, errors, busy, save } = usePersonDraft({
    person,
    section,
    pending,
    onDirty,
    onSave,
  });
  const pieces = { draft, setDraft, errors, busy };
  const buttons = (
    <div className={styles.sectionButtons}>
      <button
        type="button"
        className={`${styles.button} ${styles.quiet} ${styles.small}`}
        disabled={busy}
        onClick={onCancel}
      >
        Cancel
      </button>
      <button
        type="button"
        className={`${styles.button} ${styles.small}`}
        disabled={busy}
        onClick={save}
      >
        Save
      </button>
    </div>
  );

  if (section === "top") {
    return (
      <div className={`${styles.open} ${styles.openTop}`}>
        <div className={styles.sectionHead}>
          <span className={styles.editing}>
            Editing · Name, dates, places, photo and stats
          </span>
          {buttons}
        </div>
        <TopFields
          {...pieces}
          person={person}
          statNames={statNames}
          photoVersion={photoVersion}
        />
      </div>
    );
  }
  const heading = section === "description" ? "Description" : "Resume";
  return (
    <section
      className={`${styles.section} ${styles.open}`}
      aria-label={`Editing ${heading.toLowerCase()}`}
    >
      <div className={styles.sectionHead}>
        <h2 className={styles.h3}>{heading}</h2>
        {buttons}
      </div>
      {section === "description" ? (
        <DescriptionField {...pieces} label="Description" />
      ) : (
        <ResumeRows {...pieces} />
      )}
    </section>
  );
}
