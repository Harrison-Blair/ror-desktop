import { Plus } from "lucide-react";
import {
  type Dispatch,
  type ReactNode,
  type SetStateAction,
  useState,
} from "react";
import { ConfirmDialog } from "@/components/ConfirmDialog/ConfirmDialog";
import { useToast } from "@/components/Toast/Toast";
import { errorMessage } from "@/lib/errorMessage";
import {
  type CharacterFields,
  createPerson,
  deletePerson,
  type StatName,
  setMe,
  setPhoto,
  setStatNames,
  updatePerson,
} from "@/lib/peopleApi";
import { type ListPrefs, PeopleList } from "./PeopleList";
import styles from "./PeopleMenu.module.css";
import { type Pending, PersonForm } from "./PersonForm";
import { PersonSheet } from "./PersonSheet";
import type { PeopleData } from "./usePeople";

// What the main panel shows in World › People of interest.
export type PeopleView =
  | { screen: "list" }
  | { screen: "sheet"; id: string }
  | { screen: "edit"; id: string }
  | { screen: "add" };

export type PeopleMenuProps = {
  data: PeopleData;
  view: PeopleView;
  setView: Dispatch<SetStateAction<PeopleView>>;
  // The list settings live with the caller, so they outlast this menu.
  prefs: ListPrefs;
  setPrefs: Dispatch<SetStateAction<ListPrefs>>;
  onFormDirty?: (dirty: boolean) => void;
};

export function PeopleMenu({
  data,
  view,
  setView,
  prefs,
  setPrefs,
  onFormDirty,
}: PeopleMenuProps) {
  const notify = useToast();
  // The unsaved part of an Add whose person was created, for its Edit form.
  const [pending, setPending] = useState<Pending & { id: string }>();
  // It is for that one Edit form only.
  if (pending && !(view.screen === "edit" && view.id === pending.id)) {
    setPending(undefined);
  }
  const [dialog, setDialog] = useState<{
    kind: "claim" | "delete";
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

  // Saves the person, then the stat names and the photo. When one of those
  // two fails, the person is saved but the form stays open with the unsaved
  // part, and an Add becomes an Edit of the new person, so Save again
  // doesn't make a second one.
  const save =
    (id: string | null) =>
    async (
      fields: CharacterFields,
      names: StatName[],
      photo: string | null,
    ) => {
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
      const failed: string[] = [];
      const renamed = names.some(
        (n, i) =>
          n.left !== world?.statNames[i]?.left ||
          n.right !== world?.statNames[i]?.right,
      );
      if (renamed) {
        try {
          data.setWorld(await setStatNames(names));
        } catch (e) {
          failed.push(`the stat names (${errorMessage(e)})`);
        }
      }
      let photoSaved = photo === null;
      if (photo !== null) {
        try {
          await setPhoto(saved, photo);
          data.photoChanged();
          photoSaved = true;
        } catch (e) {
          failed.push(`the photo (${errorMessage(e)})`);
        }
      }
      await data.reload();
      if (failed.length === 0) {
        moveFrom(from, { screen: "sheet", id: saved });
        return { photoSaved };
      }
      notify({
        kind: "error",
        message: `${fields.name} is saved, but not ${failed.join(" or ")}.`,
      });
      if (id === null) {
        setPending({
          id: saved,
          statNames: names,
          photo: photoSaved ? null : photo,
        });
        moveFrom(from, { screen: "edit", id: saved });
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
        gameDate={world.gameDate}
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
  if (person && view.screen === "edit") {
    screen = (
      <PersonForm
        // A new form for each person.
        key={person.id}
        person={person}
        statNames={world.statNames}
        gameDate={world.gameDate}
        photoVersion={photoVersion}
        pending={
          pending?.id === person.id
            ? { statNames: pending.statNames, photo: pending.photo }
            : undefined
        }
        onCancel={() => setView({ screen: "sheet", id: person.id })}
        onDirty={onFormDirty}
        onSave={save(person.id)}
      />
    );
  } else if (person) {
    screen = (
      <PersonSheet
        person={person}
        meId={meId}
        gameDate={world.gameDate}
        statNames={world.statNames}
        photoVersion={photoVersion}
        onBack={toList}
        onClaim={() => setDialog({ kind: "claim", id: person.id })}
        onEdit={() => setView({ screen: "edit", id: person.id })}
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
      {dialog?.kind === "delete" && dialogPerson && (
        <ConfirmDialog
          title={`Delete ${dialogPerson.name}?`}
          message="This cannot be undone."
          confirmLabel="Delete"
          onConfirm={() => confirmDelete(dialogPerson.id)}
          onCancel={() => setDialog(null)}
        />
      )}
    </>
  );
}
