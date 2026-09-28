import type { TreeNode } from "@/api/notes";
import styles from "./FileTree.module.css";

type FileTreeProps = {
  nodes: TreeNode[];
};

export function FileTree({ nodes }: FileTreeProps) {
  // TODO(human): Render `nodes` as a tree. Folders expand and collapse to show
  // their children; files are plain rows. The JSON dump below is a stand-in so
  // you can see what Rust sends before writing the real component.
  return <pre className={styles.debug}>{JSON.stringify(nodes, null, 2)}</pre>;
}
