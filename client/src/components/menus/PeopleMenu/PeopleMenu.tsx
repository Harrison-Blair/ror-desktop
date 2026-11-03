import { Plus } from "lucide-react";
import {
  type Dispatch,
  type ReactNode,
  type SetStateAction,
  useState,
} from "react";
import { ConfirmDialog } from "@/components/ConfirmDialog/ConfirmDialog";
import type { Pending } from "@/components/forms/PersonForm/PersonFields";
import { PersonForm } from "@/components/forms/PersonForm/PersonForm";
import { useToast } from "@/components/Toast/Toast";
import { errorMessage } from "@/lib/errorMessage";
import {
  type CharacterFields,
  clearMe,
  createPerson,
  deletePerson,
  setMe,
  setPhoto,
  updatePerson,
} from "@/lib/peopleApi";
import { type ListPrefs, PeopleList } from "./PeopleList";
import styles from "./PeopleMenu.module.css";
import { PersonSheet, type SheetSection } from "./PersonSheet";
import type { PeopleData } from "./usePeople";

// What the main panel shows in World › People of interest.
export type PeopleView =
  | { screen: "list" }
  | { screen: "sheet"; id: string }
  // The sheet with one section open for editing.
  | { screen: "edit"; id: string; section: SheetSection }
  | { screen: "add" };

export type PeopleMenuProps = {
  data: PeopleData;
  view: PeopleView;
  setView: Dispatch<SetStateAction<PeopleView>>;
  // The list settings live with the caller, so they outlast this menu.
  prefs: ListPrefs;
  setPrefs: Dispatch<SetStateAction<ListPrefs>>;
  // Notes uses the sheet and form without People navigation controls.
  embedded?: boolean;
  onFormDirty?: (dirty: boolean) => void;
};

export function PeopleMenu({
  data,
  view,
  setView,
  prefs,
  setPrefs,
  embedded = false,
  onFormDirty,
}: PeopleMenuProps) {
  const notify = useToast();
  // The unsaved photo of an Add whose person was created, for the top
  // section of its sheet.
  const [pending, setPending] = useState<Pending & { id: string }>();
  // It is for that one open section only.
  if (pending && !(view.screen === "edit" && view.id === pending.id)) {
    setPending(undefined);
  }
  const [dialog, setDialog] = useState<{
    kind: "claim" | "unclaim" | "delete";
    id: string;
  } | null>(null);
  const { people, peopleError, world, worldError, photoVersion } = data;

  const fail = (e: unknown) =>
    notify({ kind: "error", message: errorMessage(e) });

  // For an action that ends later: moves on only if the view is still the
  // one the action started from. After a move elsewhere, as when a form is
  // left during its save, the late end leaves the new view alone.
  const moveFrom = (from: PeopleView, to: PeopleView) =>
    setView((current) => (current === from ? to : current));

  // A failed photo keeps the saved person's top section open for retry.
  const save =
    (id: string | null) =>
    async (fields: CharacterFields, photo: string | null) => {
      const from = view;
      let saved: string;
      try {
        saved =
          id === null
            ? (await createPerson(fields)).id
            : (await updatePerson(id, fields)).id;
      } catch (e) {
        fail(e);
        return { photoSaved: false };
      }
      let photoSaved = photo === null;
      if (photo !== null) {
        try {
          await setPhoto(saved, photo);
          data.photoChanged();
          photoSaved = true;
        } catch (e) {
          notify({
            kind: "error",
            message: `${fields.name} is saved, but not the photo (${errorMessage(e)}).`,
          });
        }
      }
      await data.reload();
      if (photoSaved) {
        moveFrom(from, { screen: "sheet", id: saved });
        return { photoSaved };
      }
      if (id === null) {
        setPending({
          id: saved,
          photo,
        });
        moveFrom(from, { screen: "edit", id: saved, section: "top" });
      }
      return { photoSaved };
    };

  if (!people && !peopleError && !world && !worldError) return null;

  const addButton = (
    <button
      type="button"
      className={styles.button}
      disabled={!world}
      onClick={() => setView({ screen: "add" })}
    >
      <Plus size={16} strokeWidth={1.75} aria-hidden />
      Add person
    </button>
  );
  const toList = () => setView({ screen: "list" });

  if (view.screen === "add" && world) {
    return (
      <PersonForm
        statNames={world.statNames}
        photoVersion={photoVersion}
        onCancel={toList}
        onDirty={onFormDirty}
        onSave={save(null)}
      />
    );
  }

  // A damaged file shows its error in place of the list.
  if (!people || !world) {
    return (
      <div className={styles.page}>
        <div className={styles.top}>
          <h1 className={styles.h1}>People of interest</h1>
          <div className={styles.spacer} />
          {addButton}
        </div>
        {[peopleError, worldError].filter(Boolean).map((message) => (
          <p key={message} className={styles.loadError} role="alert">
            {message}
          </p>
        ))}
      </div>
    );
  }

  const { characters, meId } = people;
  const find = (id: string) => characters.find((p) => p.id === id);
  const person = "id" in view ? find(view.id) : undefined;
  const dialogPerson = dialog && find(dialog.id);
  const mine = meId === null ? undefined : find(meId);

  const confirmClaim = async (id: string) => {
    setDialog(null);
    try {
      await setMe(id);
    } catch (e) {
      fail(e);
    }
    await data.reload();
  };

  const confirmUnclaim = async () => {
    setDialog(null);
    try {
      await clearMe();
    } catch (e) {
      fail(e);
    }
    await data.reload();
  };

  const confirmDelete = async (id: string) => {
    const from = view;
    setDialog(null);
    try {
      await deletePerson(id);
      moveFrom(from, { screen: "list" });
    } catch (e) {
      fail(e);
    }
    await data.reload();
  };

  let screen: ReactNode;
  if (person) {
    screen = (
      <PersonSheet
        // A new sheet, and so new editors, for each person.
        key={person.id}
        person={person}
        meId={meId}
        gameDate={world.gameDate}
        statNames={world.statNames}
        photoVersion={photoVersion}
        onBack={embedded ? undefined : toList}
        onClaim={
          embedded
            ? undefined
            : () => setDialog({ kind: "claim", id: person.id })
        }
        onUnclaim={
          embedded
            ? undefined
            : () => setDialog({ kind: "unclaim", id: person.id })
        }
        editing={view.screen === "edit" ? view.section : undefined}
        pending={
          pending?.id === person.id ? { photo: pending.photo } : undefined
        }
        onEdit={(section) =>
          setView({ screen: "edit", id: person.id, section })
        }
        onCancelEdit={() => setView({ screen: "sheet", id: person.id })}
        onDirty={onFormDirty}
        onSave={save(person.id)}
        onDelete={() => setDialog({ kind: "delete", id: person.id })}
      />
    );
  } else {
    screen = (
      <div className={styles.page}>
        <PeopleList
          people={characters}
          meId={meId}
          gameDate={world.gameDate}
          photoVersion={photoVersion}
          prefs={prefs}
          setPrefs={setPrefs}
          onOpen={(id) => setView({ screen: "sheet", id })}
          addButton={addButton}
        />
      </div>
    );
  }

  return (
    <>
      {screen}
      {dialog?.kind === "claim" && dialogPerson && (
        <ConfirmDialog
          title={`Make ${dialogPerson.name} your character?`}
          message={
            mine
              ? `${mine.name} stays in the list but is no longer your character.`
              : ""
          }
          confirmLabel="Confirm"
          onConfirm={() => confirmClaim(dialogPerson.id)}
          onCancel={() => setDialog(null)}
        />
      )}
      {dialog?.kind === "unclaim" && dialogPerson && (
        <ConfirmDialog
          title={`Stop playing ${dialogPerson.name}?`}
          message={`${dialogPerson.name} stays in the list but is no longer your character.`}
          confirmLabel="Confirm"
          onConfirm={confirmUnclaim}
          onCancel={() => setDialog(null)}
        />
      )}
      {dialog?.kind === "delete" && dialogPerson && (
        <ConfirmDialog
          title={`Delete ${dialogPerson.name}?`}
          message="This cannot be undone."
          confirmLabel="Delete"
          danger
          onConfirm={() => confirmDelete(dialogPerson.id)}
          onCancel={() => setDialog(null)}
        />
      )}
    </>
  );
}
