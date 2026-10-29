import { FilePlus, FolderPlus } from "lucide-react";
import {
  type Dispatch,
  type Ref,
  type SetStateAction,
  useCallback,
  useEffect,
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

export type NotesMenuHandle = FileTreeHandle;

// Shown until the first load, so the tree renders empty meanwhile.
const NO_ENTRIES: TreeEntry[] = [];

const errorMessage = (e: unknown) =>
  typeof e === "object" && e !== null && "message" in e
    ? String(e.message)
    : String(e);

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
  onCreate,
}: {
  onCreate: (kind: TreeEntry["kind"]) => void;
}) {
  return (
    <>
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

// Open folders and the selection belong to the caller, so they outlast the
// menu when the rail panel closes.
export type NotesMenuProps = {
  ref?: Ref<NotesMenuHandle>;
  expanded: Set<string>;
  setExpanded: Dispatch<SetStateAction<Set<string>>>;
  selected: string | null;
  setSelected: Dispatch<SetStateAction<string | null>>;
};

export function NotesMenu({
  ref,
  expanded,
  setExpanded,
  selected,
  setSelected,
}: NotesMenuProps) {
  const notify = useToast();
  const [entries, setEntries] = useState<TreeEntry[]>();
  const loadId = useRef(0);

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

  return (
    <FileTree
      ref={ref}
      label="Notes"
      labels={{ file: "note" }}
      entries={entries ?? NO_ENTRIES}
      expanded={expanded}
      setExpanded={setExpanded}
      selected={selected}
      setSelected={setSelected}
      onCreate={(parent, kind, name) =>
        reloadAfter(
          createEntry(parent, kind === "file" ? "note" : "folder", name),
        )
      }
      onRename={(path, newName) => reloadAfter(renameEntry(path, newName))}
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
