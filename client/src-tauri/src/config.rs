use crate::chat::store::BackendId;
use serde::{Deserialize, Serialize};
use std::fs;
use std::io;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

#[derive(Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Config {
    #[serde(default)]
    pub notes_dir: Option<PathBuf>,
    /// The last model chosen in the chat panel.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub chat_model: Option<String>,
    /// The backend of `chat_model`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub chat_backend: Option<BackendId>,
    #[serde(default)]
    pub permission_mode: PermissionMode,
    /// The id of this device's character in People of interest.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub me_id: Option<String>,
}

/// Whether the chat agent asks before it runs a write tool.
#[derive(Default, Clone, Copy, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum PermissionMode {
    #[default]
    Manual,
    Auto,
}

// Updates read, change and write the whole file, so they run one at a time.
static UPDATE: Mutex<()> = Mutex::new(());

/// Reads the config. A missing file counts as the defaults. A file that
/// can't be read or parsed is an error.
pub fn read(config_file: &Path) -> io::Result<Config> {
    let text = match fs::read_to_string(config_file) {
        Ok(text) => text,
        Err(e) if e.kind() == io::ErrorKind::NotFound => return Ok(Config::default()),
        Err(e) => return Err(e),
    };
    let invalid = |e: String| {
        io::Error::new(
            io::ErrorKind::InvalidData,
            format!("{} is not a valid config ({e})", config_file.display()),
        )
    };
    // serde would also read a struct from an array, which is not a config.
    match serde_json::from_str::<serde_json::Value>(&text) {
        Ok(value) if value.is_object() => {
            serde_json::from_value(value).map_err(|e| invalid(e.to_string()))
        }
        Ok(_) => Err(invalid("not a JSON object".to_string())),
        Err(e) => Err(invalid(e.to_string())),
    }
}

/// Reads the config. A missing or unreadable file counts as the defaults.
pub fn load(config_file: &Path) -> Config {
    read(config_file).unwrap_or_default()
}

/// Changes the saved config and keeps the other settings. A config file that
/// can't be read or parsed is left as it is, so its settings can be
/// recovered, and the update fails.
pub fn update(config_file: &Path, change: impl FnOnce(&mut Config)) -> io::Result<()> {
    let _guard = UPDATE.lock().unwrap_or_else(|e| e.into_inner());
    let mut config = read(config_file)?;
    change(&mut config);
    let text = serde_json::to_string_pretty(&config).map_err(io::Error::other)?;
    if let Some(parent) = config_file.parent() {
        fs::create_dir_all(parent)?;
    }
    // Writes beside the config and renames over it, so a failed write keeps
    // the previous settings.
    let temp = config_file.with_extension("json.tmp");
    let result = fs::write(&temp, text).and_then(|()| fs::rename(&temp, config_file));
    if result.is_err() {
        let _ = fs::remove_file(&temp);
    }
    result
}

pub struct NotesStart {
    pub root: PathBuf,
    /// The saved folder, when it was missing and `root` fell back to the default.
    pub missing: Option<PathBuf>,
}

/// Picks the notes folder for this run. A saved folder that is missing falls
/// back to `default` and leaves the config file as it is.
pub fn notes_start(config_file: &Path, default: &Path) -> io::Result<NotesStart> {
    let saved = load(config_file).notes_dir;
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
    update(config_file, |config| {
        config.notes_dir = Some(dir.to_path_buf())
    })
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
        assert_eq!(
            saved,
            serde_json::json!({ "notesDir": dirs.other, "permissionMode": "manual" })
        );
        let start = notes_start(&dirs.config_file, &dirs.default).unwrap();
        assert_eq!(start.root, dirs.other);
        assert_eq!(start.missing, None);
    }

    #[test]
    fn the_model_and_its_backend_round_trip() {
        let dirs = dirs();
        update(&dirs.config_file, |c| {
            c.chat_model = Some("gpt-5.5".into());
            c.chat_backend = Some(BackendId::Codex);
        })
        .unwrap();
        let saved: serde_json::Value =
            serde_json::from_str(&fs::read_to_string(&dirs.config_file).unwrap()).unwrap();
        assert_eq!(
            saved,
            serde_json::json!({
                "notesDir": null,
                "chatModel": "gpt-5.5",
                "chatBackend": "codex",
                "permissionMode": "manual"
            })
        );
        let config = load(&dirs.config_file);
        assert_eq!(config.chat_model.as_deref(), Some("gpt-5.5"));
        assert_eq!(config.chat_backend, Some(BackendId::Codex));
    }

    #[test]
    fn my_character_id_round_trips_and_keeps_the_other_settings() {
        let dirs = dirs();
        save_notes_dir(&dirs.config_file, &dirs.other).unwrap();
        update(&dirs.config_file, |c| c.me_id = Some("ada-id".into())).unwrap();
        let saved: serde_json::Value =
            serde_json::from_str(&fs::read_to_string(&dirs.config_file).unwrap()).unwrap();
        assert_eq!(
            saved,
            serde_json::json!({
                "notesDir": dirs.other,
                "permissionMode": "manual",
                "meId": "ada-id"
            })
        );
        assert_eq!(load(&dirs.config_file).me_id.as_deref(), Some("ada-id"));
    }

    // Configs saved before the custom provider was removed.
    #[test]
    fn an_old_config_with_a_custom_provider_still_loads() {
        let dirs = dirs();
        let old = serde_json::json!({
            "chatModel": "glm-5.3",
            "chatBackend": "opencode-go",
            "customProvider": { "name": "Ollama", "baseUrl": "http://localhost:11434/v1" }
        });
        write_config(&dirs, &old.to_string());
        let config = load(&dirs.config_file);
        assert_eq!(config.chat_model.as_deref(), Some("glm-5.3"));
        assert_eq!(config.chat_backend, Some(BackendId::OpencodeGo));
    }

    #[test]
    fn chat_settings_default_to_manual_and_no_model() {
        let dirs = dirs();
        let config = load(&dirs.config_file);
        assert_eq!(config.permission_mode, PermissionMode::Manual);
        assert_eq!(config.chat_model, None);
    }

    #[test]
    fn an_update_keeps_the_other_settings() {
        let dirs = dirs();
        save_notes_dir(&dirs.config_file, &dirs.other).unwrap();
        update(&dirs.config_file, |c| c.chat_model = Some("glm-5.3".into())).unwrap();
        update(&dirs.config_file, |c| {
            c.permission_mode = PermissionMode::Auto
        })
        .unwrap();
        let saved: serde_json::Value =
            serde_json::from_str(&fs::read_to_string(&dirs.config_file).unwrap()).unwrap();
        assert_eq!(
            saved,
            serde_json::json!({
                "notesDir": dirs.other,
                "chatModel": "glm-5.3",
                "permissionMode": "auto"
            })
        );
        assert!(!dirs.config_file.with_extension("json.tmp").exists());
    }

    #[test]
    fn an_update_leaves_a_config_it_cant_parse_as_it_is() {
        for text in ["{ not json", "[]", r#"{ "notesDir": 3 }"#] {
            let dirs = dirs();
            write_config(&dirs, text);
            let result = update(&dirs.config_file, |c| c.chat_model = Some("glm-5.3".into()));
            assert_eq!(
                result.unwrap_err().kind(),
                io::ErrorKind::InvalidData,
                "{text}"
            );
            assert_eq!(fs::read_to_string(&dirs.config_file).unwrap(), text);
            assert!(save_notes_dir(&dirs.config_file, &dirs.other).is_err());
            assert_eq!(fs::read_to_string(&dirs.config_file).unwrap(), text);
        }
    }

    #[test]
    fn an_update_fails_when_the_config_cant_be_read() {
        let dirs = dirs();
        // A folder where the file should be can't be read as a file.
        fs::create_dir_all(dirs.config_file.join("inside")).unwrap();
        assert!(update(&dirs.config_file, |c| c.chat_model = Some("m".into())).is_err());
        assert!(dirs.config_file.join("inside").is_dir());
    }
}
