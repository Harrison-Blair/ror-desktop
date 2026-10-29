import { useCallback, useEffect, useRef, useState } from "react";
import { MarkdownEditor } from "@/components/MarkdownEditor/MarkdownEditor";
import { useToast } from "@/components/Toast/Toast";
import { onNotesChanged, readNote, writeNote } from "@/lib/notesApi";
import styles from "./EditorMenu.module.css";

export const SAVE_DELAY = 500;

const errorMessage = (e: unknown) =>
  typeof e === "object" && e !== null && "message" in e
    ? String(e.message)
    : String(e);

type EditorMenuProps = {
  // The selected note, relative to the notes folder.
  path: string | null;
};

export function EditorMenu({ path }: EditorMenuProps) {
  // Kept here so the choice survives switching notes.
  const [raw, setRaw] = useState(false);

  if (path === null) return <p className={styles.empty}>No note open</p>;
  if (!path.toLowerCase().endsWith(".md")) {
    return <p className={styles.empty}>This file can't be shown yet.</p>;
  }
  const name = path.slice(path.lastIndexOf("/") + 1);
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
      <NoteEditor key={path} path={path} name={name} raw={raw} />
    </div>
  );
}

type NoteEditorProps = { path: string; name: string; raw: boolean };

function NoteEditor({ path, name, raw }: NoteEditorProps) {
  const notify = useToast();
  const [text, setText] = useState<string>();
  const [failed, setFailed] = useState(false);
  // The editor's text, which the next save writes.
  const latest = useRef<string>(undefined);
  // True from an edit until a save of it succeeds.
  const dirty = useRef(false);
  const writes = useRef(0);
  // Counts edits, so a read that an edit overtook is dropped.
  const edits = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const save = useCallback(() => {
    clearTimeout(timer.current);
    if (!dirty.current || latest.current === undefined) return;
    const edit = edits.current;
    dirty.current = false;
    writes.current++;
    writeNote(path, latest.current)
      .catch((e) => {
        // The text stays in the editor, and the next edit or flush tries again.
        if (edits.current === edit) dirty.current = true;
        notify({ kind: "error", message: errorMessage(e) });
      })
      .finally(() => {
        writes.current--;
      });
  }, [path, notify]);

  useEffect(() => {
    let alive = true;
    readNote(path).then(
      (disk) => {
        if (!alive) return;
        latest.current = disk;
        setText(disk);
      },
      (e) => {
        if (!alive) return;
        setFailed(true);
        notify({ kind: "error", message: errorMessage(e) });
      },
    );

    // Takes in an outside change only while every edit is on disk, so
    // unsaved edits win. A deleted note fails to read and clears its
    // selection, so a failed reload is dropped.
    const reload = async () => {
      if (latest.current === undefined || dirty.current || writes.current)
        return;
      const edit = edits.current;
      let disk: string;
      try {
        disk = await readNote(path);
      } catch {
        return;
      }
      if (!alive || edit !== edits.current || dirty.current) return;
      if (disk === latest.current) return;
      latest.current = disk;
      setText(disk);
    };
    const unlisten = onNotesChanged(reload);

    return () => {
      alive = false;
      unlisten.then((stop) => stop());
      save();
    };
  }, [path, notify, save]);

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
    <MarkdownEditor value={text} onChange={change} raw={raw} label={name} />
  );
}
