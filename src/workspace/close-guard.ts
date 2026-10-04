export type CloseHost = {
  onCloseRequested: (
    callback: (event: { preventDefault(): void }) => void,
  ) => Promise<() => void | Promise<void>>;
  close(): Promise<void>;
};

export function closeGuard(
  host: CloseHost,
  prepare: () => Promise<boolean>,
  failed: (error: unknown) => void,
) {
  let disposed = false;
  let closing = false;
  const listen = () =>
    host.onCloseRequested((event) => {
      event.preventDefault();
      if (closing || disposed) return;
      closing = true;
      void prepare()
        .then(async (saved) => {
          if (saved && !disposed) {
            // Tauri's listener wrapper destroys an allowed window. Remove it first
            // so the normal close command can finish with only allow-close access.
            const stop = await unlisten;
            await stop();
            if (disposed) return;
            try {
              await host.close();
            } catch (error) {
              if (!disposed) {
                unlisten = listen();
                await unlisten;
              }
              throw error;
            }
          }
        })
        .catch((error) => {
          failed(error);
        })
        .finally(() => {
          closing = false;
        });
    });
  let unlisten = listen();
  void unlisten.catch(failed);
  return () => {
    disposed = true;
    void unlisten.then((stop) => stop()).catch(() => {});
  };
}
