import { useId } from "react";
import styles from "@/components/menus/PeopleMenu/PeopleMenu.module.css";
import type { StatName } from "@/lib/peopleApi";
import {
  DescriptionField,
  ResumeRows,
  type SaveCharacter,
  TopFields,
  usePersonDraft,
} from "./PersonFields";

export type PersonFormProps = {
  statNames: StatName[];
  photoVersion: number;
  onCancel: () => void;
  // Called with true while the form has unsaved changes.
  onDirty?: (dirty: boolean) => void;
  onSave: SaveCharacter;
};

// The Add person form: every field at once. A saved person is edited one
// section at a time on the sheet.
export function PersonForm({
  statNames,
  photoVersion,
  onCancel,
  onDirty,
  onSave,
}: PersonFormProps) {
  const id = useId();
  const { draft, setDraft, errors, busy, save } = usePersonDraft({
    onDirty,
    onSave,
  });
  const pieces = { draft, setDraft, errors, busy };

  return (
    <div className={styles.sheet}>
      <div className={styles.sheetBar}>
        <span className={styles.editing}>New person</span>
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
      <TopFields
        {...pieces}
        statNames={statNames}
        photoVersion={photoVersion}
      />
      <section className={styles.section}>
        <DescriptionField {...pieces} />
      </section>
      <section className={styles.section} aria-labelledby={`${id}-resume`}>
        <h2 id={`${id}-resume`} className={styles.h3}>
          Resume
        </h2>
        <ResumeRows {...pieces} />
      </section>
    </div>
  );
}
