import { useCallback, useEffect, useRef, useState } from "react";
import { useToast } from "@/components/Toast/Toast";
import { errorMessage } from "@/lib/errorMessage";
import type { World } from "@/lib/peopleApi";
import {
  type Action,
  getSession,
  type Snapshot,
  sessionAct,
} from "@/lib/sessionApi";

export type TableData = {
  snapshot?: Snapshot;
  error?: string;
  reload: () => Promise<void>;
  // Runs an action. Resolves false when it failed; a toast says why.
  act: (action: Action) => Promise<boolean>;
  // Runs an action. Resolves to why it failed, or null, with no toast.
  tryAct: (action: Action) => Promise<string | null>;
};

// A play night ends by itself after this long with no activity (table.rs).
export const IDLE_MS = 6 * 60 * 60 * 1000;

// Kept in the app shell, so the timer pill and the Session pages share one
// copy. `onWorld` gets the World when an action changed it.
export function useTable(onWorld: (world: World) => void): TableData {
  const notify = useToast();
  const [snapshot, setSnapshot] = useState<Snapshot>();
  const [error, setError] = useState<string>();
  // Counts loads and actions, so an older answer never replaces a newer one.
  const version = useRef(0);
  const latestOnWorld = useRef(onWorld);
  latestOnWorld.current = onWorld;

  const reload = useCallback(async () => {
    const mine = ++version.current;
    try {
      const next = await getSession();
      if (mine !== version.current) return;
      setSnapshot(next);
      setError(undefined);
    } catch (e) {
      if (mine !== version.current) return;
      setError(errorMessage(e));
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const tryAct = useCallback(
    async (action: Action) => {
      const mine = ++version.current;
      try {
        const next = await sessionAct(action);
        if (next.world) latestOnWorld.current(next.world);
        if (mine === version.current) {
          setSnapshot(next);
          setError(undefined);
        }
        return null;
      } catch (e) {
        // The table may have moved on, such as a night that ended idle.
        reload();
        return errorMessage(e);
      }
    },
    [reload],
  );

  const act = useCallback(
    async (action: Action) => {
      const failed = await tryAct(action);
      if (failed !== null) notify({ kind: "error", message: failed });
      return failed === null;
    },
    [tryAct, notify],
  );

  // A running night ends six hours after its last activity. Load again
  // then; a note edit since then shows as a later deadline.
  const idleAt = snapshot?.nights.find(
    (n) => n.endedAt === null,
  )?.lastActivityAt;
  useEffect(() => {
    if (idleAt === undefined) return;
    const wait = Math.max(0, idleAt + IDLE_MS - Date.now()) + 1000;
    const id = setTimeout(reload, wait);
    return () => clearTimeout(id);
  }, [idleAt, reload]);

  return { snapshot, error, reload, act, tryAct };
}

// The time now, every quarter second while `ticking`.
export function useNow(ticking: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    setNow(Date.now());
    if (!ticking) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [ticking]);
  return now;
}
