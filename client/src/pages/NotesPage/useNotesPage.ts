import { useCallback, useEffect, useRef, useState } from "react";
import type { TreeEntry } from "@/components/FileTree/FileTree";
import type { EditorMenuHandle } from "@/components/menus/EditorMenu/EditorMenu";
import type { NotesMenuHandle } from "@/components/menus/NotesMenu/NotesMenu";
import type { PeopleView } from "@/components/menus/PeopleMenu/PeopleMenu";
import { useToast } from "@/components/Toast/Toast";
import { getNotesFolder } from "@/lib/notesApi";

export type NotesPageOptions = {
  // True while the Notes tab is shown and Settings is closed.
  active: boolean;
  // Asks "Discard changes?". Resolves true to discard.
  confirmDiscard: () => Promise<boolean>;
};

// The state and actions of the Notes views. Only the Notes page uses it.
export type NotesView = ReturnType<typeof useNotesView>;

export type NotesPage = {
  folder: string | undefined;
  openNote: string | null;
  // Saves the open note's pending edit. Resolves false when the save failed.
  flush: () => Promise<boolean>;
  // Opens a note and shows it in the tree. Resolves false when the
  // character form stayed open.
  showNote: (path: string) => Promise<boolean>;
  // Follows a renamed, moved or deleted path. `to` is null for a delete.
  pathChanged: (from: string, to: string | null) => void;
  // Leaves the character form, asking first when it has unsaved changes.
  // Resolves false to stay on the form.
  leaveCharacterEdit: () => Promise<boolean>;
  view: NotesView;
};

// Called by the app shell, so the folder, open folders, tree selection and
// open note survive another tab and closing the rail panel.
export function useNotesPage(options: NotesPageOptions): NotesPage {
  const view = useNotesView(options);
  return {
    folder: view.folder,
    openNote: view.openNote,
    flush: view.flush,
    showNote: view.showNote,
    pathChanged: view.pathChanged,
    leaveCharacterEdit: view.leaveCharacterEdit,
    view,
  };
}

function useNotesView({ active, confirmDiscard }: NotesPageOptions) {
  const notify = useToast();
  const notesMenu = useRef<NotesMenuHandle>(null);
  const editorMenu = useRef<EditorMenuHandle>(null);
  const [folder, setFolder] = useState<string>();
  // Stops StrictMode from asking twice for the startup folder.
  const askedFolder = useRef(false);
  // A pick wins over a startup answer that arrives after it.
  const pickedFolder = useRef(false);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [selected, setSelected] = useState<string | null>(null);
  const [openNote, setOpenNote] = useState<string | null>(null);
  // The character button has its own sheet and edit flow.
  const [characterView, setCharacterView] = useState<PeopleView>({
    screen: "list",
  });
  // True while the character form has unsaved changes.
  const characterFormDirty = useRef(false);

  // Asked here, once per run, since the notes menu comes and goes.
  useEffect(() => {
    if (askedFolder.current) return;
    askedFolder.current = true;
    getNotesFolder().then(
      ({ path, missing }) => {
        if (pickedFolder.current) return;
        setFolder(path);
        if (missing !== null) {
          notify({
            kind: "error",
            message: `Couldn't find ${missing}. Showing the default notes folder.`,
          });
        }
      },
      (e) => notify({ kind: "error", message: String(e) }),
    );
  }, [notify]);

  const pickFolder = useCallback((path: string) => {
    pickedFolder.current = true;
    setFolder(path);
    setCharacterView({ screen: "list" });
  }, []);

  const flush = () => editorMenu.current?.flush() ?? Promise.resolve(true);

  // The character form follows the same discard rule as World. After
  // leaving, the next character-button click starts at its sheet again.
  const leaveCharacterEdit = async () => {
    if (!active || characterView.screen !== "edit") return true;
    if (characterFormDirty.current) {
      if (!(await confirmDiscard())) return false;
      characterFormDirty.current = false;
    }
    setCharacterView({ screen: "list" });
    return true;
  };

  const showNote = async (path: string) => {
    if (!(await leaveCharacterEdit())) return false;
    setCharacterView({ screen: "list" });
    setSelected(path);
    setOpenNote(path);
    // Shows the note in the tree too.
    const parts = path.split("/").slice(0, -1);
    const folders = parts.map((_, i) => parts.slice(0, i + 1).join("/"));
    setExpanded((prev) => new Set([...prev, ...folders]));
    return true;
  };

  const pathChanged = (from: string, to: string | null) => {
    const moved = (path: string) =>
      path !== from && !path.startsWith(`${from}/`)
        ? path
        : to === null
          ? null
          : to + path.slice(from.length);
    setSelected((path) => (path === null ? null : moved(path)));
    setOpenNote((path) => (path === null ? null : moved(path)));
    setExpanded(
      (prev) =>
        new Set(
          [...prev].flatMap((path) => {
            const next = moved(path);
            return next === null ? [] : [next];
          }),
        ),
    );
  };

  const openCharacter = async (id: string) => {
    if (!(await flush())) return;
    if (!(await leaveCharacterEdit())) return;
    setCharacterView({ screen: "sheet", id });
  };

  const openFile = async (path: string) => {
    if (!(await leaveCharacterEdit())) return;
    setCharacterView({ screen: "list" });
    setOpenNote(path);
  };

  const create = async (kind: TreeEntry["kind"]) => {
    if (kind === "file" && !(await leaveCharacterEdit())) return;
    if (kind === "file") setCharacterView({ screen: "list" });
    notesMenu.current?.startCreate(kind);
  };

  // A link in the editor opens its note.
  const followLink = (path: string) => {
    setSelected(path);
    setCharacterView({ screen: "list" });
    setOpenNote(path);
  };

  return {
    notesMenu,
    editorMenu,
    folder,
    pickFolder,
    expanded,
    setExpanded,
    selected,
    setSelected,
    openNote,
    setOpenNote,
    characterView,
    setCharacterView,
    setCharacterFormDirty: (dirty: boolean) => {
      characterFormDirty.current = dirty;
    },
    flush,
    leaveCharacterEdit,
    showNote,
    pathChanged,
    openCharacter,
    openFile,
    create,
    followLink,
  };
}
