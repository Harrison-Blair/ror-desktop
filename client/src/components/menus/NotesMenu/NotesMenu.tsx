import { FilePlus, FolderOpen, FolderPlus } from "lucide-react";
import {
  type Dispatch,
  type Ref,
  type SetStateAction,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import {
  FileTree,
  type FileTreeHandle,
  type TreeEntry,
} from "@/components/FileTree/FileTree";
import { useToast } from "@/components/Toast/Toast";
import {
  chooseNotesFolder,
  createEntry,
  deleteEntry,
  type Entry,
  listNotes,
  moveEntry,
  onNotesChanged,
  renameEntry,
} from "@/lib/notesApi";
import { deleteQuestion } from "./deleteQuestion";
import styles from "./NotesMenu.module.css";

export type NotesMenuHandle = FileTreeHandle & { chooseFolder: () => void };

// Shown until the first load, so the tree renders empty meanwhile.
const NO_ENTRIES: TreeEntry[] = [];

const errorMessage = (e: unknown) =>
  typeof e === "object" && e !== null && "message" in e
    ? String(e.message)
    : String(e);

const isNameError = (e: unknown) =>
  typeof e === "object" &&
  e !== null &&
  "code" in e &&
  (e.code === "invalid_name" || e.code === "name_taken");

const toTree = (entries: Entry[]): TreeEntry[] =>
  entries.map((entry) => ({
    kind: entry.kind === "note" ? "file" : "folder",
    name: entry.name,
    path: entry.path,
    children: entry.children && toTree(entry.children),
  }));

function pathsOf(entries: TreeEntry[], paths = new Set<string>()) {
  for (const entry of entries) {
    paths.add(entry.path);
    pathsOf(entry.children ?? [], paths);
  }
  return paths;
}

export function NotesMenuActions({
  folder,
  onChooseFolder,
  onCreate,
}: {
  folder: string | undefined;
  onChooseFolder: () => void;
  onCreate: (kind: TreeEntry["kind"]) => void;
}) {
  return (
    <>
      <button
        type="button"
        className={styles.iconButton}
        aria-label="Choose notes folder"
        title={
          folder === undefined
            ? "Choose notes folder"
            : `Choose notes folder (${folder})`
        }
        onClick={onChooseFolder}
      >
        <FolderOpen size={16} strokeWidth={1.75} aria-hidden />
      </button>
      <button
        type="button"
        className={styles.iconButton}
        aria-label="New note"
        title="New note"
        onClick={() => onCreate("file")}
      >
        <FilePlus size={16} strokeWidth={1.75} aria-hidden />
      </button>
      <button
        type="button"
        className={styles.iconButton}
        aria-label="New folder"
        title="New folder"
        onClick={() => onCreate("folder")}
      >
        <FolderPlus size={16} strokeWidth={1.75} aria-hidden />
      </button>
    </>
  );
}

// The folder, open folders and the selection belong to the caller, so they
// outlast the menu when the rail panel closes.
export type NotesMenuProps = {
  ref?: Ref<NotesMenuHandle>;
  setFolder: (folder: string) => void;
  expanded: Set<string>;
  setExpanded: Dispatch<SetStateAction<Set<string>>>;
  selected: string | null;
  setSelected: Dispatch<SetStateAction<string | null>>;
};

export function NotesMenu({
  ref,
  setFolder,
  expanded,
  setExpanded,
  selected,
  setSelected,
}: NotesMenuProps) {
  const notify = useToast();
  const [entries, setEntries] = useState<TreeEntry[]>();
  const loadId = useRef(0);
  const tree = useRef<FileTreeHandle>(null);
  // Stops a second pick from starting while one is open.
  const picking = useRef(false);

  const load = useCallback(async () => {
    const id = ++loadId.current;
    let list: Entry[];
    try {
      list = await listNotes();
    } catch (e) {
      notify({ kind: "error", message: errorMessage(e) });
      return;
    }
    if (id !== loadId.current) return;
    setEntries(toTree(list));
  }, [notify]);

  useEffect(() => {
    load();
    const unlisten = onNotesChanged(load);
    return () => {
      unlisten.then((stop) => stop());
    };
  }, [load]);

  useImperativeHandle(
    ref,
    () => ({
      startCreate: (kind) => tree.current?.startCreate(kind),
      chooseFolder: async () => {
        if (picking.current) return;
        picking.current = true;
        let path: string | null;
        try {
          path = await chooseNotesFolder();
        } catch (e) {
          notify({ kind: "error", message: errorMessage(e) });
          return;
        } finally {
          picking.current = false;
        }
        if (path === null) return;
        // Paths in the new folder are unrelated to the old ones.
        setFolder(path);
        setExpanded(new Set());
        setSelected(null);
        load();
      },
    }),
    [load, notify, setFolder, setExpanded, setSelected],
  );

  // Runs after the render so that the tree has already moved the selection
  // and open folders of a renamed or moved entry to its new path.
  useEffect(() => {
    if (!entries) return;
    const paths = pathsOf(entries);
    setExpanded((prev) => new Set([...prev].filter((p) => paths.has(p))));
    setSelected((path) => (path !== null && paths.has(path) ? path : null));
  }, [entries, setExpanded, setSelected]);

  // A failed change may still have changed the disk, so reload either way.
  const reloadAfter = <T,>(change: Promise<T>) =>
    change.finally(() => {
      load();
    });

  // A rejected name changes nothing, so it needs no reload.
  const reloadAfterNameEdit = <T,>(change: Promise<T>) =>
    change.then(
      (result) => {
        load();
        return result;
      },
      (e) => {
        if (!isNameError(e)) load();
        throw e;
      },
    );

  return (
    <FileTree
      ref={tree}
      label="Notes"
      labels={{ file: "note" }}
      entries={entries ?? NO_ENTRIES}
      expanded={expanded}
      setExpanded={setExpanded}
      selected={selected}
      setSelected={setSelected}
      onCreate={(parent, kind, name) =>
        reloadAfterNameEdit(
          createEntry(parent, kind === "file" ? "note" : "folder", name),
        )
      }
      onRename={(path, newName) =>
        reloadAfterNameEdit(renameEntry(path, newName))
      }
      onMove={(path, newParent) => reloadAfter(moveEntry(path, newParent))}
      onDelete={(path) => reloadAfter(deleteEntry(path))}
      confirmDelete={(entry) => ({
        title: deleteQuestion(entry),
        message: "You can restore it from the system trash.",
        confirmLabel: "Move to trash",
      })}
    />
  );
}
