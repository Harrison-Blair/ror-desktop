import { useCallback, useRef } from "react";

export type Autosave = {
  /** Call on every edit. Saves once edits have paused for `delayMs`. */
  change: (path: string, content: string) => void;
  /** Saves any pending edit right now. Resolves once it is on disk. */
  flush: () => Promise<void>;
};

/**
 * Debounced saving for the open note.
 *
 * `save` and `onError` must be stable (not recreated each render). Errors
 * from saves that `change` triggers go to `onError`; errors from `flush` reject
 * its promise instead, so the caller can decide what to do.
 */
export function useAutosave(
  save: (path: string, content: string) => Promise<void>,
  onError: (error: unknown) => void,
  delayMs = 500,
): Autosave {
  const pending = useRef<{ path: string; content: string } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flush = useCallback(async () => {
    if (timer.current !== null) {
      clearTimeout(timer.current);
      timer.current = null;
    }

    const edit = pending.current;
    if (edit === null) return;
    pending.current = null;

    await save(edit.path, edit.content);
  }, [save]);

  const change = useCallback(
    (path: string, content: string) => {
      pending.current = { path, content };

      if (timer.current !== null) {
        clearTimeout(timer.current);
      }
      timer.current = setTimeout(() => {
        flush().catch(onError);
      }, delayMs);
    },
    [flush, onError, delayMs],
  );

  return { change, flush };
}
