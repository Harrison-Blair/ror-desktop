use serde::{Deserialize, Serialize};
use std::{
    fs::{self, File, OpenOptions},
    io::{Read, Write},
    path::{Component, Path, PathBuf},
};

type Result<T> = std::result::Result<T, String>;

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Preferences {
    pub last_folder: Option<String>,
    pub sidebar_width: f64,
    pub sidebar_collapsed: bool,
    pub show_hidden: bool,
    pub line_numbers: bool,
}

impl Default for Preferences {
    fn default() -> Self {
        Self {
            last_folder: None,
            sidebar_width: 260.0,
            sidebar_collapsed: false,
            show_hidden: false,
            line_numbers: false,
        }
    }
}

#[derive(Default, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PreferencesPatch {
    pub sidebar_width: Option<f64>,
    pub sidebar_collapsed: Option<bool>,
    pub show_hidden: Option<bool>,
    pub line_numbers: Option<bool>,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum FileKind {
    Note,
    Image,
    Other,
}

#[derive(Clone, Debug, Serialize)]
#[serde(
    tag = "kind",
    rename_all = "lowercase",
    rename_all_fields = "camelCase"
)]
pub enum TreeNode {
    Folder {
        name: String,
        path: String,
        is_symlink: bool,
        children: Vec<TreeNode>,
    },
    File {
        name: String,
        path: String,
        is_symlink: bool,
        file_kind: FileKind,
    },
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Workspace {
    pub generation: u64,
    pub name: String,
    pub display_path: String,
    pub nodes: Vec<TreeNode>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Bootstrap {
    pub preferences: Preferences,
    pub workspace: Option<Workspace>,
    pub restore_error: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct RenameResult {
    pub workspace: Workspace,
    pub path: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum EntryKind {
    Note,
    Folder,
}

pub struct WorkspaceStore {
    config: PathBuf,
    preferences: Preferences,
    root: Option<PathBuf>,
    generation: u64,
    loaded: bool,
    restore_error: Option<String>,
}

impl WorkspaceStore {
    pub fn new(config: PathBuf) -> Self {
        Self {
            config,
            preferences: Preferences::default(),
            root: None,
            generation: 0,
            loaded: false,
            restore_error: None,
        }
    }

    pub fn initialize(&mut self) -> Result<Bootstrap> {
        self.load()?;
        Ok(Bootstrap {
            preferences: self.preferences.clone(),
            workspace: self
                .root
                .as_ref()
                .map(|_| self.refresh(self.generation))
                .transpose()?,
            restore_error: self.restore_error.clone(),
        })
    }

    fn load(&mut self) -> Result<()> {
        if self.loaded {
            return Ok(());
        }
        self.preferences = match fs::read(&self.config) {
            Ok(bytes) => serde_json::from_slice(&bytes)
                .map_err(|e| format!("Could not read preferences: {e}"))?,
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Preferences::default(),
            Err(e) => return Err(format!("Could not read preferences: {e}")),
        };
        self.loaded = true;
        if let Some(folder) = &self.preferences.last_folder {
            match candidate(Path::new(folder), self.generation + 1) {
                Ok((root, workspace)) => {
                    self.root = Some(root);
                    self.generation = workspace.generation;
                }
                Err(error) => self.restore_error = Some(error),
            }
        }
        Ok(())
    }

    pub fn pick(&mut self, path: Option<PathBuf>) -> Result<Option<Workspace>> {
        let Some(path) = path else {
            return Ok(None);
        };
        self.load()?;
        let (root, workspace) = candidate(&path, self.generation + 1)?;
        let preferences = Preferences {
            last_folder: Some(path_text(&root)?),
            ..self.preferences.clone()
        };
        self.persist(&preferences)?;
        self.preferences = preferences;
        self.root = Some(root);
        self.generation = workspace.generation;
        self.restore_error = None;
        Ok(Some(workspace))
    }

    fn root(&self, generation: u64) -> Result<&Path> {
        if generation != self.generation {
            return Err("The workspace changed; reload before continuing".into());
        }
        let root = self.root.as_deref().ok_or("No folder is open")?;
        // Recheck on each operation in case the folder was moved or replaced with a link.
        if at(root, fs::canonicalize(root))? != root {
            return Err("The workspace folder changed on disk".into());
        }
        Ok(root)
    }

    pub fn refresh(&self, generation: u64) -> Result<Workspace> {
        snapshot(self.root(generation)?, generation)
    }

    pub fn read_note(&self, generation: u64, path: &str) -> Result<String> {
        let root = self.root(generation)?;
        require_kind(path, FileKind::Note)?;
        let resolved = contained_file(root, &relative(path, false)?)?;
        let mut file = at(&resolved, File::open(&resolved))?;
        let mut content = String::new();
        at(&resolved, file.read_to_string(&mut content))?;
        Ok(content)
    }

    pub fn write_note(&self, generation: u64, path: &str, content: &str) -> Result<()> {
        let root = self.root(generation)?;
        require_kind(path, FileKind::Note)?;
        let relative = relative(path, false)?;
        mutation_parent(root, relative.parent().unwrap_or(Path::new("")))?;
        let resolved = contained_file(root, &relative)?;
        // Open an existing regular file; a save must never recreate a deleted note.
        let mut file = at(&resolved, OpenOptions::new().write(true).open(&resolved))?;
        if !at(&resolved, file.metadata())?.is_file() {
            return Err("Only regular files can be saved".into());
        }
        at(&resolved, file.set_len(0))?;
        at(&resolved, file.write_all(content.as_bytes()))
    }

    pub fn read_image(
        &self,
        generation: u64,
        path: &str,
        note_path: Option<&str>,
    ) -> Result<Vec<u8>> {
        let root = self.root(generation)?;
        require_kind(path, FileKind::Image)?;
        let destination = if let Some(note_path) = note_path {
            let note = relative(note_path, false)?;
            require_kind(note_path, FileKind::Note)?;
            contained_file(root, &note)?;
            // The frontend decodes Markdown destinations once. Do not decode again.
            if path.is_empty()
                || path.starts_with('/')
                || path.contains(['\\', ':'])
                || path.chars().any(char::is_control)
            {
                return Err("Images must use a local relative path".into());
            }
            note.parent().unwrap_or(Path::new("")).join(path)
        } else {
            relative(path, false)?
        };
        let resolved = contained_file(root, &destination)?;
        at(&resolved, fs::read(&resolved))
    }

    pub fn create(
        &self,
        generation: u64,
        parent: &str,
        name: &str,
        kind: EntryKind,
    ) -> Result<Workspace> {
        let root = self.root(generation)?;
        validate_name(name)?;
        let parent = mutation_parent(root, &relative(parent, true)?)?;
        let target = parent.join(name);
        match kind {
            EntryKind::Note => {
                at(
                    &target,
                    OpenOptions::new()
                        .write(true)
                        .create_new(true)
                        .open(&target),
                )?;
            }
            EntryKind::Folder => at(&target, fs::create_dir(&target))?,
        }
        self.refresh(generation)
    }

    pub fn rename(&self, generation: u64, path: &str, name: &str) -> Result<RenameResult> {
        let root = self.root(generation)?;
        validate_name(name)?;
        let relative = relative(path, false)?;
        let parent_relative = relative.parent().unwrap_or(Path::new(""));
        let parent = mutation_parent(root, parent_relative)?;
        let source = parent.join(
            relative
                .file_name()
                .ok_or("Cannot rename the workspace root")?,
        );
        at(&source, fs::symlink_metadata(&source))?;
        let target = parent.join(name);
        if source != target {
            // An exact directory entry is a collision even if both names are hardlinks.
            let exact_target_exists = at(&parent, fs::read_dir(&parent))?
                .map(|entry| at(&parent, entry).map(|entry| entry.file_name() == name))
                .collect::<Result<Vec<_>>>()?
                .into_iter()
                .any(|exists| exists);
            if exact_target_exists {
                return Err(format!("An entry named {name} already exists"));
            }
            let target_exists = match fs::symlink_metadata(&target) {
                Ok(_) => true,
                Err(e) if e.kind() == std::io::ErrorKind::NotFound => false,
                Err(e) => return Err(format!("{}: {e}", target.display())),
            };
            if target_exists {
                let source_name = source
                    .file_name()
                    .and_then(|s| s.to_str())
                    .ok_or("Invalid filename")?;
                if source_name.to_lowercase() != name.to_lowercase() {
                    return Err("The destination already exists".into());
                }
                // Case-insensitive volumes resolve the new spelling to the old entry.
                rename_case_only_with(&source, &target, |from, to| {
                    renamore::rename_exclusive(from, to)
                })?;
            } else {
                at(&source, renamore::rename_exclusive(&source, &target))?;
            }
        }
        Ok(RenameResult {
            workspace: self.refresh(generation)?,
            path: relative_text(&parent_relative.join(name))?,
        })
    }

    pub fn trash_with(
        &self,
        generation: u64,
        path: &str,
        trash: impl FnOnce(&Path) -> Result<()>,
    ) -> Result<Workspace> {
        let root = self.root(generation)?;
        let relative = relative(path, false)?;
        let parent = mutation_parent(root, relative.parent().unwrap_or(Path::new("")))?;
        // Resolve the parent, preserving the final symlink entry for the OS trash API.
        let entry = parent.join(
            relative
                .file_name()
                .ok_or("Cannot trash the workspace root")?,
        );
        at(&entry, fs::symlink_metadata(&entry))?;
        trash(&entry)?;
        self.refresh(generation)
    }

    pub fn update_preferences(&mut self, patch: PreferencesPatch) -> Result<Preferences> {
        self.load()?;
        let mut next = self.preferences.clone();
        if let Some(width) = patch.sidebar_width {
            if !width.is_finite() || width <= 0.0 {
                return Err("Sidebar width must be a positive number".into());
            }
            next.sidebar_width = width;
        }
        if let Some(value) = patch.sidebar_collapsed {
            next.sidebar_collapsed = value;
        }
        if let Some(value) = patch.show_hidden {
            next.show_hidden = value;
        }
        if let Some(value) = patch.line_numbers {
            next.line_numbers = value;
        }
        self.persist(&next)?;
        self.preferences = next.clone();
        Ok(next)
    }

    fn persist(&self, preferences: &Preferences) -> Result<()> {
        let parent = self.config.parent().ok_or("Invalid preferences location")?;
        at(parent, fs::create_dir_all(parent))?;
        let mut file = at(parent, tempfile::NamedTempFile::new_in(parent))?;
        serde_json::to_writer_pretty(&mut file, preferences)
            .map_err(|e| format!("Could not save preferences: {e}"))?;
        at(&self.config, file.as_file().sync_all())?;
        file.persist(&self.config)
            .map_err(|e| format!("Could not save preferences: {e}"))?;
        Ok(())
    }
}

fn at<T>(path: &Path, result: std::io::Result<T>) -> Result<T> {
    result.map_err(|error| format!("{}: {error}", path.display()))
}

fn path_text(path: &Path) -> Result<String> {
    path.to_str()
        .map(str::to_owned)
        .ok_or_else(|| format!("A path is not valid UTF-8: {}", path.display()))
}

fn relative_text(path: &Path) -> Result<String> {
    path.components()
        .map(|component| path_text(Path::new(component.as_os_str())))
        .collect::<Result<Vec<_>>>()
        .map(|parts| parts.join("/"))
}

fn relative(path: &str, allow_root: bool) -> Result<PathBuf> {
    if path.is_empty() && allow_root {
        return Ok(PathBuf::new());
    }
    if path.is_empty()
        || path.starts_with('/')
        || path.contains(['\\', ':'])
        || path.chars().any(char::is_control)
        || path
            .split('/')
            .any(|part| part.is_empty() || part == "." || part == "..")
    {
        return Err("Use a path relative to the open folder".into());
    }
    let result = PathBuf::from(path);
    if result
        .components()
        .any(|part| !matches!(part, Component::Normal(_)))
    {
        return Err("Use a path relative to the open folder".into());
    }
    Ok(result)
}

fn contained_file(root: &Path, relative: &Path) -> Result<PathBuf> {
    let path = root.join(relative);
    let canonical = at(&path, fs::canonicalize(&path))?;
    if !canonical.starts_with(root) {
        return Err("The file is outside the open folder".into());
    }
    if !at(&canonical, fs::metadata(&canonical))?.is_file() {
        return Err("Only regular files can be opened".into());
    }
    Ok(canonical)
}

fn mutation_parent(root: &Path, relative: &Path) -> Result<PathBuf> {
    let mut parent = root.to_owned();
    for component in relative.components() {
        if !matches!(component, Component::Normal(_)) {
            return Err("Invalid parent folder".into());
        }
        parent.push(component);
        let metadata = at(&parent, fs::symlink_metadata(&parent))?;
        if metadata.is_symlink() || !metadata.is_dir() {
            return Err("Changes through linked directories are not allowed".into());
        }
    }
    let canonical = at(&parent, fs::canonicalize(&parent))?;
    if !canonical.starts_with(root) {
        return Err("The folder is outside the open folder".into());
    }
    Ok(canonical)
}

fn validate_name(name: &str) -> Result<()> {
    if name.trim().is_empty()
        || name.ends_with(['.', ' '])
        || name.contains(['/', '\\', ':', '*', '?', '"', '<', '>', '|'])
        || name.chars().any(char::is_control)
    {
        return Err(
            "Use a nonempty name without reserved characters or a trailing dot or space".into(),
        );
    }
    Ok(())
}

fn file_kind(path: &str) -> FileKind {
    match Path::new(path)
        .extension()
        .and_then(|s| s.to_str())
        .unwrap_or("")
        .to_ascii_lowercase()
        .as_str()
    {
        "md" | "markdown" => FileKind::Note,
        "png" | "jpg" | "jpeg" | "gif" | "webp" => FileKind::Image,
        _ => FileKind::Other,
    }
}

fn require_kind(path: &str, expected: FileKind) -> Result<()> {
    if file_kind(path) != expected {
        return Err("This file type is not supported for this operation".into());
    }
    Ok(())
}

fn candidate(path: &Path, generation: u64) -> Result<(PathBuf, Workspace)> {
    let root = at(path, fs::canonicalize(path))?;
    let workspace = snapshot(&root, generation)?;
    Ok((root, workspace))
}

fn snapshot(root: &Path, generation: u64) -> Result<Workspace> {
    let display_path = path_text(root)?;
    let name = root
        .file_name()
        .map(|name| path_text(Path::new(name)))
        .transpose()?
        .unwrap_or_else(|| display_path.clone());
    Ok(Workspace {
        generation,
        name,
        display_path,
        nodes: scan(root, root)?,
    })
}

fn scan(root: &Path, directory: &Path) -> Result<Vec<TreeNode>> {
    let mut nodes = Vec::new();
    for entry in at(directory, fs::read_dir(directory))? {
        let entry = at(directory, entry)?;
        let path = entry.path();
        let name = path_text(Path::new(&entry.file_name()))?;
        let relative = relative_text(path.strip_prefix(root).map_err(|e| e.to_string())?)?;
        let metadata = at(&path, fs::symlink_metadata(&path))?;
        let is_symlink = metadata.is_symlink();
        let is_directory = if is_symlink {
            match fs::metadata(&path) {
                Ok(target) => target.is_dir(),
                Err(e) if e.kind() == std::io::ErrorKind::NotFound => false,
                Err(e) => return Err(format!("{}: {e}", path.display())),
            }
        } else {
            metadata.is_dir()
        };
        let node = if is_directory {
            TreeNode::Folder {
                name: name.clone(),
                path: relative,
                is_symlink,
                children: if is_symlink {
                    Vec::new()
                } else {
                    scan(root, &path)?
                },
            }
        } else {
            TreeNode::File {
                name: name.clone(),
                path: relative,
                is_symlink,
                file_kind: file_kind(&name),
            }
        };
        nodes.push((!is_directory, name.to_lowercase(), name, node));
    }
    nodes.sort_by(|a, b| (&a.0, &a.1, &a.2).cmp(&(&b.0, &b.1, &b.2)));
    Ok(nodes.into_iter().map(|(_, _, _, node)| node).collect())
}

fn rename_case_only_with(
    source: &Path,
    target: &Path,
    mut rename: impl FnMut(&Path, &Path) -> std::io::Result<()>,
) -> Result<()> {
    let parent = source.parent().ok_or("Cannot rename the workspace root")?;
    let temporary = at(
        parent,
        tempfile::Builder::new()
            .prefix(".ror-rename-")
            .tempdir_in(parent),
    )?;
    let intermediate = temporary.path().join("entry");
    at(source, rename(source, &intermediate))?;
    if let Err(error) = rename(&intermediate, target) {
        if let Err(rollback) = rename(&intermediate, source) {
            // Preserve the only remaining copy and tell the caller exactly where it is.
            let _ = temporary.keep();
            return Err(format!(
                "Rename failed: {error}; rollback failed: {rollback}. Your entry remains at {}",
                intermediate.display()
            ));
        }
        return Err(format!("Rename failed; original name restored: {error}"));
    }
    Ok(())
}

#[cfg(test)]
mod tests;
