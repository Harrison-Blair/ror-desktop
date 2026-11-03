import { useEffect, useRef, useState } from "react";
import { useToast } from "@/components/Toast/Toast";
import { errorMessage } from "@/lib/errorMessage";
import { updateWorld, type World } from "@/lib/peopleApi";

// The draft and the save of a form that edits part of the World. `toDraft`
// picks the part, and must not change between renders.
export function useWorldForm<Draft>({
  world,
  toDraft,
  onSaved,
  onDirty,
}: {
  world: World;
  toDraft: (world: World) => Draft;
  onSaved: (world: World) => void;
  onDirty: (dirty: boolean) => void;
}) {
  const notify = useToast();
  const [draft, setDraft] = useState(() => toDraft(world));
  const [previousWorld, setPreviousWorld] = useState(world);
  const [busy, setBusy] = useState(false);
  const saving = useRef(false);
  // A reload can finish after this form mounts. Follow it only while the
  // draft still matches its previous source; keep edits and pending saves.
  if (world !== previousWorld) {
    if (
      !busy &&
      JSON.stringify(draft) === JSON.stringify(toDraft(previousWorld))
    ) {
      setDraft(toDraft(world));
    }
    setPreviousWorld(world);
  }
  const dirty =
    busy || JSON.stringify(draft) !== JSON.stringify(toDraft(world));
  useEffect(() => {
    onDirty(dirty);
    return () => onDirty(false);
  }, [dirty, onDirty]);
  // Saves the full World: the form's part from the draft, the rest as saved.
  const save = async (next: World) => {
    if (saving.current) return;
    saving.current = true;
    setBusy(true);
    try {
      const saved = await updateWorld(next);
      onSaved(saved);
      setDraft(toDraft(saved));
    } catch (e) {
      notify({ kind: "error", message: errorMessage(e) });
    } finally {
      saving.current = false;
      setBusy(false);
    }
  };
  return { draft, setDraft, busy, save };
}
