import { useState } from "react";
import type { TreeNode } from "@/api/notes";
import styles from "./FileTree.module.css";

type FileTreeProps = {
  nodes: TreeNode[];
  selectedPath: string | null;
  onSelect: (path: string) => void;
};

/** A list of sibling nodes. Folders render another `FileTree` for their children. */
export function FileTree({ nodes, selectedPath, onSelect }: FileTreeProps) {
  return (
    <ul className={styles.tree}>
      {nodes.map((node) => (
        <TreeItem
          key={node.path}
          node={node}
          selectedPath={selectedPath}
          onSelect={onSelect}
        />
      ))}
    </ul>
  );
}

type TreeItemProps = {
  node: TreeNode;
  selectedPath: string | null;
  onSelect: (path: string) => void;
};

/** One row in the tree: a folder that expands and collapses, or a file. */
function TreeItem({ node, selectedPath, onSelect }: TreeItemProps) {
  const [open, setOpen] = useState(false);

  if (node.kind === "file") {
    const selected = node.path === selectedPath;
    return (
      <li>
        <button
          type="button"
          className={`${styles.row} ${styles.toggle} ${selected ? styles.selected : ""}`}
          aria-current={selected ? "page" : undefined}
          onClick={() => onSelect(node.path)}
        >
          <span className={styles.arrow} />
          {node.name}
        </button>
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
      {open && (
        <FileTree
          nodes={node.children}
          selectedPath={selectedPath}
          onSelect={onSelect}
        />
      )}
    </li>
  );
}
