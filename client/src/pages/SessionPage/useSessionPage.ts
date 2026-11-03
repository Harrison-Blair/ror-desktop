import { useRef, useState } from "react";

export type SessionPageOptions = {
  // True while the Session tab is shown and Settings is closed.
  active: boolean;
  // Asks "Discard changes?". Resolves true to discard.
  confirmDiscard: () => Promise<boolean>;
};

// The state and actions of the Session views. Only the Session page uses it.
export type SessionView = ReturnType<typeof useSessionView>;

export type SessionPage = {
  // Leaves Overview, asking before discarding edits. Resolves false to keep
  // editing.
  leave: () => Promise<boolean>;
  view: SessionView;
};

// Called by the app shell, like useWorldPage.
export function useSessionPage(options: SessionPageOptions): SessionPage {
  const view = useSessionView(options);
  return { leave: view.leave, view };
}

function useSessionView({ active, confirmDiscard }: SessionPageOptions) {
  const [overviewVersion, setOverviewVersion] = useState(0);
  // True while Overview has unsaved changes.
  const formDirty = useRef(false);

  // Discarded Overview edits reset.
  const leave = async () => {
    if (!active || !formDirty.current) return true;
    if (!(await confirmDiscard())) return false;
    formDirty.current = false;
    setOverviewVersion((version) => version + 1);
    return true;
  };

  return {
    overviewVersion,
    setFormDirty: (dirty: boolean) => {
      formDirty.current = dirty;
    },
    leave,
  };
}
