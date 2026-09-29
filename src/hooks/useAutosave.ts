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
  // TODO(human): Remember the latest pending (path, content) and a timer.
  // `change` replaces the pending edit and restarts the timer; when it fires,
  // save. `flush` cancels the timer and saves now if anything is pending.
  // Return the same `change`/`flush` functions on every render.
  void save;
  void onError;
  void delayMs;
  return { change: () => {}, flush: async () => {} };
}
