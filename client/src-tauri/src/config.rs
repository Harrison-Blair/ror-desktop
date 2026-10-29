use serde::{Deserialize, Serialize};
use std::fs;
use std::io;
use std::path::{Path, PathBuf};

#[derive(Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Config {
    notes_dir: Option<PathBuf>,
}

pub struct NotesStart {
    pub root: PathBuf,
    /// The saved folder, when it was missing and `root` fell back to the default.
    pub missing: Option<PathBuf>,
}

/// Picks the notes folder for this run. A saved folder that is missing falls
/// back to `default` and leaves the config file as it is.
pub fn notes_start(config_file: &Path, default: &Path) -> io::Result<NotesStart> {
    // A missing or unreadable file counts as no saved folder.
    let saved = fs::read_to_string(config_file)
        .ok()
        .and_then(|text| serde_json::from_str::<Config>(&text).ok())
        .and_then(|config| config.notes_dir);
    match saved {
        Some(dir) if dir.is_dir() => Ok(NotesStart {
            root: dir,
            missing: None,
        }),
        missing => {
            fs::create_dir_all(default)?;
            Ok(NotesStart {
                root: default.to_path_buf(),
                missing,
            })
        }
    }
}

pub fn save_notes_dir(config_file: &Path, dir: &Path) -> io::Result<()> {
    let config = Config {
        notes_dir: Some(dir.to_path_buf()),
    };
    let text = serde_json::to_string_pretty(&config).map_err(io::Error::other)?;
    if let Some(parent) = config_file.parent() {
        fs::create_dir_all(parent)?;
    }
    fs::write(config_file, text)
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    struct Dirs {
        _temp: TempDir,
        config_file: PathBuf,
        default: PathBuf,
        other: PathBuf,
    }

    fn dirs() -> Dirs {
        let temp = tempfile::tempdir().unwrap();
        let other = temp.path().join("Other");
        fs::create_dir(&other).unwrap();
        Dirs {
            config_file: temp.path().join("config").join("config.json"),
            default: temp.path().join("data").join("notes"),
            other,
            _temp: temp,
        }
    }

    fn write_config(dirs: &Dirs, text: &str) {
        fs::create_dir_all(dirs.config_file.parent().unwrap()).unwrap();
        fs::write(&dirs.config_file, text).unwrap();
    }

    fn assert_default(dirs: &Dirs, start: &NotesStart) {
        assert_eq!(start.root, dirs.default);
        assert!(dirs.default.is_dir());
    }

    #[test]
    fn no_config_file_uses_and_creates_the_default() {
        let dirs = dirs();
        let start = notes_start(&dirs.config_file, &dirs.default).unwrap();
        assert_default(&dirs, &start);
        assert_eq!(start.missing, None);
        assert!(!dirs.config_file.exists());
    }

    #[test]
    fn bad_json_or_no_notes_dir_uses_the_default() {
        for text in ["{ not json", "[]", "{}", r#"{ "notesDir": 3 }"#] {
            let dirs = dirs();
            write_config(&dirs, text);
            let start = notes_start(&dirs.config_file, &dirs.default).unwrap();
            assert_default(&dirs, &start);
            assert_eq!(start.missing, None, "{text}");
        }
    }

    #[test]
    fn a_saved_folder_that_exists_is_used() {
        let dirs = dirs();
        let text = serde_json::json!({ "notesDir": dirs.other }).to_string();
        write_config(&dirs, &text);
        let start = notes_start(&dirs.config_file, &dirs.default).unwrap();
        assert_eq!(start.root, dirs.other);
        assert_eq!(start.missing, None);
        assert!(!dirs.default.exists());
    }

    #[test]
    fn a_missing_saved_path_falls_back_and_changes_nothing() {
        let dirs = dirs();
        let gone = dirs.other.join("Gone");
        let file = dirs.other.join("note.md");
        fs::write(&file, "").unwrap();
        for saved in [&gone, &file] {
            let text = serde_json::json!({ "notesDir": saved }).to_string();
            write_config(&dirs, &text);
            let start = notes_start(&dirs.config_file, &dirs.default).unwrap();
            assert_default(&dirs, &start);
            assert_eq!(start.missing.as_ref(), Some(saved));
            assert_eq!(fs::read_to_string(&dirs.config_file).unwrap(), text);
        }
        assert!(!gone.exists());
        assert!(file.is_file());
    }

    #[test]
    fn a_saved_folder_is_loaded_back() {
        let dirs = dirs();
        save_notes_dir(&dirs.config_file, &dirs.other).unwrap();
        let saved: serde_json::Value =
            serde_json::from_str(&fs::read_to_string(&dirs.config_file).unwrap()).unwrap();
        assert_eq!(saved, serde_json::json!({ "notesDir": dirs.other }));
        let start = notes_start(&dirs.config_file, &dirs.default).unwrap();
        assert_eq!(start.root, dirs.other);
        assert_eq!(start.missing, None);
    }
}
