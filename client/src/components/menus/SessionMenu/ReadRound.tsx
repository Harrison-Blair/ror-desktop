import { File } from "lucide-react";
import { useEffect, useState } from "react";
import { Markdown } from "@/components/Markdown/Markdown";
import { useToast } from "@/components/Toast/Toast";
import { errorMessage } from "@/lib/errorMessage";
import { openWebLink } from "@/lib/linksApi";
import type { Character } from "@/lib/peopleApi";
import { INTERTERM_LABEL, period, turnLabel } from "@/lib/session";
import { type Round, readRoundNote } from "@/lib/sessionApi";
import styles from "./Session.module.css";

// Read whole round: every note of the round in turn order, then the
// interterm note.
export function ReadRound({
  round,
  characters,
  back,
  onBack,
  onOpenNote,
}: {
  round: Round;
  characters: Character[] | undefined;
  back: string;
  onBack: () => void;
  onOpenNote: (noteId: string, title: string) => void;
}) {
  const notify = useToast();
  const notes = [
    ...round.turns.map((t) => ({
      noteId: t.noteId,
      title: turnLabel(t, characters),
    })),
    { noteId: round.interterm.noteId, title: INTERTERM_LABEL },
  ];
  const ids = notes.map((n) => n.noteId).join(",");
  const [texts, setTexts] = useState<Record<string, string>>();
  useEffect(() => {
    let alive = true;
    Promise.all(
      ids.split(",").map(async (id) => [id, await readRoundNote(id)] as const),
    ).then(
      (read) => alive && setTexts(Object.fromEntries(read)),
      (e) => alive && notify({ kind: "error", message: errorMessage(e) }),
    );
    return () => {
      alive = false;
    };
  }, [ids, notify]);
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
        <h1 className={styles.h1}>Round {round.number}</h1>
        <p className={styles.muted}>{period(round.start, round.end)}</p>
      </div>
      <div>
        {notes.map((note, i) => (
          <section
            key={note.noteId}
            className={styles.readNote}
            aria-label={note.title}
          >
            <h2 className={styles.readTitle}>
              <span className={styles.pos}>{i + 1}</span>
              {note.title}
              <div className={styles.spacer} />
              <button
                type="button"
                className={`${styles.btn} ${styles.small} ${styles.quiet}`}
                aria-label={`Open ${note.title} note`}
                onClick={() => onOpenNote(note.noteId, note.title)}
              >
                <File size={14} aria-hidden /> Open
              </button>
            </h2>
            {texts === undefined ? null : texts[note.noteId]?.trim() ? (
              <Markdown text={texts[note.noteId]} onOpenLink={openLink} />
            ) : (
              <p className={styles.muted}>No note yet.</p>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}
