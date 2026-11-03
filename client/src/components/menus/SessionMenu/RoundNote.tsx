import {
  type Ref,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { MarkdownEditor } from "@/components/MarkdownEditor/MarkdownEditor";
import { SAVE_DELAY } from "@/components/menus/EditorMenu/EditorMenu";
import { useToast } from "@/components/Toast/Toast";
import { errorMessage } from "@/lib/errorMessage";
import { openWebLink } from "@/lib/linksApi";
import {
  ROUND_NOTE_WRITTEN,
  readRoundNote,
  writeRoundNote,
} from "@/lib/sessionApi";
import styles from "./Session.module.css";

export type RoundNoteHandle = {
  // Writes a pending edit. Resolves false when it couldn't be saved.
  flush: () => Promise<boolean>;
};

// A turn, interterm or recap note, in the live-preview editor with
// autosave. The notes live in app data, not in the Notes folder.
export function RoundNote({
  ref,
  noteId,
  title,
  subtitle,
  back,
  onBack,
}: {
  ref?: Ref<RoundNoteHandle>;
  noteId: string;
  title: string;
  subtitle: string;
  back: string;
  onBack: () => void;
}) {
  const notify = useToast();
  const [text, setText] = useState<string>();
  const [failed, setFailed] = useState(false);
  const latest = useRef<string>(undefined);
  const dirty = useRef(false);
  const saving = useRef<Promise<boolean>>(undefined);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Writes until every edit is on disk, one write at a time.
  const save = useCallback(() => {
    clearTimeout(timer.current);
    if (!saving.current && dirty.current) {
      saving.current = (async () => {
        while (dirty.current && latest.current !== undefined) {
          dirty.current = false;
          try {
            await writeRoundNote(noteId, latest.current);
          } catch (e) {
            notify({ kind: "error", message: errorMessage(e) });
            dirty.current = true;
            return false;
          }
        }
        return true;
      })().finally(() => {
        saving.current = undefined;
      });
    }
    return saving.current ?? Promise.resolve(true);
  }, [noteId, notify]);

  useImperativeHandle(ref, () => ({ flush: save }), [save]);

  useEffect(() => {
    let alive = true;
    readRoundNote(noteId).then(
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
    // A write from the chat agent shows here unless an edit is pending,
    // which wins.
    const written = (event: Event) => {
      if ((event as CustomEvent).detail !== noteId) return;
      if (dirty.current || saving.current) return;
      readRoundNote(noteId).then((disk) => {
        if (!alive || dirty.current) return;
        latest.current = disk;
        setText(disk);
      });
    };
    window.addEventListener(ROUND_NOTE_WRITTEN, written);
    return () => {
      alive = false;
      window.removeEventListener(ROUND_NOTE_WRITTEN, written);
      save();
    };
  }, [noteId, notify, save]);

  const change = (value: string) => {
    latest.current = value;
    dirty.current = true;
    setText(value);
    clearTimeout(timer.current);
    timer.current = setTimeout(save, SAVE_DELAY);
  };

  const openLink = (href: string) => {
    if (/^(https?|mailto):/i.test(href)) {
      openWebLink(href).catch((e) =>
        notify({ kind: "error", message: errorMessage(e) }),
      );
    } else {
      notify({ kind: "error", message: "Can't open this link." });
    }
  };

  return (
    <div className={styles.page}>
      <div className={styles.noteHead}>
        <button type="button" className={styles.back} onClick={onBack}>
          ← {back}
        </button>
        <h1 className={styles.h1}>{title}</h1>
        <p className={styles.muted}>{subtitle}</p>
      </div>
      {failed ? (
        <p className={styles.muted}>This note couldn't be opened.</p>
      ) : (
        text !== undefined && (
          <MarkdownEditor
            value={text}
            onChange={change}
            raw={false}
            label={title}
            onOpenLink={openLink}
          />
        )
      )}
    </div>
  );
}
