import { useRef, useState } from "react";
import type { RoundNoteHandle } from "@/components/menus/SessionMenu/RoundNote";
import type { SessionSection } from "@/components/menus/SessionMenu/SessionMenu";

export type SessionPageOptions = {
  // True while the Session tab is shown and Settings is closed.
  active: boolean;
  // Asks "Discard changes?". Resolves true to discard.
  confirmDiscard: () => Promise<boolean>;
};

// What the Session main panel shows. A note or Read whole round returns to
// `back`.
export type SessionScreen =
  | { kind: "overview" }
  | { kind: "rounds" }
  | { kind: "sessions" }
  | { kind: "round"; roundId: string }
  | {
      kind: "note";
      noteId: string;
      title: string;
      subtitle: string;
      back: SessionScreen;
      backLabel: string;
    }
  | { kind: "read"; roundId: string; back: SessionScreen; backLabel: string };

// The rail section a screen belongs to.
export const sectionOf = (screen: SessionScreen): SessionSection => {
  switch (screen.kind) {
    case "note":
    case "read":
      return sectionOf(screen.back);
    case "round":
      return "rounds";
    default:
      return screen.kind;
  }
};

// The state and actions of the Session views. Only the Session page uses it.
export type SessionView = ReturnType<typeof useSessionView>;

export type SessionPage = {
  // Leaves the shown screen: saves an open note and asks before discarding
  // a game date edit. Resolves false to stay.
  leave: () => Promise<boolean>;
  // Shows Overview the next time Session is shown.
  showOverview: () => void;
  view: SessionView;
};

// Called by the app shell, like useWorldPage, so Session keeps its screen
// while another tab is shown.
export function useSessionPage(options: SessionPageOptions): SessionPage {
  const view = useSessionView(options);
  return {
    leave: view.leave,
    showOverview: () => view.setScreen({ kind: "overview" }),
    view,
  };
}

function useSessionView({ active, confirmDiscard }: SessionPageOptions) {
  const [screen, setScreen] = useState<SessionScreen>({ kind: "overview" });
  const [overviewVersion, setOverviewVersion] = useState(0);
  // True while the game date edit has unsaved changes.
  const formDirty = useRef(false);
  // The open note, so its pending edit is saved before it closes.
  const note = useRef<RoundNoteHandle>(null);

  const leave = async () => {
    if (!active) return true;
    if (note.current && !(await note.current.flush())) return false;
    if (!formDirty.current) return true;
    if (!(await confirmDiscard())) return false;
    formDirty.current = false;
    setOverviewVersion((version) => version + 1);
    return true;
  };

  // Shows another screen of Session, leaving the shown one first.
  const go = async (next: SessionScreen) => {
    if (!(await leave())) return;
    setScreen(next);
  };

  return {
    screen,
    setScreen,
    go,
    note,
    overviewVersion,
    setFormDirty: (dirty: boolean) => {
      formDirty.current = dirty;
    },
    leave,
  };
}
