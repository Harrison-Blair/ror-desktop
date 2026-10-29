import {
  type Ref,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { MarkdownEditor } from "@/components/MarkdownEditor/MarkdownEditor";
import { useToast } from "@/components/Toast/Toast";
import { openWebLink } from "@/lib/linksApi";
import {
  type Entry,
  listNotes,
  onNotesChanged,
  readNote,
  writeNote,
} from "@/lib/notesApi";
import styles from "./EditorMenu.module.css";

export const SAVE_DELAY = 500;

const errorMessage = (e: unknown) =>
  typeof e === "object" && e !== null && "message" in e
    ? String(e.message)
    : String(e);

// The path that a relative link in the note at `from` points to, with any
// #fragment dropped, or null when it leaves the notes folder.
function linkedPath(from: string, href: string) {
  let link: string;
  try {
    link = decodeURIComponent(href.replace(/#.*/, ""));
  } catch {
    return null;
  }
  const parts = from.split("/").slice(0, -1);
  for (const part of link.split("/")) {
    if (part === "..") {
      if (parts.pop() === undefined) return null;
    } else if (part !== "." && part !== "") {
      parts.push(part);
    }
  }
  return parts.join("/");
}

const hasFile = (entries: Entry[], path: string): boolean =>
  entries.some((entry) =>
    entry.kind === "file"
      ? entry.path === path
      : hasFile(entry.children ?? [], path),
  );

export type EditorMenuHandle = {
  // Writes any pending edit and waits for every write to end. Resolves
  // false when an edit couldn't be saved, which stays in the editor.
  flush: () => Promise<boolean>;
};

type EditorMenuProps = {
  ref?: Ref<EditorMenuHandle>;
  // The selected note, relative to the notes folder.
  path: string | null;
  // Opens another note, given its path.
  onOpenNote?: (path: string) => void;
};

export function EditorMenu({ ref, path, onOpenNote }: EditorMenuProps) {
  const notify = useToast();
  // Kept here so the choice survives switching notes.
  const [raw, setRaw] = useState(false);
  const note = useRef<EditorMenuHandle>(null);
  useImperativeHandle(
    ref,
    () => ({ flush: () => note.current?.flush() ?? Promise.resolve(true) }),
    [],
  );

  if (path === null) return <p className={styles.empty}>No note open</p>;
  if (!path.toLowerCase().endsWith(".md")) {
    return <p className={styles.empty}>This file can't be shown yet.</p>;
  }
  const name = path.slice(path.lastIndexOf("/") + 1);

  // Web and mail links open outside the app. A link with no scheme names a
  // note relative to this one.
  const openLink = async (href: string) => {
    const scheme = /^([a-z][a-z\d+.-]*):/i.exec(href)?.[1].toLowerCase();
    if (scheme !== undefined) {
      if (["http", "https", "mailto"].includes(scheme)) {
        openWebLink(href).catch((e) =>
          notify({ kind: "error", message: errorMessage(e) }),
        );
      } else {
        notify({ kind: "error", message: "Can't open this link." });
      }
      return;
    }
    const target = linkedPath(path, href);
    let found = false;
    try {
      found = target !== null && hasFile(await listNotes(), target);
    } catch (e) {
      notify({ kind: "error", message: errorMessage(e) });
      return;
    }
    if (target === null || !found) {
      notify({ kind: "error", message: `Couldn't find “${href}”.` });
      return;
    }
    // Opening another note closes this one, so its edit is saved first.
    if (!(await (note.current?.flush() ?? true))) {
      notify({
        kind: "error",
        message: `Couldn't save “${name}”, so the link wasn't opened.`,
      });
      return;
    }
    onOpenNote?.(target);
  };

  return (
    <div className={styles.menu}>
      <div className={styles.bar}>
        <span className={styles.name}>{name}</span>
        <button
          type="button"
          className={styles.toggle}
          aria-pressed={raw}
          onClick={() => setRaw((on) => !on)}
        >
          Raw source
        </button>
      </div>
      {/* A new path is a new note, so a pending save goes to the old one. */}
      <NoteEditor
        key={path}
        ref={note}
        path={path}
        name={name}
        raw={raw}
        onOpenLink={openLink}
      />
    </div>
  );
}

type NoteEditorProps = {
  ref: Ref<EditorMenuHandle>;
  path: string;
  name: string;
  raw: boolean;
  onOpenLink: (href: string) => void;
};

function NoteEditor({ ref, path, name, raw, onOpenLink }: NoteEditorProps) {
  const notify = useToast();
  const [text, setText] = useState<string>();
  const [failed, setFailed] = useState(false);
  // The editor's text, which the next save writes.
  const latest = useRef<string>(undefined);
  // True from an edit until a save of it succeeds.
  const dirty = useRef(false);
  // Counts edits, so a read that an edit overtook is dropped.
  const edits = useRef(0);
  // Counts reads, so only the newest read is taken in.
  const reads = useRef(0);
  // The running save, which writes until every edit is on disk.
  const saving = useRef<Promise<boolean>>(undefined);
  // Set by an outside change that came while the note loaded or saved, so
  // the note is read again after that.
  const missed = useRef(false);
  const alive = useRef(true);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Takes in an outside change only while every edit is on disk, so
  // unsaved edits win. A deleted note fails to read and clears its
  // selection, so a failed reload is dropped.
  const reload = useCallback(async () => {
    if (!alive.current) return;
    if (latest.current === undefined || saving.current) {
      missed.current = true;
      return;
    }
    if (dirty.current) return;
    const read = ++reads.current;
    const edit = edits.current;
    let disk: string;
    try {
      disk = await readNote(path);
    } catch {
      return;
    }
    if (
      !alive.current ||
      read !== reads.current ||
      edit !== edits.current ||
      dirty.current
    )
      return;
    if (disk === latest.current) return;
    latest.current = disk;
    setText(disk);
  }, [path]);

  const readMissed = useCallback(() => {
    if (!missed.current) return;
    missed.current = false;
    reload();
  }, [reload]);

  // Writes one text at a time until every edit is on disk, so the newest
  // text lands last. Resolves when the writing stops, to false when an edit
  // couldn't be saved.
  const save = useCallback(() => {
    clearTimeout(timer.current);
    if (!saving.current && dirty.current) {
      saving.current = (async () => {
        while (dirty.current && latest.current !== undefined) {
          const edit = edits.current;
          dirty.current = false;
          try {
            await writeNote(path, latest.current);
          } catch (e) {
            notify({ kind: "error", message: errorMessage(e) });
            // The text stays in the editor, and the next edit or flush
            // tries again. A newer edit is written now.
            if (edits.current === edit) {
              dirty.current = true;
              return false;
            }
          }
        }
        return true;
      })().finally(() => {
        saving.current = undefined;
        readMissed();
      });
    }
    return saving.current ?? Promise.resolve(true);
  }, [path, notify, readMissed]);

  useImperativeHandle(ref, () => ({ flush: save }), [save]);

  useEffect(() => {
    alive.current = true;
    const read = ++reads.current;
    readNote(path).then(
      (disk) => {
        if (!alive.current || read !== reads.current) return;
        latest.current = disk;
        setText(disk);
        readMissed();
      },
      (e) => {
        if (!alive.current || read !== reads.current) return;
        setFailed(true);
        notify({ kind: "error", message: errorMessage(e) });
      },
    );
    const unlisten = onNotesChanged(reload);

    return () => {
      alive.current = false;
      unlisten.then((stop) => stop());
      save();
    };
  }, [path, notify, reload, readMissed, save]);
  const change = (value: string) => {
    latest.current = value;
    edits.current++;
    dirty.current = true;
    setText(value);
    clearTimeout(timer.current);
    timer.current = setTimeout(save, SAVE_DELAY);
  };

  if (failed)
    return <p className={styles.empty}>This note couldn't be opened.</p>;
  if (text === undefined) return null;
  return (
    <MarkdownEditor
      value={text}
      onChange={change}
      raw={raw}
      label={name}
      onOpenLink={onOpenLink}
    />
  );
}
