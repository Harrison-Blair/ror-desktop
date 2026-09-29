import { getCurrentWindow } from "@tauri-apps/api/window";
import { useCallback, useEffect, useState } from "react";
import {
  listTree,
  pickFolder,
  readNote,
  type TreeNode,
  writeNote,
} from "@/api/notes";
import { Editor } from "@/components/Editor";
import { FileTree } from "@/components/FileTree";
import { useAutosave } from "@/hooks/useAutosave";
import styles from "./App.module.css";

type OpenNote = {
  path: string;
  /** Contents when the note was opened; the editor owns them after that. */
  content: string;
};

function App() {
  const [folderName, setFolderName] = useState<string | null>(null);
  const [tree, setTree] = useState<TreeNode[]>([]);
  const [note, setNote] = useState<OpenNote | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reportError = useCallback((e: unknown) => setError(String(e)), []);
  const { change, flush } = useAutosave(writeNote, reportError);

  // Save pending edits before the window closes. If saving fails, log it and
  // close anyway rather than trapping the user in the app.
  useEffect(() => {
    const unlisten = getCurrentWindow().onCloseRequested(async () => {
      try {
        await flush();
      } catch (e) {
        console.error("could not save before closing", e);
      }
    });
    return () => {
      void unlisten.then((stop) => stop());
    };
  }, [flush]);

  async function openFolder() {
    try {
      // Flush first: paths are relative to the root, so a save that lands
      // after the root changes would write into the new folder.
      await flush();
      const name = await pickFolder();
      if (name === null) return;
      setFolderName(name);
      setNote(null);
      setTree(await listTree());
      setError(null);
    } catch (e) {
      setError(String(e));
    }
  }

  async function openNote(path: string) {
    if (path === note?.path) return;
    try {
      await flush();
      setNote({ path, content: await readNote(path) });
      setError(null);
    } catch (e) {
      setError(String(e));
    }
  }

  return (
    <div className={styles.app}>
      <aside className={styles.sidebar}>
        <button type="button" onClick={openFolder}>
          Open folder…
        </button>
        {folderName && <h2 className={styles.folderName}>{folderName}</h2>}
        {error && <p className={styles.error}>{error}</p>}
        <FileTree
          nodes={tree}
          selectedPath={note?.path ?? null}
          onSelect={openNote}
        />
      </aside>
      <main className={styles.editorPane}>
        {note ? (
          <Editor
            key={note.path}
            initialDoc={note.content}
            onChange={(doc) => change(note.path, doc)}
          />
        ) : (
          <p className={styles.empty}>
            {folderName ? "Select a note" : "Open a folder to get started"}
          </p>
        )}
      </main>
    </div>
  );
}

export default App;
