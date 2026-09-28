//! Access to the notes folder the user opened.
//!
//! The absolute path of that folder lives only here, in Rust state. The
//! frontend only ever sees paths relative to it, so commands can never be
//! pointed outside the notes folder.

use std::path::{Path, PathBuf};
use std::sync::Mutex;

use serde::Serialize;
use tauri::{AppHandle, State};

/// The notes folder the user opened, if any.
#[derive(Default)]
pub struct NotesRoot(pub Mutex<Option<PathBuf>>);

/// One entry in the sidebar tree.
///
/// `path` is relative to the notes root and always uses `/` separators, on
/// every OS. Serialized as `{ "kind": "folder" | "file", ... }`, mirrored by
/// `TreeNode` in `src/api/notes.ts`.
#[derive(Debug, PartialEq, Serialize)]
#[serde(tag = "kind", rename_all = "lowercase")]
#[expect(dead_code, reason = "remove once build_tree constructs nodes")]
pub enum TreeNode {
    Folder {
        name: String,
        path: String,
        children: Vec<TreeNode>,
    },
    File {
        name: String,
        path: String,
    },
}

/// Shows a native folder picker. If the user picks a folder, stores it as the
/// notes root and returns the folder's name; returns `None` if they cancel.
#[tauri::command]
pub async fn pick_folder(
    app: AppHandle,
    root: State<'_, NotesRoot>,
) -> Result<Option<String>, String> {
    // TODO(human): Show the folder picker, store the choice in `root`, and
    // return the folder's display name (never its absolute path).
    let _ = (app, root);
    todo!()
}

/// Returns the tree of folders and Markdown files in the open notes folder.
#[tauri::command]
pub fn list_tree(root: State<'_, NotesRoot>) -> Result<Vec<TreeNode>, String> {
    let root = root
        .0
        .lock()
        .unwrap()
        .clone()
        .ok_or("no notes folder is open")?;
    build_tree(&root)
}

/// Walks `root` and builds the sidebar tree: folders and `.md` files, hidden
/// entries skipped, folders before files, names compared case-insensitively.
pub fn build_tree(root: &Path) -> Result<Vec<TreeNode>, String> {
    // TODO(human): Recursively read `root` and build the tree the tests below
    // describe.
    let _ = root;
    todo!()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn file(path: &str) -> TreeNode {
        TreeNode::File {
            name: path.rsplit('/').next().unwrap().to_string(),
            path: path.to_string(),
        }
    }

    fn folder(path: &str, children: Vec<TreeNode>) -> TreeNode {
        TreeNode::Folder {
            name: path.rsplit('/').next().unwrap().to_string(),
            path: path.to_string(),
            children,
        }
    }

    #[test]
    fn lists_nested_folders_with_relative_paths() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        fs::create_dir_all(root.join("campaign/sessions")).unwrap();
        fs::write(root.join("npcs.md"), "").unwrap();
        fs::write(root.join("campaign/overview.md"), "").unwrap();
        fs::write(root.join("campaign/sessions/turn-3.md"), "").unwrap();

        assert_eq!(
            build_tree(root).unwrap(),
            vec![
                folder(
                    "campaign",
                    vec![
                        folder(
                            "campaign/sessions",
                            vec![file("campaign/sessions/turn-3.md")]
                        ),
                        file("campaign/overview.md"),
                    ]
                ),
                file("npcs.md"),
            ]
        );
    }

    #[test]
    fn skips_hidden_entries_and_non_markdown_files() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        fs::create_dir_all(root.join(".obsidian")).unwrap();
        fs::write(root.join(".obsidian/workspace.md"), "").unwrap();
        fs::write(root.join(".draft.md"), "").unwrap();
        fs::write(root.join("map.png"), "").unwrap();
        fs::write(root.join("notes.txt"), "").unwrap();
        fs::write(root.join("keep.md"), "").unwrap();

        assert_eq!(build_tree(root).unwrap(), vec![file("keep.md")]);
    }

    #[test]
    fn sorts_folders_first_then_names_case_insensitively() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        fs::create_dir(root.join("zeta")).unwrap();
        fs::create_dir(root.join("Alpha")).unwrap();
        fs::write(root.join("B.md"), "").unwrap();
        fs::write(root.join("a.md"), "").unwrap();

        assert_eq!(
            build_tree(root).unwrap(),
            vec![
                folder("Alpha", vec![]),
                folder("zeta", vec![]),
                file("a.md"),
                file("B.md"),
            ]
        );
    }

    #[test]
    fn errors_when_root_does_not_exist() {
        let dir = tempfile::tempdir().unwrap();
        assert!(build_tree(&dir.path().join("missing")).is_err());
    }
}
