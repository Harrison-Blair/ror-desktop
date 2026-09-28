import { useState } from "react";
import { listTree, pickFolder, type TreeNode } from "@/api/notes";
import { FileTree } from "@/components/FileTree";
import styles from "./App.module.css";

function App() {
  const [folderName, setFolderName] = useState<string | null>(null);
  const [tree, setTree] = useState<TreeNode[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function openFolder() {
    try {
      const name = await pickFolder();
      if (name === null) return;
      setFolderName(name);
      setTree(await listTree());
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
        <FileTree nodes={tree} />
      </aside>
      <main className={styles.editorPane}>
        <p className={styles.empty}>
          {folderName ? "Select a note" : "Open a folder to get started"}
        </p>
      </main>
    </div>
  );
}

export default App;
