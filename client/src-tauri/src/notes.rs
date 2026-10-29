use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Kind {
    Folder,
    File,
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

/// Resolves an existing folder or file inside `root` without following symlinks.
fn resolve(root: &Path, rel: &str) -> Result<(PathBuf, Option<Kind>)> {
    let segs = segments(rel)?;
    let mut abs = root.to_path_buf();
    let mut kind = None;
    for (i, seg) in segs.iter().enumerate() {
        abs.push(seg);
        let missing = || err(Code::NotFound, format!("“{seg}” no longer exists."));
        let meta = fs::symlink_metadata(&abs).map_err(|_| missing())?;
        let last = i + 1 == segs.len();
        if meta.is_symlink() {
            return Err(outside());
        } else if meta.is_dir() {
            kind = Some(Kind::Folder);
        } else if last && meta.is_file() {
            kind = Some(Kind::File);
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
        (_, Some(Kind::File)) => Err(err(
            Code::NotFound,
            format!("“{}” isn't a folder.", last_segment(rel)),
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

/// Errors if any entry in `dir` other than `except`, hidden or not, has `name`
/// ignoring case.
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
        if fname.to_lowercase() == wanted {
            let is_dir = entry.file_type().is_ok_and(|ft| ft.is_dir());
            let kind = if is_dir { Kind::Folder } else { Kind::File };
            return Err(err(Code::NameTaken, message(kind, &fname)));
        }
    }
    Ok(())
}

fn exists_message(kind: Kind, name: &str) -> String {
    match kind {
        Kind::File => format!("A file named “{name}” already exists in this folder."),
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
            out.push(Entry {
                kind: Kind::File,
                name: fname,
                path,
                children: None,
            });
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
    let abs = dir.join(name);
    match kind {
        Kind::Folder => fs::create_dir(&abs),
        Kind::File => fs::File::create_new(&abs).map(|_| ()),
    }
    .map_err(|e| io_err("create", name, e))?;
    Ok(join(parent, name))
}

pub fn rename(root: &Path, path: &str, new_name: &str) -> Result<String> {
    let (abs, kind) = resolve_item(root, path)?;
    validate_name(new_name)?;
    let old_name = last_segment(path);
    let parent = parent_of(path);
    if new_name == old_name {
        return Ok(path.to_string());
    }
    let dir = abs.parent().expect("item is below root");
    check_clash(dir, new_name, Some(old_name), exists_message)?;
    let dest = dir.join(new_name);
    if new_name.to_lowercase() != old_name.to_lowercase() {
        refuse_existing(&dest, || exists_message(kind, new_name))?;
    }
    fs::rename(&abs, dest).map_err(|e| io_err("rename", old_name, e))?;
    Ok(join(parent, new_name))
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
    let name = last_segment(path);
    let place = if new_parent.is_empty() {
        "the top level".to_string()
    } else {
        format!("“{}”", last_segment(new_parent))
    };
    check_clash(&target, name, None, |_, _| {
        format!("“{name}” is already in {place}.")
    })?;
    let dest = target.join(name);
    refuse_existing(&dest, || format!("“{name}” is already in {place}."))?;
    fs::rename(&abs, dest).map_err(|e| io_err("move", name, e))?;
    Ok(join(new_parent, name))
}

fn resolve_file(root: &Path, rel: &str) -> Result<PathBuf> {
    match resolve_item(root, rel)? {
        (abs, Kind::File) => Ok(abs),
        (_, Kind::Folder) => Err(err(
            Code::NotFound,
            format!("“{}” isn't a file.", last_segment(rel)),
        )),
    }
}

pub fn read(root: &Path, path: &str) -> Result<String> {
    let abs = resolve_file(root, path)?;
    let name = last_segment(path);
    let bytes = fs::read(&abs).map_err(|e| io_err("read", name, e))?;
    String::from_utf8(bytes).map_err(|_| {
        err(
            Code::Io,
            format!("Couldn't read “{name}”: it isn't UTF-8 text."),
        )
    })
}

pub fn write(root: &Path, path: &str, text: &str) -> Result<()> {
    let abs = resolve_file(root, path)?;
    let name = last_segment(path);
    // Writes beside the file and renames over it, so a failed write keeps the
    // old text. The dot keeps the temp file out of the list.
    let temp = abs.with_file_name(format!(".{name}.tmp"));
    let result = fs::write(&temp, text).and_then(|()| fs::rename(&temp, &abs));
    if result.is_err() {
        let _ = fs::remove_file(&temp);
    }
    result.map_err(|e| io_err("save", name, e))
}

pub fn delete(root: &Path, path: &str) -> Result<()> {
    let (abs, _) = resolve_item(root, path)?;
    trash::delete(&abs).map_err(|e| {
        err(
            Code::Io,
            format!("Couldn't move “{}” to the trash: {e}.", last_segment(path)),
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
    fn list_keeps_folders_and_all_files_with_full_names_and_sorts_them() {
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
        touch(r, "foo");
        touch(r, "foo.md");
        touch(r, "beta/inner.md");
        touch(r, "beta/todo.txt");

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
                (Kind::File, "delta.md", "delta.md"),
                (Kind::File, "Echo.MD", "Echo.MD"),
                (Kind::File, "foo", "foo"),
                (Kind::File, "foo.md", "foo.md"),
                (Kind::File, "image.png", "image.png"),
                (Kind::File, "zeta.md", "zeta.md"),
            ]
        );
        assert_eq!(tree[0].children, Some(vec![]));
        assert_eq!(
            tree[1].children,
            Some(vec![
                Entry {
                    kind: Kind::File,
                    name: "inner.md".into(),
                    path: "beta/inner.md".into(),
                    children: None
                },
                Entry {
                    kind: Kind::File,
                    name: "todo.txt".into(),
                    path: "beta/todo.txt".into(),
                    children: None
                }
            ])
        );
        assert_eq!(tree[2].children, None);
    }

    #[test]
    fn entry_serializes_to_the_command_contract() {
        let entry = Entry {
            kind: Kind::File,
            name: "a.md".into(),
            path: "a.md".into(),
            children: None,
        };
        let json = serde_json_like(&entry);
        assert_eq!(json, r#"{"kind":"file","name":"a.md","path":"a.md"}"#);
        assert_eq!(
            serde_json::from_str::<Kind>(r#""file""#).unwrap(),
            Kind::File
        );
        assert_eq!(
            serde_json::from_str::<Kind>(r#""folder""#).unwrap(),
            Kind::Folder
        );
        assert!(serde_json::from_str::<Kind>(r#""note""#).is_err());
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
    fn create_uses_the_name_as_typed_and_makes_an_empty_file() {
        let dir = root();
        let r = dir.path();
        mkdir(r, "Lore");
        assert_eq!(
            create(r, "Lore", Kind::File, "Factions.md").unwrap(),
            "Lore/Factions.md"
        );
        assert_eq!(fs::read_to_string(r.join("Lore/Factions.md")).unwrap(), "");
        assert_eq!(create(r, "", Kind::File, "todo.txt").unwrap(), "todo.txt");
        assert_eq!(create(r, "", Kind::File, "README").unwrap(), "README");
        assert!(r.join("todo.txt").is_file());
        assert!(r.join("README").is_file());
        assert!(!r.join("README.md").exists());
        assert_eq!(create(r, "", Kind::Folder, "Maps").unwrap(), "Maps");
        assert!(r.join("Maps").is_dir());
    }

    #[test]
    fn create_rejects_invalid_names() {
        let dir = root();
        let e = create(dir.path(), "", Kind::File, "a?").unwrap_err();
        assert_eq!(e.code, Code::InvalidName);
    }

    #[test]
    fn an_extension_alone_is_not_a_name() {
        let dir = root();
        let r = dir.path();
        let e = create(r, "", Kind::File, ".md").unwrap_err();
        assert_eq!(e.code, Code::InvalidName);
        assert_eq!(e.message, "Names can't start or end with a space or a dot.");
        touch(r, "a.md");
        assert_eq!(
            rename(r, "a.md", ".md").unwrap_err().code,
            Code::InvalidName
        );
        assert!(!r.join(".md").exists());
    }

    #[test]
    fn create_clashes_ignore_case_across_kinds() {
        let dir = root();
        let r = dir.path();
        touch(r, "Plot.md");
        mkdir(r, "Maps");
        let e = create(r, "", Kind::Folder, "plot.MD").unwrap_err();
        assert_eq!(e.code, Code::NameTaken);
        assert_eq!(
            e.message,
            "A file named “Plot.md” already exists in this folder."
        );
        let e = create(r, "", Kind::File, "MAPS").unwrap_err();
        assert_eq!(
            e.message,
            "A folder named “Maps” already exists in this folder."
        );
    }

    #[test]
    fn names_that_differ_only_by_extension_coexist() {
        let dir = root();
        let r = dir.path();
        touch(r, "foo");
        assert_eq!(create(r, "", Kind::File, "foo.md").unwrap(), "foo.md");
        assert_eq!(create(r, "", Kind::Folder, "foo.d").unwrap(), "foo.d");
        assert_eq!(rename(r, "foo.md", "foo.txt").unwrap(), "foo.txt");
        let e = create(r, "", Kind::Folder, "Foo").unwrap_err();
        assert_eq!(
            e.message,
            "A file named “foo” already exists in this folder."
        );
    }

    #[test]
    fn rename_clash_is_case_insensitive_but_case_only_change_is_allowed() {
        let dir = root();
        let r = dir.path();
        touch(r, "plot.md");
        touch(r, "Other.md");
        let e = rename(r, "plot.md", "other.md").unwrap_err();
        assert_eq!(e.code, Code::NameTaken);
        assert_eq!(
            e.message,
            "A file named “Other.md” already exists in this folder."
        );
        assert_eq!(rename(r, "plot.md", "Plot.md").unwrap(), "Plot.md");
        let names: Vec<String> = list(r).unwrap().into_iter().map(|e| e.name).collect();
        assert_eq!(names, ["Other.md", "Plot.md"]);
    }

    #[test]
    fn case_only_rename_is_refused_when_another_sibling_matches() {
        let dir = root();
        let r = dir.path();
        touch(r, "plot.md");
        touch(r, "PLOT.md");
        if list(r).unwrap().len() != 2 {
            eprintln!("skipped: the file system ignores case");
            return;
        }
        let e = rename(r, "plot.md", "Plot.md").unwrap_err();
        assert_eq!(e.code, Code::NameTaken);
        assert_eq!(
            e.message,
            "A file named “PLOT.md” already exists in this folder."
        );
        assert!(r.join("plot.md").is_file());
        assert!(!r.join("Plot.md").exists());
    }

    #[test]
    fn rename_and_move_keep_the_bytes_of_any_file() {
        let dir = root();
        let r = dir.path();
        mkdir(r, "Lore");
        fs::write(r.join("todo.txt"), b"keep \x00\xff").unwrap();
        assert_eq!(rename(r, "todo.txt", "tasks.txt").unwrap(), "tasks.txt");
        assert_eq!(move_item(r, "tasks.txt", "Lore").unwrap(), "Lore/tasks.txt");
        assert_eq!(
            fs::read(r.join("Lore/tasks.txt")).unwrap(),
            b"keep \x00\xff"
        );
        assert!(!r.join("todo.txt").exists());
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
            create(&r, "..", Kind::File, "x").unwrap_err().code,
            Code::NotFound
        );
        assert!(!dir.path().join("x").exists());
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
                (" Intro.md".to_string(), " Intro.md".to_string())
            ]
        );
        assert_eq!(
            move_item(r, " Intro.md", "trail ").unwrap(),
            "trail / Intro.md"
        );
        assert_eq!(
            rename(r, "trail / Intro.md", "Intro.md").unwrap(),
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
        assert_eq!(rename(r, "plot.md", "Plot.md").unwrap(), "Plot.md");
        let names: Vec<String> = list(r).unwrap().into_iter().map(|e| e.name).collect();
        assert_eq!(names, ["Plot.md"]);
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
        assert_eq!(e.message, "A file named “b” already exists in this folder.");
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
        assert_eq!(tree[1].name, "open.md");
    }

    #[cfg(unix)]
    #[test]
    fn symlinks_are_not_followed() {
        let dir = root();
        let r = dir.path().join("notes");
        mkdir(&r, "");
        mkdir(dir.path(), "elsewhere");
        touch(dir.path(), "elsewhere/a.md");
        std::os::unix::fs::symlink(dir.path().join("elsewhere"), r.join("link")).unwrap();
        std::os::unix::fs::symlink(dir.path().join("elsewhere/a.md"), r.join("a.md")).unwrap();
        assert_eq!(
            create(&r, "link", Kind::File, "x").unwrap_err().code,
            Code::NotFound
        );
        assert_eq!(rename(&r, "a.md", "b.md").unwrap_err().code, Code::NotFound);
        assert!(list(&r).unwrap().is_empty());
    }

    #[cfg(unix)]
    #[test]
    fn hidden_entries_and_symlinks_take_their_names() {
        let dir = root();
        let r = dir.path().join("notes");
        mkdir(&r, "Lore");
        mkdir(&r, ".git");
        touch(&r, "draft.md");
        touch(&r, "Lore/plan.md");
        // Dangling, so following it would find nothing.
        std::os::unix::fs::symlink(dir.path().join("gone"), r.join("Link.md")).unwrap();
        std::os::unix::fs::symlink(dir.path().join("gone"), r.join("Lore/Draft.md")).unwrap();
        assert!(list(&r).unwrap().iter().all(|e| e.name != "Link.md"));
        let e = create(&r, "", Kind::File, "link.md").unwrap_err();
        assert_eq!(e.code, Code::NameTaken);
        assert_eq!(
            e.message,
            "A file named “Link.md” already exists in this folder."
        );
        let e = rename(&r, "draft.md", "LINK.md").unwrap_err();
        assert_eq!(e.code, Code::NameTaken);
        let e = move_item(&r, "draft.md", "Lore").unwrap_err();
        assert_eq!(e.message, "“draft.md” is already in “Lore”.");
        assert!(r.join("draft.md").is_file());
        // Names can't start with a dot, so check a hidden folder directly.
        let e = check_clash(&r, ".GIT", None, exists_message).unwrap_err();
        assert_eq!(
            e.message,
            "A folder named “.git” already exists in this folder."
        );
    }

    #[test]
    fn any_regular_file_can_be_targeted() {
        let dir = root();
        let r = dir.path();
        touch(r, "image.png");
        touch(r, "todo.txt");
        assert_eq!(rename(r, "image.png", "map.png").unwrap(), "map.png");
        // Delete resolves its item the same way; this checks the resolver
        // without sending a file to the real trash.
        assert_eq!(
            resolve_item(r, "todo.txt").unwrap(),
            (r.join("todo.txt"), Kind::File)
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
        assert_eq!(e.message, "“Plot.md” is already in “Lore”.");
        let e = move_item(r, "Lore/plot.md", "").unwrap_err();
        assert_eq!(e.message, "“plot.md” is already in the top level.");
        assert_eq!(move_item(r, "plot", "Lore").unwrap(), "Lore/plot");
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
    fn write_then_read_round_trips_the_text() {
        let dir = root();
        let r = dir.path();
        mkdir(r, "Lore");
        touch(r, "Lore/plot.md");
        let text = "# Plot\n\nÜnïcode — “quotes”\n";
        write(r, "Lore/plot.md", text).unwrap();
        assert_eq!(read(r, "Lore/plot.md").unwrap(), text);
        assert_eq!(fs::read_to_string(r.join("Lore/plot.md")).unwrap(), text);
    }

    #[test]
    fn an_empty_file_reads_and_writes_as_empty_text() {
        let dir = root();
        let r = dir.path();
        touch(r, "a.md");
        assert_eq!(read(r, "a.md").unwrap(), "");
        fs::write(r.join("b.md"), "old").unwrap();
        write(r, "b.md", "").unwrap();
        assert_eq!(fs::read(r.join("b.md")).unwrap(), b"");
    }

    #[test]
    fn a_write_keeps_siblings_and_leaves_no_temp_file() {
        let dir = root();
        let r = dir.path();
        fs::write(r.join("a.md"), "old").unwrap();
        fs::write(r.join("b.md"), "sibling").unwrap();
        write(r, "a.md", "new").unwrap();
        let mut names: Vec<String> = fs::read_dir(r)
            .unwrap()
            .map(|e| e.unwrap().file_name().to_string_lossy().into_owned())
            .collect();
        names.sort();
        assert_eq!(names, ["a.md", "b.md"]);
        assert_eq!(fs::read_to_string(r.join("b.md")).unwrap(), "sibling");
        assert_eq!(fs::read_to_string(r.join("a.md")).unwrap(), "new");
    }

    #[test]
    fn read_and_write_refuse_folders_outside_paths_and_missing_files() {
        let dir = root();
        let r = dir.path().join("notes");
        mkdir(&r, "Lore");
        fs::write(dir.path().join("outside.md"), "secret").unwrap();
        for path in ["Lore", "../outside.md", "", "gone.md"] {
            assert_eq!(read(&r, path).unwrap_err().code, Code::NotFound, "{path:?}");
            assert_eq!(
                write(&r, path, "x").unwrap_err().code,
                Code::NotFound,
                "{path:?}"
            );
        }
        assert_eq!(
            read(&r, "Lore").unwrap_err().message,
            "“Lore” isn't a file."
        );
        assert_eq!(
            fs::read_to_string(dir.path().join("outside.md")).unwrap(),
            "secret"
        );
        assert!(!r.join("gone.md").exists());
    }

    #[cfg(unix)]
    #[test]
    fn read_and_write_refuse_symlinks() {
        let dir = root();
        let r = dir.path().join("notes");
        mkdir(&r, "");
        fs::write(dir.path().join("target.md"), "secret").unwrap();
        std::os::unix::fs::symlink(dir.path().join("target.md"), r.join("link.md")).unwrap();
        assert_eq!(read(&r, "link.md").unwrap_err().code, Code::NotFound);
        assert_eq!(write(&r, "link.md", "x").unwrap_err().code, Code::NotFound);
        assert_eq!(
            fs::read_to_string(dir.path().join("target.md")).unwrap(),
            "secret"
        );
        assert!(r.join("link.md").is_symlink());
    }

    #[test]
    fn read_refuses_text_that_is_not_utf8() {
        let dir = root();
        let r = dir.path();
        fs::write(r.join("bin.md"), b"ok \xff\xfe").unwrap();
        let e = read(r, "bin.md").unwrap_err();
        assert_eq!(e.code, Code::Io);
        assert_eq!(e.message, "Couldn't read “bin.md”: it isn't UTF-8 text.");
    }

    #[test]
    fn delete_missing_item_is_not_found() {
        let dir = root();
        let e = delete(dir.path(), "gone.md").unwrap_err();
        assert_eq!(e.code, Code::NotFound);
        assert_eq!(e.message, "“gone.md” no longer exists.");
    }
}
