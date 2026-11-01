import { UserRound } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
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
  parseDate,
  validateForm,
} from "@/lib/people";
import {
  type Character,
  type CharacterFields,
  choosePhoto,
  type StatName,
} from "@/lib/peopleApi";

type Draft = CharacterDraft & {
  // The path of a newly picked photo, saved with the person.
  photo: string | null;
};

type TextField = Exclude<keyof CharacterDraft, "stats" | "resume">;

const toDraft = (person?: Character): Draft => ({
  ...characterToDraft(person),
  photo: null,
});

const NO_ERRORS: FormErrors = { stats: [] };

const fileName = (path: string) => path.slice(path.search(/[^/\\]*$/));

// A picked photo retained after the character fields were saved.
export type Pending = Pick<Draft, "photo">;

export type PersonFormProps = {
  // Undefined for a new person.
  person?: Character;
  statNames: StatName[];
  gameDate: string;
  photoVersion: number;
  // An unsaved photo to start with.
  pending?: Pending;
  onCancel: () => void;
  // Called with true while the form has unsaved changes.
  onDirty?: (dirty: boolean) => void;
  // When the form stays open after a save, tells if the photo was saved.
  onSave: (
    fields: CharacterFields,
    photo: string | null,
  ) => Promise<{ photoSaved: boolean }>;
};

export function PersonForm({
  person,
  statNames,
  gameDate,
  photoVersion,
  pending,
  onCancel,
  onDirty,
  onSave,
}: PersonFormProps) {
  const notify = useToast();
  const id = useId();
  const [draft, setDraft] = useState(() => ({
    ...toDraft(person),
    ...pending,
  }));
  // Errors show after the first Save, then follow the typing.
  const [shown, setShown] = useState(false);
  const saving = useRef(false);
  // True while a save is pending: the form can't be changed or left.
  const [busy, setBusy] = useState(false);
  const errors = shown ? validateForm(draft, gameDate) : NO_ERRORS;
  // A pending save counts too, so leaving the form asks first.
  const dirty =
    busy || JSON.stringify(draft) !== JSON.stringify(toDraft(person));
  useEffect(() => {
    onDirty?.(dirty);
    return () => onDirty?.(false);
  }, [dirty, onDirty]);

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

  const save = async () => {
    if (saving.current) return;
    setShown(true);
    const result = characterDraftToFields(draft, gameDate);
    if ("errors" in result) return;
    saving.current = true;
    setBusy(true);
    try {
      const { photoSaved } = await onSave(result.fields, draft.photo);
      if (photoSaved) setDraft((d) => ({ ...d, photo: null }));
    } finally {
      saving.current = false;
      setBusy(false);
    }
  };

  const textField = (
    field: TextField,
    label: string,
    error?: string,
    extra: { placeholder?: string; onBlur?: () => void } = {},
  ) => (
    <div className={styles.field}>
      <label className={styles.fieldLabel} htmlFor={`${id}-${field}-box`}>
        {label}
      </label>
      <input
        id={`${id}-${field}-box`}
        className={`${styles.input} ${error ? styles.invalid : ""}`}
        type="text"
        value={draft[field]}
        aria-invalid={!!error}
        aria-describedby={error ? `${id}-${field}` : undefined}
        onChange={(e) => set(field)(e.target.value)}
        disabled={busy}
        {...extra}
      />
      {error && (
        <span id={`${id}-${field}`} className={styles.fieldError}>
          {error}
        </span>
      )}
    </div>
  );

  const dateExtra = (field: "birthDate" | "deathDate") => ({
    placeholder: "Day Month Year",
    onBlur: tidyDate(field),
  });

  const hasPhoto = draft.photo !== null || !!person?.photo;

  return (
    <div className={styles.sheet}>
      <div className={styles.sheetBar}>
        <span className={styles.editing}>
          {person ? "Editing" : "New person"}
        </span>
        <div className={styles.actions}>
          <button
            type="button"
            className={`${styles.button} ${styles.quiet}`}
            disabled={busy}
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            type="button"
            className={styles.button}
            disabled={busy}
            onClick={save}
          >
            Save
          </button>
        </div>
      </div>
      <div className={styles.form}>
        <div className={styles.wide}>
          {textField("name", "Name", errors.name)}
        </div>
        {textField(
          "birthDate",
          "Birth date",
          errors.birthDate,
          dateExtra("birthDate"),
        )}
        {textField("birthCity", "Birthplace city")}
        {textField("birthCountry", "Birthplace country")}
        {textField(
          "deathDate",
          "Death date (optional)",
          errors.deathDate,
          dateExtra("deathDate"),
        )}
        {textField("deathCity", "Death city (optional)")}
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
                        aria-label={`Stat ${i + 1} ${side} value`}
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
      <section className={styles.section}>
        <label className={styles.field}>
          <span className={styles.h3}>Description</span>
          <textarea
            className={`${styles.input} ${styles.textarea}`}
            rows={4}
            value={draft.description}
            onChange={(e) => set("description")(e.target.value)}
            disabled={busy}
          />
        </label>
      </section>
    </div>
  );
}
