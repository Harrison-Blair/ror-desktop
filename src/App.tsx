import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  AlertCircle,
  Check,
  Circle,
  FileQuestion,
  FolderOpen,
  ListOrdered,
  LoaderCircle,
  Notebook,
  RefreshCw,
  Trash2,
  UserRound,
} from "lucide-react";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { api as nativeApi, type WorkspaceApi } from "./api/workspace";
import { ImageViewer } from "./components/ImageViewer";
import { Dialog } from "./components/Overlays";
import { Player } from "./components/Player";
import { EntryIcon, IconButton, Sidebar } from "./components/Sidebar";
import { NoteEditor } from "./editor/NoteEditor";
import { type CloseHost, closeGuard } from "./workspace/close-guard";
import { WorkspaceController } from "./workspace/controller";
import "./styles/workspace.css";

type Props = { api?: WorkspaceApi; closeHost?: CloseHost };
function App({ api = nativeApi, closeHost }: Props) {
  const controller = useMemo(() => new WorkspaceController(api), [api]);
  const state = useSyncExternalStore(controller.subscribe, controller.snapshot);
  useEffect(() => {
    void controller.initialize();
    return () => controller.dispose();
  }, [controller]);
  useEffect(() => {
    const host = closeHost ?? (isTauri() ? getCurrentWindow() : undefined);
    if (host)
      return closeGuard(
        host,
        () => controller.prepareClose(),
        (error) =>
          controller.reportError(`Couldn't close the window: ${String(error)}`),
      );
  }, [controller, closeHost]);
  const { workspace, selection, dialog } = state;
  const [folderMenu, setFolderMenu] = useState(false);
  const session =
    state.activeFunction === "player"
      ? ([state.player.metadata, state.player.description].find(
          (item) => item?.status === "failed",
        ) ??
        [state.player.metadata, state.player.description].find(
          (item) => item?.dirty,
        ) ??
        state.player.metadata)
      : selection?.session;
  const loading = state.initializing || state.opening;
  const status = session?.status;
  const saveChip = session && (
    <div className="save-controls" aria-live="polite">
      <span className={`save-chip ${status}`}>
        {status === "saving" ? (
          <LoaderCircle className="spinner" />
        ) : status === "saved" ? (
          <Check />
        ) : status === "failed" ? (
          <AlertCircle />
        ) : (
          <Circle />
        )}
        <span>
          {status === "saving"
            ? "Saving…"
            : status === "saved"
              ? "Saved"
              : status === "failed"
                ? "Save failed"
                : "Unsaved"}
        </span>
      </span>
      {status === "failed" && (
        <button
          type="button"
          className="pill retry"
          disabled={state.busy}
          onClick={() => {
            void controller.retrySave();
          }}
        >
          Retry
        </button>
      )}
    </div>
  );
  return (
    <main className="workspace-app" inert={!!dialog}>
      {workspace && (
        <nav className="function-rail" aria-label="App functions">
          <IconButton
            label="Player"
            aria-pressed={state.activeFunction === "player"}
            disabled={state.busy}
            onClick={() => void controller.switchFunction("player")}
          >
            <UserRound />
          </IconButton>
          <IconButton
            label="Notes"
            aria-pressed={state.activeFunction === "notes"}
            disabled={state.busy}
            onClick={() => void controller.switchFunction("notes")}
          >
            <Notebook />
          </IconButton>
          <div className="rail-folder">
            <IconButton
              label="Workspace folder"
              title={`${workspace.name} — ${workspace.displayPath}`}
              disabled={state.busy}
              onClick={() => setFolderMenu(!folderMenu)}
            >
              <FolderOpen />
            </IconButton>
            {folderMenu && (
              <div className="folder-popover">
                <strong>{workspace.name}</strong>
                <code>{workspace.displayPath}</code>
                <button
                  type="button"
                  className="pill"
                  onClick={() => {
                    setFolderMenu(false);
                    void controller.pickFolder();
                  }}
                >
                  Open folder…
                </button>
              </div>
            )}
          </div>
        </nav>
      )}
      {workspace && state.activeFunction === "notes" && (
        <Sidebar
          key={workspace.generation}
          controller={controller}
          state={state}
        />
      )}
      <section
        className="main-pane"
        aria-label="File pane"
        aria-busy={loading || selection?.loading || state.busy}
      >
        {workspace && !loading && (
          <header className="file-header">
            {state.activeFunction === "player"
              ? saveChip
              : selection && (
                  <>
                    <div className="file-title" title={selection.node.path}>
                      <EntryIcon node={selection.node} />
                      <span>{selection.node.name}</span>
                    </div>
                    {session && (
                      <IconButton
                        label="Line numbers"
                        aria-pressed={state.preferences.lineNumbers}
                        onClick={() => {
                          void controller.patchPreferences({
                            lineNumbers: !state.preferences.lineNumbers,
                          });
                        }}
                      >
                        <ListOrdered />
                      </IconButton>
                    )}
                    {saveChip}
                  </>
                )}
          </header>
        )}
        {state.banner && (
          <div className="save-banner" role="alert">
            <span>{state.banner}</span>
            <button
              type="button"
              className="pill retry"
              disabled={state.busy}
              onClick={() => {
                void controller.retrySave();
              }}
            >
              Retry
            </button>
          </div>
        )}
        {state.message && (
          <div className="message-banner" role="alert">
            {state.message}
          </div>
        )}
        {loading ? (
          <div className="empty-state">
            <LoaderCircle className="spinner" size={28} />
            <p>
              {workspace ? `Opening ${workspace.name}…` : "Opening folder…"}
            </p>
          </div>
        ) : !workspace ? (
          <div className="empty-state">
            <div className="empty-icon">
              <FolderOpen />
            </div>
            {state.restoreError ? (
              <>
                <h1>
                  Can't find{" "}
                  {state.preferences.lastFolder
                    ?.split(/[/\\]/)
                    .filter(Boolean)
                    .pop() ?? "the folder"}
                </h1>
                {state.preferences.lastFolder && (
                  <code>{state.preferences.lastFolder}</code>
                )}
                <p>{state.restoreError}</p>
                <button
                  type="button"
                  className="pill primary"
                  onClick={() => {
                    void controller.pickFolder();
                  }}
                >
                  Open another folder
                </button>
              </>
            ) : (
              <>
                <h1>Open a folder to start</h1>
                <p>
                  Pick a folder of notes and images. It will reopen next time.
                </p>
                <button
                  type="button"
                  className="pill primary"
                  onClick={() => {
                    void controller.pickFolder();
                  }}
                >
                  Open folder
                </button>
              </>
            )}
          </div>
        ) : state.activeFunction === "player" ? (
          <Player controller={controller} state={state} />
        ) : !selection ? (
          <div className="empty-state">
            <div className="empty-icon">
              <FileQuestion />
            </div>
            <h2>No file open</h2>
            <p>Pick a note or image from the sidebar.</p>
          </div>
        ) : selection.loading ? (
          <div className="empty-state">
            <LoaderCircle className="spinner" />
            <p>Opening {selection.node.name}…</p>
          </div>
        ) : selection.error ? (
          <div className="empty-state error-state">
            <AlertCircle />
            <h2>Couldn't open {selection.node.name}</h2>
            <p>{selection.error}</p>
            <button
              type="button"
              className="pill"
              onClick={() => {
                void controller.openFile(selection.node);
              }}
            >
              Retry
            </button>
          </div>
        ) : session ? (
          <NoteEditor
            key={session.id}
            content={session.content}
            path={selection.node.path}
            generation={workspace.generation}
            revision={state.imageRevision}
            api={api}
            lineNumbers={state.preferences.lineNumbers}
            readOnly={state.busy || !!dialog || !!state.naming}
            onChange={(content) => controller.edit(content)}
          />
        ) : selection.node.kind === "file" &&
          selection.node.fileKind === "image" ? (
          <ImageViewer
            api={api}
            generation={workspace.generation}
            path={selection.node.path}
            name={selection.node.name}
            revision={state.imageRevision}
          />
        ) : (
          <div className="empty-state">
            <div className="empty-icon">
              <FileQuestion />
            </div>
            <h2>Can't open this file</h2>
          </div>
        )}
      </section>
      {dialog?.kind === "refresh" && (
        <Dialog
          title="Workspace has unsaved changes"
          icon={<RefreshCw />}
          onCancel={() => controller.dismissDialog()}
          actions={
            <>
              <button
                type="button"
                className="pill"
                disabled={state.busy}
                onClick={() => controller.dismissDialog()}
              >
                Cancel
              </button>
              <button
                type="button"
                className="pill danger-outline"
                disabled={state.busy}
                onClick={() => {
                  void controller.resolveRefresh("discard");
                }}
              >
                Discard and Reload
              </button>
              <button
                type="button"
                className="pill primary"
                disabled={state.busy}
                onClick={() => {
                  void controller.resolveRefresh("save");
                }}
              >
                Save and Refresh
              </button>
            </>
          }
        >
          <p>
            Refreshing reloads the folder, player, and selected note from disk.
          </p>
          <p className="dialog-note">
            Save and Refresh writes your version over any changes made to{" "}
            {selection?.node.name} in other apps.
          </p>
          {state.message && (
            <p className="danger-text" role="alert">
              {state.message}
            </p>
          )}
          {state.banner && (
            <p className="danger-text" role="alert">
              {state.banner}
            </p>
          )}
        </Dialog>
      )}
      {dialog?.kind === "trash" && (
        <Dialog
          title={`Move "${dialog.node.name}" to Trash?`}
          icon={<Trash2 />}
          onCancel={() => controller.dismissDialog()}
          actions={
            <>
              <button
                type="button"
                className="pill"
                disabled={state.busy}
                onClick={() => controller.dismissDialog()}
              >
                Cancel
              </button>
              <button
                type="button"
                className="pill danger"
                disabled={state.busy}
                onClick={() => {
                  void controller.confirmTrash();
                }}
              >
                Move to Trash
              </button>
            </>
          }
        >
          <p>
            {dialog.node.kind === "folder"
              ? "The folder and everything inside it"
              : "The file"}{" "}
            will go to your system Trash. You can restore it from there.
          </p>
        </Dialog>
      )}
      {dialog?.kind === "trash-error" && (
        <Dialog
          title={`Couldn't move "${dialog.node.name}" to Trash`}
          icon={<AlertCircle />}
          onCancel={() => controller.dismissDialog()}
          actions={
            <button
              type="button"
              className="pill primary"
              onClick={() => controller.dismissDialog()}
            >
              OK
            </button>
          }
        >
          <p>
            Nothing was deleted. The{" "}
            {dialog.node.kind === "folder" ? "folder" : "file"} is still where
            it was.
          </p>
          <p className="danger-text">{dialog.error}</p>
        </Dialog>
      )}
    </main>
  );
}
export default App;
