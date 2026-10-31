import { UserRound } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { useToast } from "@/components/Toast/Toast";
import { errorMessage } from "@/lib/errorMessage";
import {
  type FormErrors,
  formatBoxDate,
  hasErrors,
  parseDate,
  validateForm,
} from "@/lib/people";
import {
  type Character,
  type CharacterFields,
  choosePhoto,
  STAT_COUNT,
  type StatName,
} from "@/lib/peopleApi";
import styles from "./PeopleMenu.module.css";
import { PersonPhoto } from "./PersonPhoto";
import { StatBar } from "./parts";

type Draft = {
  name: string;
  birthDate: string;
  birthCity: string;
  birthCountry: string;
  deathDate: string;
  deathCity: string;
  deathCountry: string;
  stats: string[];
  description: string;
  statNames: StatName[];
  // The path of a newly picked photo, saved with the person.
  photo: string | null;
};

type TextField = Exclude<keyof Draft, "stats" | "statNames" | "photo">;

const toDraft = (person: Character | undefined, names: StatName[]): Draft => ({
  name: person?.name ?? "",
  birthDate: person?.birthDate ? formatBoxDate(person.birthDate) : "",
  birthCity: person?.birthCity ?? "",
  birthCountry: person?.birthCountry ?? "",
  deathDate: person?.deathDate ? formatBoxDate(person.deathDate) : "",
  deathCity: person?.deathCity ?? "",
  deathCountry: person?.deathCountry ?? "",
  stats: Array.from({ length: STAT_COUNT }, (_, i) => {
    const value = person?.stats[i];
    return value === null || value === undefined ? "" : String(value);
  }),
  description: person?.description ?? "",
  statNames: names.map((n) => ({ ...n })),
  photo: null,
});

const dateOf = (text: string) => {
  const parsed = parseDate(text);
  return text.trim() && "date" in parsed ? parsed.date : null;
};

// Call only for a draft without errors.
const toFields = (draft: Draft): CharacterFields => ({
  name: draft.name.trim(),
  birthDate: dateOf(draft.birthDate),
  birthCity: draft.birthCity.trim(),
  birthCountry: draft.birthCountry.trim(),
  deathDate: dateOf(draft.deathDate),
  deathCity: draft.deathCity.trim(),
  deathCountry: draft.deathCountry.trim(),
  stats: draft.stats.map((s) => (s.trim() ? Number(s) : null)),
  description: draft.description,
});

const NO_ERRORS: FormErrors = { stats: [] };

const fileName = (path: string) => path.slice(path.search(/[^/\\]*$/));

// The changes a form keeps after a save that failed in part.
export type Pending = Pick<Draft, "statNames" | "photo">;

export type PersonFormProps = {
  // Undefined for a new person.
  person?: Character;
  statNames: StatName[];
  gameDate: string;
  photoVersion: number;
  // Unsaved stat names and photo to start with.
  pending?: Pending;
  onCancel: () => void;
  // Called with true while the form has unsaved changes.
  onDirty?: (dirty: boolean) => void;
  // When the form stays open after a save, tells if the photo was saved.
  onSave: (
    fields: CharacterFields,
    statNames: StatName[],
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
    ...toDraft(person, statNames),
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
    busy ||
    JSON.stringify(draft) !== JSON.stringify(toDraft(person, statNames));
  useEffect(() => {
    onDirty?.(dirty);
    return () => onDirty?.(false);
  }, [dirty, onDirty]);

  const set = (field: TextField) => (value: string) =>
    setDraft((d) => ({ ...d, [field]: value }));
  // A valid date is rewritten as "21 January 1904".
  const tidyDate = (field: "birthDate" | "deathDate") => () =>
    setDraft((d) => {
      const iso = dateOf(d[field]);
      return iso ? { ...d, [field]: formatBoxDate(iso) } : d;
    });
  const setStat = (i: number, value: string) =>
    setDraft((d) => ({
      ...d,
      stats: d.stats.map((s, j) => (j === i ? value : s)),
    }));
  const setStatName = (i: number, side: keyof StatName, value: string) =>
    setDraft((d) => ({
      ...d,
      statNames: d.statNames.map((n, j) =>
        j === i ? { ...n, [side]: value } : n,
      ),
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
    if (hasErrors(validateForm(draft, gameDate))) return;
    saving.current = true;
    setBusy(true);
    try {
      const { photoSaved } = await onSave(
        toFields(draft),
        draft.statNames,
        draft.photo,
      );
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
          <p className={styles.note}>Stat names apply to every character.</p>
          {draft.statNames.map((name, i) => {
            const raw = draft.stats[i];
            const error = errors.stats[i];
            const value =
              /^\d+$/.test(raw.trim()) && Number(raw) <= 100
                ? Number(raw)
                : null;
            const n = i + 1;
            return (
              // The pairs are fixed in number and order.
              // biome-ignore lint/suspicious/noArrayIndexKey: see above
              <div key={i} className={styles.pairEdit}>
                <div className={`${styles.pair} ${styles.editRow}`}>
                  <input
                    className={styles.input}
                    type="text"
                    value={name.left}
                    aria-label={`Stat ${n} left name`}
                    onChange={(e) => setStatName(i, "left", e.target.value)}
                    disabled={busy}
                  />
                  <input
                    className={`${styles.input} ${styles.mono} ${error ? styles.invalid : ""}`}
                    type="text"
                    inputMode="numeric"
                    value={raw}
                    aria-label={`Stat ${n} value`}
                    aria-invalid={!!error}
                    aria-describedby={error ? `${id}-stat-${i}` : undefined}
                    onChange={(e) => setStat(i, e.target.value)}
                    disabled={busy}
                  />
                  <StatBar value={value} />
                  <span className={styles.mono}>
                    {value === null ? "" : 100 - value}
                  </span>
                  <input
                    className={`${styles.input} ${styles.right}`}
                    type="text"
                    value={name.right}
                    aria-label={`Stat ${n} right name`}
                    onChange={(e) => setStatName(i, "right", e.target.value)}
                    disabled={busy}
                  />
                </div>
                {error && (
                  <span
                    id={`${id}-stat-${i}`}
                    className={`${styles.fieldError} ${styles.statError}`}
                  >
                    {error}
                  </span>
                )}
              </div>
            );
          })}
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
