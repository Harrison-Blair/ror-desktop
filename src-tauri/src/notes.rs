//! Access to the notes folder the user opened.
//!
//! The absolute path of that folder lives only here, in Rust state. The
//! frontend only ever sees paths relative to it, so commands can never be
//! pointed outside the notes folder.

use std::fs;
use std::path::{Component, Path, PathBuf};
use std::sync::Mutex;

use serde::Serialize;
use tauri::{AppHandle, State};
use tauri_plugin_dialog::DialogExt;

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
    let Some(folder_path) = app.dialog().file().blocking_pick_folder() else {
        return Ok(None);
    };

    let path = folder_path.into_path().map_err(|e| e.to_string())?;
    let name = path
        .file_name()
        .unwrap_or(path.as_os_str())
        .to_string_lossy()
        .into_owned();

    *root.0.lock().unwrap() = Some(path);

    Ok(Some(name))
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

/// Returns the contents of the note at `path` (relative to the notes root).
#[tauri::command]
pub async fn read_note(root: State<'_, NotesRoot>, path: String) -> Result<String, String> {
    let root = root
        .0
        .lock()
        .unwrap()
        .clone()
        .ok_or("no notes folder is open")?;

    let note_path = resolve(&root, &path)?;

    fs::read_to_string(note_path).map_err(|e| e.to_string())
}

/// Replaces the contents of the note at `path` (relative to the notes root).
#[tauri::command]
pub async fn write_note(
    root: State<'_, NotesRoot>,
    path: String,
    content: String,
) -> Result<(), String> {
    let root = root
        .0
        .lock()
        .unwrap()
        .clone()
        .ok_or("no notes folder is open")?;

    let note_path = resolve(&root, &path)?;

    fs::write(note_path, content).map_err(|e| e.to_string())
}

/// Turns a path from the frontend into an absolute path inside `root`, or an
/// error if it could point anywhere else.
pub fn resolve(root: &Path, rel: &str) -> Result<PathBuf, String> {
    if rel.is_empty() {
        return Err("note path is empty".to_string());
    }

    let mut path = root.to_path_buf();
    for component in Path::new(rel).components() {
        match component {
            Component::Normal(name) => path.push(name),
            _ => return Err(format!("invalid node path: {rel}")),
        }
    }

    Ok(path)
}

/// Walks `root` and builds the sidebar tree: folders and `.md` files, hidden
/// entries skipped, folders before files, names compared case-insensitively.
pub fn build_tree(root: &Path) -> Result<Vec<TreeNode>, String> {
    walk(root, "")
}

fn walk(dir: &Path, rel: &str) -> Result<Vec<TreeNode>, String> {
    let mut entries = Vec::new();
    for entry in fs::read_dir(dir).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let name = entry.file_name().to_string_lossy().into_owned();
        if name.starts_with('.') {
            continue;
        }
        let is_dir = entry.file_type().map_err(|e| e.to_string())?.is_dir();
        if !is_dir && !name.ends_with(".md") {
            continue;
        }
        entries.push((is_dir, name));
    }

    // `false < true`, so keying on `!is_dir` puts folders before files.
    entries.sort_by_key(|(is_dir, name)| (!is_dir, name.to_lowercase()));

    entries
        .into_iter()
        .map(|(is_dir, name)| {
            let path = if rel.is_empty() {
                name.clone()
            } else {
                format!("{rel}/{name}")
            };
            Ok(if is_dir {
                let children = walk(&dir.join(&name), &path)?;
                TreeNode::Folder {
                    name,
                    path,
                    children,
                }
            } else {
                TreeNode::File { name, path }
            })
        })
        .collect()
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

    #[test]
    fn resolve_joins_relative_paths_under_root() {
        let root = Path::new("/notes");
        assert_eq!(
            resolve(root, "campaign/overview.md").unwrap(),
            root.join("campaign").join("overview.md")
        );
    }

    #[test]
    fn resolve_rejects_parent_components() {
        let root = Path::new("/notes");
        assert!(resolve(root, "../secret.md").is_err());
        assert!(resolve(root, "campaign/../../secret.md").is_err());
    }

    #[test]
    fn resolve_rejects_absolute_paths() {
        assert!(resolve(Path::new("/notes"), "/etc/passwd").is_err());
    }

    #[test]
    fn resolve_rejects_empty_path() {
        assert!(resolve(Path::new("/notes"), "").is_err());
    }
}
