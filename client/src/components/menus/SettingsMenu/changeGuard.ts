// The key or provider change that is running, if any. It outlives the
// Settings page, so changes stay one at a time across leaving and returning.
let running: Promise<void> | null = null;

export const runningChange = () => running;

// Runs the change unless another one is running. Returns its promise, or null
// when it didn't run. The change must not reject.
export function startChange(change: () => Promise<void>) {
  if (running) return null;
  const run: Promise<void> = change().finally(() => {
    if (running === run) running = null;
  });
  running = run;
  return run;
}

// For tests: forgets a change that a test left running.
export function resetChangeGuard() {
  running = null;
}
