export type CloseHost = {
  onCloseRequested: (
    callback: (event: { preventDefault(): void }) => void,
  ) => Promise<() => void>;
  close(): Promise<void>;
};

export function closeGuard(
  host: CloseHost,
  prepare: () => Promise<boolean>,
  failed: (error: unknown) => void,
) {
  let disposed = false;
  let closing = false;
  let allowClose = false;
  const unlisten = host.onCloseRequested((event) => {
    if (allowClose) return;
    event.preventDefault();
    if (closing || disposed) return;
    closing = true;
    void prepare()
      .then(async (saved) => {
        if (saved && !disposed) {
          allowClose = true;
          await host.close();
        }
      })
      .catch((error) => {
        allowClose = false;
        failed(error);
      })
      .finally(() => {
        closing = false;
      });
  });
  void unlisten.catch(failed);
  return () => {
    disposed = true;
    void unlisten.then((stop) => stop()).catch(() => {});
  };
}
