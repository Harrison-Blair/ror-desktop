// API keys live in keys.json in the app config folder, one entry per
// provider. They never go to the webview: commands report only whether a key
// is saved.

use std::collections::BTreeMap;
use std::fs;
use std::io::{self, Write};
use std::path::Path;
use std::sync::Mutex;

/// The providers that can hold a key.
pub const PROVIDERS: &[&str] = &["opencode-go", "tavily"];

type Keys = BTreeMap<String, String>;

// Changes read, change and write the whole file, so they run one at a time.
static WRITE: Mutex<()> = Mutex::new(());

fn check(provider: &str) -> Result<(), String> {
    if !PROVIDERS.contains(&provider) {
        return Err(format!("Unknown key provider {provider}."));
    }
    Ok(())
}

/// Reads the keys. A missing file has no keys. A file that can't be read or
/// parsed is an error.
fn read(keys_file: &Path) -> Result<Keys, String> {
    let text = match fs::read_to_string(keys_file) {
        Ok(text) => text,
        Err(e) if e.kind() == io::ErrorKind::NotFound => return Ok(Keys::new()),
        Err(e) => {
            return Err(format!(
                "Couldn't read the key file {}: {e}.",
                keys_file.display()
            ))
        }
    };
    serde_json::from_str(&text)
        .map_err(|e| format!("{} is not a valid key file ({e}).", keys_file.display()))
}

// Writes beside the file and renames over it, so a failed write keeps the
// previous keys. Only the user can read the new file.
fn write(keys_file: &Path, keys: &Keys) -> io::Result<()> {
    let text = serde_json::to_string_pretty(keys).map_err(io::Error::other)?;
    if let Some(parent) = keys_file.parent() {
        fs::create_dir_all(parent)?;
    }
    let temp = keys_file.with_extension("json.tmp");
    // A temp file left by an earlier failure would keep its own mode.
    let _ = fs::remove_file(&temp);
    let mut options = fs::OpenOptions::new();
    options.write(true).create_new(true);
    #[cfg(unix)]
    std::os::unix::fs::OpenOptionsExt::mode(&mut options, 0o600);
    let result = options
        .open(&temp)
        .and_then(|mut file| file.write_all(text.as_bytes()))
        .and_then(|()| fs::rename(&temp, keys_file));
    if result.is_err() {
        let _ = fs::remove_file(&temp);
    }
    result
}

/// Changes the saved keys and keeps the others. A key file that can't be
/// read or parsed is left as it is, and the change fails.
fn change(keys_file: &Path, change: impl FnOnce(&mut Keys)) -> Result<(), String> {
    let _guard = WRITE.lock().unwrap_or_else(|e| e.into_inner());
    let mut keys = read(keys_file)?;
    change(&mut keys);
    write(keys_file, &keys)
        .map_err(|e| format!("Couldn't save the key file {}: {e}.", keys_file.display()))
}

/// The saved key, or None when no key is set.
pub fn get(keys_file: &Path, provider: &str) -> Result<Option<String>, String> {
    check(provider)?;
    Ok(read(keys_file)?.remove(provider))
}

pub fn set(keys_file: &Path, provider: &str, key: &str) -> Result<(), String> {
    check(provider)?;
    let key = key.trim();
    if key.is_empty() {
        return Err("Enter a key.".to_string());
    }
    change(keys_file, |keys| {
        keys.insert(provider.to_string(), key.to_string());
    })
}

/// Deletes the saved key. Removing a key that isn't saved does nothing.
pub fn remove(keys_file: &Path, provider: &str) -> Result<(), String> {
    check(provider)?;
    change(keys_file, |keys| {
        keys.remove(provider);
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;
    use tempfile::TempDir;

    fn keys_file() -> (TempDir, PathBuf) {
        let temp = tempfile::tempdir().unwrap();
        let file = temp.path().join("config").join("keys.json");
        (temp, file)
    }

    fn saved(file: &Path) -> serde_json::Value {
        serde_json::from_str(&fs::read_to_string(file).unwrap()).unwrap()
    }

    #[test]
    fn unknown_providers_are_refused() {
        let (_temp, file) = keys_file();
        for provider in ["other", "custom"] {
            for result in [
                get(&file, provider).map(|_| ()),
                set(&file, provider, "k"),
                remove(&file, provider),
            ] {
                assert_eq!(
                    result.unwrap_err(),
                    format!("Unknown key provider {provider}.")
                );
            }
        }
        assert!(!file.exists());
    }

    #[test]
    fn an_empty_key_is_refused() {
        let (_temp, file) = keys_file();
        assert_eq!(set(&file, "opencode-go", "  ").unwrap_err(), "Enter a key.");
        assert!(!file.exists());
    }

    #[test]
    fn a_missing_file_has_no_keys() {
        let (_temp, file) = keys_file();
        assert_eq!(get(&file, "tavily").unwrap(), None);
        assert_eq!(get(&file, "opencode-go").unwrap(), None);
    }

    #[test]
    fn a_saved_key_is_read_back_trimmed() {
        let (_temp, file) = keys_file();
        set(&file, "tavily", " tvly-1 \n").unwrap();
        assert_eq!(get(&file, "tavily").unwrap().as_deref(), Some("tvly-1"));
        assert_eq!(saved(&file), serde_json::json!({ "tavily": "tvly-1" }));
        assert!(!file.with_extension("json.tmp").exists());

        set(&file, "tavily", "tvly-2").unwrap();
        assert_eq!(get(&file, "tavily").unwrap().as_deref(), Some("tvly-2"));
    }

    #[test]
    fn remove_deletes_a_saved_key_and_leaves_the_others() {
        let (_temp, file) = keys_file();
        set(&file, "tavily", "tvly-1").unwrap();
        set(&file, "opencode-go", "sk-go").unwrap();

        remove(&file, "tavily").unwrap();
        assert_eq!(get(&file, "tavily").unwrap(), None);
        assert_eq!(get(&file, "opencode-go").unwrap().as_deref(), Some("sk-go"));
        assert_eq!(saved(&file), serde_json::json!({ "opencode-go": "sk-go" }));

        // Removing again is not an error.
        remove(&file, "tavily").unwrap();
        remove(&file, "opencode-go").unwrap();
        assert_eq!(saved(&file), serde_json::json!({}));
    }

    #[test]
    fn removing_with_no_file_is_not_an_error() {
        let (_temp, file) = keys_file();
        remove(&file, "tavily").unwrap();
        assert_eq!(get(&file, "tavily").unwrap(), None);
    }

    #[cfg(unix)]
    #[test]
    fn only_the_user_can_read_the_key_file() {
        use std::os::unix::fs::PermissionsExt;
        let mode = |file: &Path| fs::metadata(file).unwrap().permissions().mode() & 0o777;

        let (_temp, file) = keys_file();
        set(&file, "tavily", "tvly-1").unwrap();
        assert_eq!(mode(&file), 0o600);

        // A file that others could read gets the private mode on the next save.
        let (_temp, file) = keys_file();
        fs::create_dir_all(file.parent().unwrap()).unwrap();
        fs::write(&file, r#"{ "opencode-go": "sk-go" }"#).unwrap();
        fs::set_permissions(&file, fs::Permissions::from_mode(0o644)).unwrap();
        set(&file, "tavily", "tvly-1").unwrap();
        assert_eq!(mode(&file), 0o600);
        assert_eq!(
            saved(&file),
            serde_json::json!({ "opencode-go": "sk-go", "tavily": "tvly-1" })
        );
    }

    #[test]
    fn an_invalid_key_file_is_an_error_and_is_left_as_it_is() {
        for text in ["{ not json", "[]", r#"{ "tavily": 3 }"#, ""] {
            let (_temp, file) = keys_file();
            fs::create_dir_all(file.parent().unwrap()).unwrap();
            fs::write(&file, text).unwrap();
            let name = file.display().to_string();
            for result in [
                get(&file, "tavily").map(|_| ()),
                set(&file, "tavily", "tvly-1"),
                remove(&file, "tavily"),
            ] {
                let error = result.unwrap_err();
                assert!(
                    error.starts_with(&format!("{name} is not a valid key file (")),
                    "{text}: {error}"
                );
            }
            assert_eq!(fs::read_to_string(&file).unwrap(), text);
        }
    }

    #[test]
    fn a_key_file_that_cant_be_read_is_an_error() {
        let (_temp, file) = keys_file();
        // A folder where the file should be can't be read as a file.
        fs::create_dir_all(file.join("inside")).unwrap();
        let error = get(&file, "tavily").unwrap_err();
        assert!(
            error.starts_with(&format!("Couldn't read the key file {}: ", file.display())),
            "{error}"
        );
        assert!(set(&file, "tavily", "tvly-1").is_err());
        assert!(file.join("inside").is_dir());
    }

    #[test]
    fn saves_at_the_same_time_keep_both_keys() {
        for _ in 0..20 {
            let (_temp, file) = keys_file();
            let barrier = std::sync::Barrier::new(2);
            std::thread::scope(|s| {
                for (provider, key) in [("opencode-go", "sk-go"), ("tavily", "tvly-1")] {
                    let (file, barrier) = (&file, &barrier);
                    s.spawn(move || {
                        barrier.wait();
                        set(file, provider, key).unwrap();
                    });
                }
            });
            assert_eq!(
                saved(&file),
                serde_json::json!({ "opencode-go": "sk-go", "tavily": "tvly-1" })
            );
        }
    }
}
