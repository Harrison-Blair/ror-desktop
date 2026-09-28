import { useState } from "react";
import type { TreeNode } from "@/api/notes";
import styles from "./FileTree.module.css";

type FileTreeProps = {
  nodes: TreeNode[];
};

/** A list of sibling nodes. Folders render another `FileTree` for their children. */
export function FileTree({ nodes }: FileTreeProps) {
  return (
    <ul className={styles.tree}>
      {nodes.map((node) => (
        <TreeItem key={node.path} node={node} />
      ))}
    </ul>
  );
}

type TreeItemProps = {
  node: TreeNode;
};

/** One row in the tree: a folder that expands and collapses, or a file. */
function TreeItem({ node }: TreeItemProps) {
  const [open, setOpen] = useState(false);

  if (node.kind === "file") {
    return (
      <li>
        <span className={styles.row}>{node.name}</span>
      </li>
    );
  }

  return (
    <li>
      <button
        type="button"
        className={`${styles.row} ${styles.toggle}`}
        onClick={() => setOpen(!open)}
      >
        <span className={styles.arrow}>{open ? "▾" : "▸"}</span>
        {node.name}
      </button>
      {open && <FileTree nodes={node.children} />}
    </li>
  );
}
