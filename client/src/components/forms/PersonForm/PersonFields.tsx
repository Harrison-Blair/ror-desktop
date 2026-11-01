import { Plus, Trash2, UserRound } from "lucide-react";
import {
  type Dispatch,
  type SetStateAction,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import styles from "@/components/menus/PeopleMenu/PeopleMenu.module.css";
import { PersonPhoto } from "@/components/menus/PeopleMenu/PersonPhoto";
import { useToast } from "@/components/Toast/Toast";
import { errorMessage } from "@/lib/errorMessage";
import {
  type CharacterDraft,
  characterDraftToFields,
  characterToDraft,
  type FormErrors,
  formatBoxDate,
  formatJobBoxDate,
  type JobDraft,
  jobToDraft,
  parseDate,
  parseJobDate,
  sortResume,
  validateForm,
} from "@/lib/people";
import {
  type Character,
  type CharacterFields,
  choosePhoto,
  type StatName,
} from "@/lib/peopleApi";

// The pieces of the Add form and the sheet's section editors.

export type Draft = CharacterDraft & {
  // The path of a newly picked photo, saved with the person.
  photo: string | null;
};

type SetDraft = Dispatch<SetStateAction<Draft>>;

type TextField = Exclude<keyof CharacterDraft, "stats" | "resume">;

// The resume rows follow the sheet: newest start first.
const toDraft = (person?: Character): Draft => ({
  ...characterToDraft(
    person && { ...person, resume: sortResume(person.resume) },
  ),
  photo: null,
});

const NO_ERRORS: FormErrors = { stats: [] };

const fileName = (path: string) => path.slice(path.search(/[^/\\]*$/));

// A picked photo retained after the character fields were saved.
export type Pending = Pick<Draft, "photo">;

// Saves the full character. Tells if the photo was saved.
export type SaveCharacter = (
  fields: CharacterFields,
  photo: string | null,
) => Promise<{ photoSaved: boolean }>;

// The parts of a saved person's sheet that open for editing one at a time.
export type SheetSection = "top" | "description" | "resume";

// The draft fields that each section edits. The new photo goes with "top".
const SECTION_FIELDS: Record<SheetSection, (keyof CharacterDraft)[]> = {
  top: [
    "name",
    "birthDate",
    "birthCity",
    "birthState",
    "birthCountry",
    "deathDate",
    "deathCity",
    "deathState",
    "deathCountry",
    "stats",
  ],
  description: ["description"],
  resume: ["resume"],
};

// The fields of `draft` that `section` edits, with the new photo. Without a
// section, all of them.
const edited = (draft: Draft, section?: SheetSection): Partial<Draft> =>
  section
    ? {
        ...Object.fromEntries(
          SECTION_FIELDS[section].map((k) => [k, draft[k]]),
        ),
        photo: draft.photo,
      }
    : draft;

// The draft of a person, its errors and its save. Errors show after the
// first Save, then follow the typing. With a section, only that section's
// fields come from the draft: the rest come from `person` as it is now, so a
// change made elsewhere during the edit (by the chat agent, for example)
// is kept.
export function usePersonDraft({
  person,
  section,
  gameDate,
  pending,
  onDirty,
  onSave,
}: {
  // Undefined for a new person.
  person?: Character;
  // The open section of a saved person's sheet.
  section?: SheetSection;
  gameDate: string;
  // An unsaved photo to start with.
  pending?: Pending;
  // Called with true while the draft has unsaved changes.
  onDirty?: (dirty: boolean) => void;
  onSave: SaveCharacter;
}) {
  const [draft, setDraft] = useState(() => ({
    ...toDraft(person),
    ...pending,
  }));
  const [shown, setShown] = useState(false);
  const saving = useRef(false);
  // True while a save is pending: the draft can't be changed or left.
  const [busy, setBusy] = useState(false);
  // What Save sends: the latest person with the section's edits.
  const full: Draft = { ...toDraft(person), ...edited(draft, section) };
  const errors = shown ? validateForm(full, gameDate) : NO_ERRORS;
  // A pending save counts too, so leaving asks first.
  const dirty =
    busy ||
    JSON.stringify(edited(draft, section)) !==
      JSON.stringify(edited(toDraft(person), section));
  useEffect(() => {
    onDirty?.(dirty);
    return () => onDirty?.(false);
  }, [dirty, onDirty]);

  const save = async () => {
    if (saving.current) return;
    setShown(true);
    const result = characterDraftToFields(full, gameDate);
    if ("errors" in result) return;
    saving.current = true;
    setBusy(true);
    try {
      const { photoSaved } = await onSave(result.fields, full.photo);
      if (photoSaved) setDraft((d) => ({ ...d, photo: null }));
    } finally {
      saving.current = false;
      setBusy(false);
    }
  };

  return { draft, setDraft, errors, busy, save };
}

type FieldExtra = { placeholder?: string; onBlur?: () => void };

// A labelled text box with its error below.
function TextBox({
  id,
  label,
  value,
  error,
  busy,
  onChange,
  extra,
}: {
  id: string;
  label: string;
  value: string;
  error?: string;
  busy: boolean;
  onChange: (value: string) => void;
  extra?: FieldExtra;
}) {
  return (
    <div className={styles.field}>
      <label className={styles.fieldLabel} htmlFor={`${id}-box`}>
        {label}
      </label>
      <input
        id={`${id}-box`}
        className={`${styles.input} ${error ? styles.invalid : ""}`}
        type="text"
        value={value}
        aria-invalid={!!error}
        aria-describedby={error ? id : undefined}
        onChange={(e) => onChange(e.target.value)}
        disabled={busy}
        {...extra}
      />
      {error && (
        <span id={id} className={styles.fieldError}>
          {error}
        </span>
      )}
    </div>
  );
}

type PieceProps = {
  draft: Draft;
  setDraft: SetDraft;
  errors: FormErrors;
  busy: boolean;
};

// Name, dates, places, photo and stats.
export function TopFields({
  draft,
  setDraft,
  errors,
  busy,
  person,
  statNames,
  photoVersion,
}: PieceProps & {
  person?: Character;
  statNames: StatName[];
  photoVersion: number;
}) {
  const notify = useToast();
  const id = useId();
  const set = (field: TextField) => (value: string) =>
    setDraft((d) => ({ ...d, [field]: value }));
  // A valid date is rewritten as "21 January 1904".
  const tidyDate = (field: "birthDate" | "deathDate") => () =>
    setDraft((d) => {
      const parsed = parseDate(d[field]);
      return "date" in parsed
        ? { ...d, [field]: formatBoxDate(parsed.date) }
        : d;
    });
  const setStat = (i: number, side: "left" | "right", value: string) =>
    setDraft((d) => ({
      ...d,
      stats: d.stats.map((s, j) => (j === i ? { ...s, [side]: value } : s)),
    }));
  const pickPhoto = async () => {
    try {
      const path = await choosePhoto();
      if (path !== null) setDraft((d) => ({ ...d, photo: path }));
    } catch (e) {
      notify({ kind: "error", message: errorMessage(e) });
    }
  };
  const textField = (
    field: TextField,
    label: string,
    error?: string,
    extra?: FieldExtra,
  ) => (
    <TextBox
      id={`${id}-${field}`}
      label={label}
      value={draft[field]}
      error={error}
      busy={busy}
      onChange={set(field)}
      extra={extra}
    />
  );
  const dateExtra = (field: "birthDate" | "deathDate") => ({
    placeholder: "Day Month Year",
    onBlur: tidyDate(field),
  });
  const hasPhoto = draft.photo !== null || !!person?.photo;

  return (
    <>
      <div className={styles.form}>
        <div className={styles.wide}>
          {textField("name", "Name", errors.name)}
        </div>
      </div>
      <div className={`${styles.form} ${styles.places}`}>
        {textField(
          "birthDate",
          "Birth date",
          errors.birthDate,
          dateExtra("birthDate"),
        )}
        {textField("birthCity", "Birthplace city")}
        {textField("birthState", "Birthplace State / Province")}
        {textField("birthCountry", "Birthplace country")}
        {textField(
          "deathDate",
          "Death date (optional)",
          errors.deathDate,
          dateExtra("deathDate"),
        )}
        {textField("deathCity", "Death city (optional)")}
        {textField("deathState", "Death State / Province (optional)")}
        {textField("deathCountry", "Death country (optional)")}
      </div>
      <div className={styles.sheetBody}>
        <div className={styles.portraitColumn}>
          {person?.photo || draft.name.trim() ? (
            <PersonPhoto
              person={{
                id: person?.id ?? "",
                name: draft.name,
                photo: person?.photo ?? null,
              }}
              photoVersion={photoVersion}
              className={styles.portrait}
            />
          ) : (
            <span className={styles.portrait} aria-hidden="true">
              <UserRound size={64} strokeWidth={1.25} />
            </span>
          )}
          <button
            type="button"
            className={`${styles.button} ${styles.quiet} ${styles.small}`}
            disabled={busy}
            onClick={pickPhoto}
          >
            {hasPhoto ? "Change photo" : "Add photo"}
          </button>
          {draft.photo !== null && (
            <span className={styles.note} title={draft.photo}>
              New photo: {fileName(draft.photo)}
            </span>
          )}
        </div>
        <section className={styles.stats} aria-labelledby={`${id}-stats`}>
          <h2 id={`${id}-stats`} className={styles.h3}>
            Stats
          </h2>
          {statNames.map((name, i) => (
            // The pairs are fixed in number and order.
            // biome-ignore lint/suspicious/noArrayIndexKey: see above
            <div key={i} className={styles.pairEdit}>
              <div className={`${styles.pair} ${styles.editRow}`}>
                {(["left", "right"] as const).map((side) => {
                  const error = errors.stats[i]?.[side];
                  return (
                    <label key={side} className={styles.field}>
                      <span className={styles.statName}>{name[side]}</span>
                      <input
                        className={`${styles.input} ${styles.mono} ${error ? styles.invalid : ""}`}
                        type="text"
                        inputMode="text"
                        value={draft.stats[i][side]}
                        // The visible stat name, or the pair's place for a
                        // name left empty.
                        aria-label={`${name[side].trim() || `Stat ${i + 1} ${side}`} value`}
                        aria-invalid={!!error}
                        aria-describedby={
                          error ? `${id}-stat-${i}-${side}` : undefined
                        }
                        onChange={(e) => setStat(i, side, e.target.value)}
                        disabled={busy}
                      />
                      {error && (
                        <span
                          id={`${id}-stat-${i}-${side}`}
                          className={styles.fieldError}
                        >
                          {error}
                        </span>
                      )}
                    </label>
                  );
                })}
              </div>
            </div>
          ))}
        </section>
      </div>
    </>
  );
}

// The description box under its heading. With `label`, the box has that
// name and no heading: the section editor shows the heading itself.
export function DescriptionField({
  draft,
  setDraft,
  busy,
  label,
}: Omit<PieceProps, "errors"> & { label?: string }) {
  return (
    <label className={styles.field}>
      {label === undefined && <span className={styles.h3}>Description</span>}
      <textarea
        className={`${styles.input} ${styles.textarea}`}
        rows={4}
        value={draft.description}
        aria-label={label}
        onChange={(e) =>
          setDraft((d) => ({ ...d, description: e.target.value }))
        }
        disabled={busy}
      />
    </label>
  );
}

type JobField = Exclude<keyof JobDraft, "id">;

// The resume rows, with Add job above them.
export function ResumeRows({ draft, setDraft, errors, busy }: PieceProps) {
  const id = useId();
  // One key per row, in row order. Job ids can't be keys: new rows have "".
  const nextKey = useRef(0);
  const newKey = () => `row-${nextKey.current++}`;
  const [keys, setKeys] = useState(() => draft.resume.map(newKey));
  const setRow = (i: number, field: JobField, value: string) =>
    setDraft((d) => ({
      ...d,
      resume: d.resume.map((row, j) =>
        j === i ? { ...row, [field]: value } : row,
      ),
    }));
  // A date that reads is rewritten as "1950", "March 1950" or
  // "3 March 1950". Other text stays.
  const tidyDate = (i: number, field: "startDate" | "endDate") => () =>
    setDraft((d) => ({
      ...d,
      resume: d.resume.map((row, j) => {
        if (j !== i) return row;
        const parsed = parseJobDate(row[field]);
        return "date" in parsed
          ? { ...row, [field]: formatJobBoxDate(parsed.date) }
          : row;
      }),
    }));
  const add = () => {
    setKeys((k) => [newKey(), ...k]);
    setDraft((d) => ({ ...d, resume: [jobToDraft(), ...d.resume] }));
  };
  const remove = (i: number) => {
    setKeys((k) => k.filter((_, j) => j !== i));
    setDraft((d) => ({ ...d, resume: d.resume.filter((_, j) => j !== i) }));
  };
  const dateExtra = (i: number, field: "startDate" | "endDate") => ({
    placeholder: "Year, Month Year or Day Month Year",
    onBlur: tidyDate(i, field),
  });

  return (
    <div className={styles.jobsEdit}>
      <button
        type="button"
        className={`${styles.button} ${styles.quiet} ${styles.small} ${styles.addJob}`}
        disabled={busy}
        onClick={add}
      >
        <Plus size={16} strokeWidth={1.75} aria-hidden />
        Add job
      </button>
      {draft.resume.map((row, i) => {
        const rowErrors = errors.resume?.[i] ?? {};
        const name = row.job.trim() ? `job ${row.job.trim()}` : "new job";
        const key = keys[i];
        const box = (
          field: JobField,
          label: string,
          error?: string,
          extra?: FieldExtra,
        ) => (
          <TextBox
            id={`${id}-${key}-${field}`}
            label={label}
            value={row[field]}
            error={error}
            busy={busy}
            onChange={(value) => setRow(i, field, value)}
            extra={extra}
          />
        );
        return (
          <fieldset
            key={key}
            className={`${styles.jobRow} ${row.id ? "" : styles.newJob}`}
            aria-label={name.charAt(0).toUpperCase() + name.slice(1)}
          >
            {box("job", "Job", rowErrors.job)}
            {box("employer", "Employer (optional)")}
            {box(
              "startDate",
              "Start date",
              rowErrors.startDate,
              dateExtra(i, "startDate"),
            )}
            {box(
              "endDate",
              "End date (optional)",
              rowErrors.endDate,
              dateExtra(i, "endDate"),
            )}
            <button
              type="button"
              className={`${styles.iconButton} ${styles.removeJob}`}
              aria-label={`Remove ${name}`}
              title="Remove job"
              disabled={busy}
              onClick={() => remove(i)}
            >
              <Trash2 size={16} strokeWidth={1.75} aria-hidden />
            </button>
            <label className={`${styles.field} ${styles.jobWide}`}>
              <span className={styles.fieldLabel}>Description (optional)</span>
              <textarea
                className={`${styles.input} ${styles.textarea} ${styles.jobText}`}
                rows={2}
                value={row.description}
                onChange={(e) => setRow(i, "description", e.target.value)}
                disabled={busy}
              />
            </label>
          </fieldset>
        );
      })}
    </div>
  );
}
