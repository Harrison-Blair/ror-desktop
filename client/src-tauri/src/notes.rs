use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Kind {
    Folder,
    Note,
}

#[derive(Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Entry {
    pub kind: Kind,
    pub name: String,
    pub path: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub children: Option<Vec<Entry>>,
}

#[derive(Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum Code {
    InvalidName,
    NameTaken,
    NotFound,
    InvalidMove,
    Io,
}

#[derive(Debug, PartialEq, Eq, Serialize)]
pub struct NotesError {
    pub code: Code,
    pub message: String,
}

type Result<T> = std::result::Result<T, NotesError>;

fn err(code: Code, message: impl Into<String>) -> NotesError {
    NotesError {
        code,
        message: message.into(),
    }
}

fn io_err(action: &str, name: &str, e: impl std::fmt::Display) -> NotesError {
    err(Code::Io, format!("Couldn't {action} “{name}”: {e}."))
}

fn outside() -> NotesError {
    err(Code::NotFound, "That item isn't in the notes folder.")
}

fn note_stem(file_name: &str) -> Option<&str> {
    let split = file_name.len().checked_sub(3)?;
    let ext = file_name.get(split..)?;
    ext.eq_ignore_ascii_case(".md").then(|| &file_name[..split])
}

fn display_name(segment: &str) -> &str {
    note_stem(segment).unwrap_or(segment)
}

fn segments(rel: &str) -> Result<Vec<&str>> {
    if rel.is_empty() {
        return Ok(Vec::new());
    }
    let segs: Vec<&str> = rel.split('/').collect();
    let bad = |s: &&str| {
        s.is_empty()
            || *s == "."
            || *s == ".."
            || (cfg!(windows) && (s.starts_with([' ', '.']) || s.ends_with([' ', '.'])))
            || s.contains(['\\', ':', '\0'])
    };
    if segs.iter().any(bad) {
        return Err(outside());
    }
    Ok(segs)
}

/// Resolves an existing folder or note inside `root` without following symlinks.
fn resolve(root: &Path, rel: &str) -> Result<(PathBuf, Option<Kind>)> {
    let segs = segments(rel)?;
    let mut abs = root.to_path_buf();
    let mut kind = None;
    for (i, seg) in segs.iter().enumerate() {
        abs.push(seg);
        let missing = || {
            err(
                Code::NotFound,
                format!("“{}” no longer exists.", display_name(seg)),
            )
        };
        let meta = fs::symlink_metadata(&abs).map_err(|_| missing())?;
        let last = i + 1 == segs.len();
        if meta.is_symlink() {
            return Err(outside());
        } else if meta.is_dir() {
            kind = Some(Kind::Folder);
        } else if last && meta.is_file() && note_stem(seg).is_some() {
            kind = Some(Kind::Note);
        } else {
            return Err(missing());
        }
    }
    Ok((abs, kind))
}

fn resolve_item(root: &Path, rel: &str) -> Result<(PathBuf, Kind)> {
    match resolve(root, rel)? {
        (abs, Some(kind)) => Ok((abs, kind)),
        (_, None) => Err(outside()),
    }
}

fn resolve_folder(root: &Path, rel: &str) -> Result<PathBuf> {
    match resolve(root, rel)? {
        (abs, None | Some(Kind::Folder)) => Ok(abs),
        (_, Some(Kind::Note)) => Err(err(
            Code::NotFound,
            format!("“{}” isn't a folder.", display_name(last_segment(rel))),
        )),
    }
}

fn last_segment(rel: &str) -> &str {
    rel.rsplit('/').next().unwrap_or(rel)
}

fn parent_of(rel: &str) -> &str {
    rel.rfind('/').map_or("", |i| &rel[..i])
}

fn join(parent: &str, segment: &str) -> String {
    if parent.is_empty() {
        segment.to_string()
    } else {
        format!("{parent}/{segment}")
    }
}

fn file_name(kind: Kind, name: &str) -> String {
    match kind {
        Kind::Folder => name.to_string(),
        Kind::Note => format!("{name}.md"),
    }
}

const RESERVED: [&str; 22] = [
    "CON", "PRN", "AUX", "NUL", "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7", "COM8",
    "COM9", "LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9",
];

pub fn validate_name(name: &str) -> Result<()> {
    let invalid = |m: String| Err(err(Code::InvalidName, m));
    if name.trim_matches(' ').is_empty() {
        return invalid("Enter a name.".into());
    }
    if name
        .chars()
        .any(|c| c.is_control() || "<>:\"/\\|?*[]".contains(c))
    {
        return invalid("Names can't contain < > : \" / \\ | ? * [ ].".into());
    }
    if [' ', '.']
        .iter()
        .any(|&c| name.starts_with(c) || name.ends_with(c))
    {
        return invalid("Names can't start or end with a space or a dot.".into());
    }
    let base = name.split('.').next().unwrap_or(name);
    if RESERVED.iter().any(|r| r.eq_ignore_ascii_case(base)) {
        return invalid(format!(
            "“{name}” is reserved by Windows. Choose another name."
        ));
    }
    Ok(())
}

/// Errors if a sibling in `dir` other than `except` (a file name) has `name` ignoring case.
fn check_clash(
    dir: &Path,
    name: &str,
    except: Option<&str>,
    message: impl Fn(Kind, &str) -> String,
) -> Result<()> {
    let wanted = name.to_lowercase();
    let entries =
        fs::read_dir(dir).map_err(|e| err(Code::Io, format!("Couldn't read the folder: {e}.")))?;
    for entry in entries.flatten() {
        let fname = entry.file_name().to_string_lossy().into_owned();
        if Some(fname.as_str()) == except {
            continue;
        }
        let Ok(ft) = entry.file_type() else { continue };
        let sibling = if ft.is_dir() {
            Some((Kind::Folder, fname.as_str()))
        } else {
            note_stem(&fname).map(|stem| (Kind::Note, stem))
        };
        if let Some((kind, sibling_name)) = sibling {
            if sibling_name.to_lowercase() == wanted {
                return Err(err(Code::NameTaken, message(kind, sibling_name)));
            }
        }
    }
    Ok(())
}

fn exists_message(kind: Kind, name: &str) -> String {
    match kind {
        Kind::Note => format!("A note named “{name}” already exists in this folder."),
        Kind::Folder => format!("A folder named “{name}” already exists in this folder."),
    }
}

/// Backstop for names the clash check can't see as equal (Unicode normalization, outside writes).
fn refuse_existing(dest: &Path, message: impl FnOnce() -> String) -> Result<()> {
    match fs::symlink_metadata(dest) {
        Ok(_) => Err(err(Code::NameTaken, message())),
        Err(_) => Ok(()),
    }
}

pub fn list(root: &Path) -> Result<Vec<Entry>> {
    list_dir(root, "")
}

fn list_dir(dir: &Path, rel: &str) -> Result<Vec<Entry>> {
    let entries = fs::read_dir(dir)
        .map_err(|e| err(Code::Io, format!("Couldn't read the notes folder: {e}.")))?;
    let mut out = Vec::new();
    for entry in entries.flatten() {
        let fname = entry.file_name().to_string_lossy().into_owned();
        if fname.starts_with('.') {
            continue;
        }
        let Ok(ft) = entry.file_type() else { continue };
        let path = join(rel, &fname);
        if ft.is_dir() {
            let children = list_dir(&entry.path(), &path).unwrap_or_default();
            out.push(Entry {
                kind: Kind::Folder,
                name: fname,
                path,
                children: Some(children),
            });
        } else if ft.is_file() {
            if let Some(stem) = note_stem(&fname) {
                out.push(Entry {
                    kind: Kind::Note,
                    name: stem.to_string(),
                    path,
                    children: None,
                });
            }
        }
    }
    out.sort_by(|a, b| {
        (a.kind != Kind::Folder, a.name.to_lowercase())
            .cmp(&(b.kind != Kind::Folder, b.name.to_lowercase()))
    });
    Ok(out)
}

pub fn create(root: &Path, parent: &str, kind: Kind, name: &str) -> Result<String> {
    validate_name(name)?;
    let dir = resolve_folder(root, parent)?;
    check_clash(&dir, name, None, exists_message)?;
    let fname = file_name(kind, name);
    let abs = dir.join(&fname);
    match kind {
        Kind::Folder => fs::create_dir(&abs),
        Kind::Note => fs::File::create_new(&abs).map(|_| ()),
    }
    .map_err(|e| io_err("create", name, e))?;
    Ok(join(parent, &fname))
}

pub fn rename(root: &Path, path: &str, new_name: &str) -> Result<String> {
    let (abs, kind) = resolve_item(root, path)?;
    validate_name(new_name)?;
    let old_fname = last_segment(path);
    let new_fname = file_name(kind, new_name);
    let parent = parent_of(path);
    if new_fname == old_fname {
        return Ok(path.to_string());
    }
    let dir = abs.parent().expect("item is below root");
    check_clash(dir, new_name, Some(old_fname), exists_message)?;
    let dest = dir.join(&new_fname);
    if new_fname.to_lowercase() != old_fname.to_lowercase() {
        refuse_existing(&dest, || exists_message(kind, new_name))?;
    }
    fs::rename(&abs, dest).map_err(|e| io_err("rename", display_name(old_fname), e))?;
    Ok(join(parent, &new_fname))
}

pub fn move_item(root: &Path, path: &str, new_parent: &str) -> Result<String> {
    let (abs, kind) = resolve_item(root, path)?;
    let target = resolve_folder(root, new_parent)?;
    if kind == Kind::Folder && (new_parent == path || new_parent.starts_with(&format!("{path}/"))) {
        return Err(err(Code::InvalidMove, "A folder can't move into itself."));
    }
    if new_parent == parent_of(path) {
        return Ok(path.to_string());
    }
    let fname = last_segment(path);
    let name = display_name(fname);
    let place = if new_parent.is_empty() {
        "the top level".to_string()
    } else {
        format!("“{}”", last_segment(new_parent))
    };
    check_clash(&target, name, None, |_, _| {
        format!("“{name}” is already in {place}.")
    })?;
    let dest = target.join(fname);
    refuse_existing(&dest, || format!("“{name}” is already in {place}."))?;
    fs::rename(&abs, dest).map_err(|e| io_err("move", name, e))?;
    Ok(join(new_parent, fname))
}

pub fn delete(root: &Path, path: &str) -> Result<()> {
    let (abs, _) = resolve_item(root, path)?;
    trash::delete(&abs).map_err(|e| {
        err(
            Code::Io,
            format!(
                "Couldn't move “{}” to the trash: {e}.",
                display_name(last_segment(path))
            ),
        )
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    fn root() -> TempDir {
        tempfile::tempdir().unwrap()
    }

    fn touch(root: &Path, rel: &str) {
        fs::write(root.join(rel), "").unwrap();
    }

    fn mkdir(root: &Path, rel: &str) {
        fs::create_dir_all(root.join(rel)).unwrap();
    }

    fn invalid(name: &str) -> String {
        let e = validate_name(name).unwrap_err();
        assert_eq!(e.code, Code::InvalidName);
        e.message
    }

    #[test]
    fn empty_or_blank_names_ask_for_a_name() {
        assert_eq!(invalid(""), "Enter a name.");
        assert_eq!(invalid("   "), "Enter a name.");
    }

    #[test]
    fn forbidden_characters_are_rejected() {
        for name in [
            "a<b", "a>b", "a:b", "a\"b", "a/b", "a\\b", "a|b", "a?b", "a*b", "a[b", "a]b", "a\tb",
            "a\u{7f}b",
        ] {
            assert_eq!(
                invalid(name),
                "Names can't contain < > : \" / \\ | ? * [ ].",
                "{name:?}"
            );
        }
    }

    #[test]
    fn leading_or_trailing_space_or_dot_is_rejected() {
        for name in [" a", "a ", ".a", "a."] {
            assert_eq!(
                invalid(name),
                "Names can't start or end with a space or a dot.",
                "{name:?}"
            );
        }
    }

    #[test]
    fn windows_reserved_names_are_rejected_with_or_without_extension() {
        assert_eq!(
            invalid("CON"),
            "“CON” is reserved by Windows. Choose another name."
        );
        assert_eq!(
            invalid("nul.txt"),
            "“nul.txt” is reserved by Windows. Choose another name."
        );
        assert_eq!(
            invalid("Com7.tar.gz"),
            "“Com7.tar.gz” is reserved by Windows. Choose another name."
        );
        assert_eq!(
            invalid("lpt9"),
            "“lpt9” is reserved by Windows. Choose another name."
        );
    }

    #[test]
    fn ordinary_names_pass() {
        for name in [
            "Session 1",
            "CONSOLE",
            "COM10",
            "lpt",
            "notes.v2",
            "Ünïcode",
        ] {
            assert_eq!(validate_name(name), Ok(()), "{name:?}");
        }
    }

    #[test]
    fn list_keeps_folders_and_md_files_and_sorts_them() {
        let dir = root();
        let r = dir.path();
        mkdir(r, "beta");
        mkdir(r, "Alpha");
        mkdir(r, ".hidden");
        touch(r, "zeta.md");
        touch(r, "Echo.MD");
        touch(r, "delta.md");
        touch(r, ".secret.md");
        touch(r, "image.png");
        touch(r, "beta/inner.md");
        touch(r, "beta/skip.txt");

        let tree = list(r).unwrap();
        let top: Vec<(Kind, &str, &str)> = tree
            .iter()
            .map(|e| (e.kind, e.name.as_str(), e.path.as_str()))
            .collect();
        assert_eq!(
            top,
            vec![
                (Kind::Folder, "Alpha", "Alpha"),
                (Kind::Folder, "beta", "beta"),
                (Kind::Note, "delta", "delta.md"),
                (Kind::Note, "Echo", "Echo.MD"),
                (Kind::Note, "zeta", "zeta.md"),
            ]
        );
        assert_eq!(tree[0].children, Some(vec![]));
        assert_eq!(
            tree[1].children,
            Some(vec![Entry {
                kind: Kind::Note,
                name: "inner".into(),
                path: "beta/inner.md".into(),
                children: None
            }])
        );
        assert_eq!(tree[2].children, None);
    }

    #[test]
    fn entry_serializes_to_the_command_contract() {
        let entry = Entry {
            kind: Kind::Note,
            name: "a".into(),
            path: "a.md".into(),
            children: None,
        };
        let json = serde_json_like(&entry);
        assert_eq!(json, r#"{"kind":"note","name":"a","path":"a.md"}"#);
        let e = err(Code::InvalidMove, "m");
        assert_eq!(
            serde_json_like(&e),
            r#"{"code":"invalid_move","message":"m"}"#
        );
    }

    fn serde_json_like<T: Serialize>(value: &T) -> String {
        serde_json::to_string(value).unwrap()
    }

    #[test]
    fn create_note_returns_path_and_makes_empty_file() {
        let dir = root();
        let r = dir.path();
        mkdir(r, "Lore");
        assert_eq!(
            create(r, "Lore", Kind::Note, "Factions").unwrap(),
            "Lore/Factions.md"
        );
        assert_eq!(fs::read_to_string(r.join("Lore/Factions.md")).unwrap(), "");
        assert_eq!(create(r, "", Kind::Folder, "Maps").unwrap(), "Maps");
        assert!(r.join("Maps").is_dir());
    }

    #[test]
    fn create_rejects_invalid_names() {
        let dir = root();
        let e = create(dir.path(), "", Kind::Note, "a?").unwrap_err();
        assert_eq!(e.code, Code::InvalidName);
    }

    #[test]
    fn create_clashes_ignore_case_across_kinds() {
        let dir = root();
        let r = dir.path();
        touch(r, "Plot.md");
        mkdir(r, "Maps");
        let e = create(r, "", Kind::Folder, "plot").unwrap_err();
        assert_eq!(e.code, Code::NameTaken);
        assert_eq!(
            e.message,
            "A note named “Plot” already exists in this folder."
        );
        let e = create(r, "", Kind::Note, "MAPS").unwrap_err();
        assert_eq!(
            e.message,
            "A folder named “Maps” already exists in this folder."
        );
    }

    #[test]
    fn rename_clash_is_case_insensitive_but_case_only_change_is_allowed() {
        let dir = root();
        let r = dir.path();
        touch(r, "plot.md");
        touch(r, "Other.md");
        let e = rename(r, "plot.md", "other").unwrap_err();
        assert_eq!(e.code, Code::NameTaken);
        assert_eq!(
            e.message,
            "A note named “Other” already exists in this folder."
        );
        assert_eq!(rename(r, "plot.md", "Plot").unwrap(), "Plot.md");
        let names: Vec<String> = list(r).unwrap().into_iter().map(|e| e.name).collect();
        assert_eq!(names, ["Other", "Plot"]);
    }

    #[test]
    fn rename_folder_keeps_children() {
        let dir = root();
        let r = dir.path();
        mkdir(r, "a/b");
        touch(r, "a/b/n.md");
        assert_eq!(rename(r, "a/b", "c").unwrap(), "a/c");
        assert!(r.join("a/c/n.md").is_file());
    }

    #[test]
    fn paths_escaping_the_root_are_rejected() {
        let dir = root();
        let r = dir.path().join("notes");
        mkdir(&r, "inner");
        touch(dir.path(), "outside.md");
        for path in [
            "../outside.md",
            "inner/../../outside.md",
            "/etc",
            "",
            "./inner",
            "inner/",
        ] {
            let e = rename(&r, path, "x").unwrap_err();
            assert_eq!(e.code, Code::NotFound, "{path:?}");
        }
        let abs = dir.path().join("outside.md").to_string_lossy().into_owned();
        assert_eq!(delete(&r, &abs).unwrap_err().code, Code::NotFound);
        assert_eq!(
            create(&r, "..", Kind::Note, "x").unwrap_err().code,
            Code::NotFound
        );
        assert!(!dir.path().join("x.md").exists());
    }

    #[cfg(windows)]
    #[test]
    fn segments_with_edge_spaces_or_dots_are_rejected() {
        let dir = root();
        let r = dir.path();
        for path in ["x.", " lead", "trail ", "inner/.. ", "inner/x."] {
            let e = rename(r, path, "y").unwrap_err();
            assert_eq!(e.code, Code::NotFound, "{path:?}");
            assert_eq!(e.message, "That item isn't in the notes folder.");
        }
    }

    #[cfg(not(windows))]
    #[test]
    fn items_with_edge_spaces_can_be_listed_moved_and_renamed() {
        let dir = root();
        let r = dir.path();
        mkdir(r, "trail ");
        touch(r, " Intro.md");
        let top: Vec<(String, String)> = list(r)
            .unwrap()
            .into_iter()
            .map(|e| (e.name, e.path))
            .collect();
        assert_eq!(
            top,
            [
                ("trail ".to_string(), "trail ".to_string()),
                (" Intro".to_string(), " Intro.md".to_string())
            ]
        );
        assert_eq!(
            move_item(r, " Intro.md", "trail ").unwrap(),
            "trail / Intro.md"
        );
        assert_eq!(
            rename(r, "trail / Intro.md", "Intro").unwrap(),
            "trail /Intro.md"
        );
        assert_eq!(rename(r, "trail ", "Trail").unwrap(), "Trail");
        assert!(r.join("Trail/Intro.md").is_file());
    }

    #[cfg(any(windows, target_os = "macos"))]
    #[test]
    fn case_only_rename_works_on_case_insensitive_filesystems() {
        let dir = root();
        let r = dir.path();
        touch(r, "plot.md");
        assert_eq!(rename(r, "plot.md", "Plot").unwrap(), "Plot.md");
        let names: Vec<String> = list(r).unwrap().into_iter().map(|e| e.name).collect();
        assert_eq!(names, ["Plot"]);
    }

    #[test]
    fn rename_and_move_never_replace_an_existing_destination() {
        let dir = root();
        let r = dir.path();
        mkdir(r, "a");
        mkdir(r, "Lore");
        fs::write(r.join("b"), "keep").unwrap();
        fs::write(r.join("Lore/a"), "keep").unwrap();
        let e = rename(r, "a", "b").unwrap_err();
        assert_eq!(e.code, Code::NameTaken);
        assert_eq!(
            e.message,
            "A folder named “b” already exists in this folder."
        );
        let e = move_item(r, "a", "Lore").unwrap_err();
        assert_eq!(e.code, Code::NameTaken);
        assert_eq!(e.message, "“a” is already in “Lore”.");
        assert_eq!(fs::read_to_string(r.join("b")).unwrap(), "keep");
        assert_eq!(fs::read_to_string(r.join("Lore/a")).unwrap(), "keep");
        assert!(r.join("a").is_dir());
    }

    #[cfg(unix)]
    #[test]
    fn unreadable_subfolder_lists_with_no_children() {
        use std::os::unix::fs::PermissionsExt;
        let dir = root();
        let r = dir.path();
        mkdir(r, "locked");
        touch(r, "locked/hidden.md");
        touch(r, "open.md");
        let locked = r.join("locked");
        fs::set_permissions(&locked, fs::Permissions::from_mode(0o000)).unwrap();
        if fs::read_dir(&locked).is_ok() {
            fs::set_permissions(&locked, fs::Permissions::from_mode(0o755)).unwrap();
            eprintln!("skipped: running with permission to read a 000 folder");
            return;
        }
        let tree = list(r);
        fs::set_permissions(&locked, fs::Permissions::from_mode(0o755)).unwrap();
        let tree = tree.unwrap();
        assert_eq!(tree.len(), 2);
        assert_eq!(tree[0].name, "locked");
        assert_eq!(tree[0].children, Some(vec![]));
        assert_eq!(tree[1].name, "open");
    }

    #[cfg(unix)]
    #[test]
    fn symlinks_are_not_followed() {
        let dir = root();
        let r = dir.path().join("notes");
        mkdir(&r, "");
        mkdir(dir.path(), "elsewhere");
        std::os::unix::fs::symlink(dir.path().join("elsewhere"), r.join("link")).unwrap();
        assert_eq!(
            create(&r, "link", Kind::Note, "x").unwrap_err().code,
            Code::NotFound
        );
        assert!(list(&r).unwrap().is_empty());
    }

    #[test]
    fn non_note_files_cannot_be_targeted() {
        let dir = root();
        touch(dir.path(), "image.png");
        assert_eq!(
            rename(dir.path(), "image.png", "x").unwrap_err().code,
            Code::NotFound
        );
    }

    #[test]
    fn folder_cannot_move_into_itself_or_descendant() {
        let dir = root();
        let r = dir.path();
        mkdir(r, "a/b/c");
        for target in ["a", "a/b", "a/b/c"] {
            let e = move_item(r, "a", target).unwrap_err();
            assert_eq!(e.code, Code::InvalidMove);
            assert_eq!(e.message, "A folder can't move into itself.");
        }
    }

    #[test]
    fn sibling_with_shared_prefix_is_not_a_descendant() {
        let dir = root();
        let r = dir.path();
        mkdir(r, "a");
        mkdir(r, "ab");
        assert_eq!(move_item(r, "a", "ab").unwrap(), "ab/a");
    }

    #[test]
    fn move_clash_names_the_target() {
        let dir = root();
        let r = dir.path();
        mkdir(r, "Lore");
        touch(r, "Lore/plot.md");
        touch(r, "Plot.md");
        mkdir(r, "plot");
        let e = move_item(r, "Plot.md", "Lore").unwrap_err();
        assert_eq!(e.code, Code::NameTaken);
        assert_eq!(e.message, "“Plot” is already in “Lore”.");
        let e = move_item(r, "Lore/plot.md", "").unwrap_err();
        assert_eq!(e.message, "“plot” is already in the top level.");
    }

    #[test]
    fn move_into_current_parent_is_a_no_op_and_move_returns_new_path() {
        let dir = root();
        let r = dir.path();
        mkdir(r, "Lore");
        touch(r, "n.md");
        assert_eq!(move_item(r, "n.md", "").unwrap(), "n.md");
        assert_eq!(move_item(r, "n.md", "Lore").unwrap(), "Lore/n.md");
        assert!(r.join("Lore/n.md").is_file());
        assert!(!r.join("n.md").exists());
    }

    #[test]
    fn delete_missing_item_is_not_found() {
        let dir = root();
        let e = delete(dir.path(), "gone.md").unwrap_err();
        assert_eq!(e.code, Code::NotFound);
        assert_eq!(e.message, "“gone” no longer exists.");
    }
}
