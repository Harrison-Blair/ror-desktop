import type { Dispatch, SetStateAction } from "react";
import { EditorMenu } from "@/components/menus/EditorMenu/EditorMenu";
import {
  NotesMenu,
  NotesMenuActions,
} from "@/components/menus/NotesMenu/NotesMenu";
import type { ListPrefs } from "@/components/menus/PeopleMenu/PeopleList";
import { PeopleMenu } from "@/components/menus/PeopleMenu/PeopleMenu";
import type { PeopleData } from "@/components/menus/PeopleMenu/usePeople";
import type { NotesView } from "@/pages/NotesPage/useNotesPage";

// The Notes views. They unmount when another tab is shown; their state lives
// in useNotesPage.

export function NotesPageActions({ notes }: { notes: NotesView }) {
  return (
    <NotesMenuActions
      folder={notes.folder}
      onChooseFolder={() => notes.notesMenu.current?.chooseFolder()}
      onCreate={notes.create}
    />
  );
}

export function NotesPageRail({
  notes,
  people,
}: {
  notes: NotesView;
  people: PeopleData;
}) {
  const me = people.people?.characters.find(
    (person) => person.id === people.people?.meId,
  );
  return (
    <NotesMenu
      ref={notes.notesMenu}
      setFolder={notes.pickFolder}
      expanded={notes.expanded}
      setExpanded={notes.setExpanded}
      selected={notes.selected}
      setSelected={notes.setSelected}
      openNote={notes.openNote}
      setOpenNote={notes.setOpenNote}
      onOpenNote={notes.openFile}
      beforeChooseFolder={notes.leaveCharacterEdit}
      // A pending edit is saved to the open note's old path first.
      saveOpenNote={notes.flush}
      me={me}
      gameDate={people.world?.gameDate}
      photoVersion={people.photoVersion}
      onOpenMe={() => me && notes.openCharacter(me.id)}
    />
  );
}

// Shows the character sheet or form when the character button opened it,
// and the open note otherwise.
export function NotesPageMain({
  notes,
  people,
  prefs,
  setPrefs,
}: {
  notes: NotesView;
  people: PeopleData;
  // The World list preferences, shared with the character view.
  prefs: ListPrefs;
  setPrefs: Dispatch<SetStateAction<ListPrefs>>;
}) {
  if (
    notes.characterView.screen === "sheet" ||
    notes.characterView.screen === "edit"
  ) {
    return (
      <PeopleMenu
        data={people}
        view={notes.characterView}
        setView={notes.setCharacterView}
        prefs={prefs}
        setPrefs={setPrefs}
        embedded
        onFormDirty={notes.setCharacterFormDirty}
      />
    );
  }
  return (
    <EditorMenu
      ref={notes.editorMenu}
      path={notes.openNote}
      onOpenNote={notes.followLink}
    />
  );
}
