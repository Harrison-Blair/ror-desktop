mod chat;
mod config;
mod notes;
mod secrets;
mod web;

use notes::{Entry, Kind, NotesError};
use notify_debouncer_mini::{
    new_debouncer,
    notify::{RecommendedWatcher, RecursiveMode, Watcher},
    Debouncer,
};
use serde::Serialize;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager, State, WebviewWindow};
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_opener::OpenerExt;

struct NotesRoot(Mutex<PathBuf>);

impl NotesRoot {
    fn get(&self) -> PathBuf {
        self.0.lock().unwrap().clone()
    }
}

// The saved folder that was missing at startup, if any.
struct MissingNotesDir(Option<PathBuf>);

type NotesWatcher = Mutex<Debouncer<RecommendedWatcher>>;

#[derive(Serialize)]
struct NotesFolder {
    path: String,
    missing: Option<String>,
}

fn path_string(path: &Path) -> String {
    path.to_string_lossy().into_owned()
}

fn config_file(app: &AppHandle) -> tauri::Result<PathBuf> {
    Ok(app.path().app_config_dir()?.join("config.json"))
}

fn keys_file(app: &AppHandle) -> tauri::Result<PathBuf> {
    Ok(app.path().app_config_dir()?.join("keys.json"))
}

// Unwatching a folder also drops the watches inside it, so after unwatching
// `gone`, a folder `kept` that overlaps it needs watching again.
fn unwatch(watcher: &mut dyn Watcher, gone: &Path, kept: &Path) {
    if let Err(e) = watcher.unwatch(gone) {
        eprintln!(
            "Couldn't stop watching the notes folder {}: {e}",
            gone.display()
        );
    }
    if kept.starts_with(gone) || gone.starts_with(kept) {
        if let Err(e) = watcher.watch(kept, RecursiveMode::Recursive) {
            eprintln!("Couldn't watch the notes folder {}: {e}", kept.display());
        }
    }
}

// Watches `new` in place of `old` around `save`. When watching `new` or
// `save` fails, `old` stays watched and the error is returned.
fn switch_watch(
    watcher: &mut Debouncer<RecommendedWatcher>,
    old: &Path,
    new: &Path,
    save: impl FnOnce() -> Result<(), String>,
) -> Result<(), String> {
    let watcher = watcher.watcher();
    watcher
        .watch(new, RecursiveMode::Recursive)
        .map_err(|e| format!("Couldn't watch {}: {e}.", new.display()))?;
    if let Err(e) = save() {
        unwatch(watcher, new, old);
        return Err(e);
    }
    unwatch(watcher, old, new);
    Ok(())
}

#[tauri::command]
fn notes_folder(root: State<NotesRoot>, missing: State<MissingNotesDir>) -> NotesFolder {
    NotesFolder {
        path: path_string(&root.get()),
        missing: missing.0.as_deref().map(path_string),
    }
}

// Async so that the open picker doesn't block the main thread.
#[tauri::command]
async fn notes_choose_folder(
    app: AppHandle,
    window: WebviewWindow,
) -> Result<Option<String>, String> {
    let Some(picked) = app
        .dialog()
        .file()
        .set_parent(&window)
        .blocking_pick_folder()
    else {
        return Ok(None);
    };
    let dir = picked.into_path().map_err(|e| e.to_string())?;
    let file = config_file(&app).map_err(|e| e.to_string())?;
    let save = || {
        config::save_notes_dir(&file, &dir)
            .map_err(|e| format!("Couldn't save the notes folder: {e}."))
    };

    // Holding the root through the whole switch makes switches run one at a
    // time, so the config, the root and the watcher agree.
    let root_state = app.state::<NotesRoot>();
    let mut root = root_state.0.lock().unwrap();
    match app.try_state::<NotesWatcher>() {
        Some(watcher) => switch_watch(&mut watcher.lock().unwrap(), &root, &dir, save)?,
        None => save()?,
    }
    *root = dir.clone();
    Ok(Some(path_string(&dir)))
}

#[tauri::command]
fn notes_list(root: State<NotesRoot>) -> Result<Vec<Entry>, NotesError> {
    notes::list(&root.get())
}

#[tauri::command]
fn notes_create(
    root: State<NotesRoot>,
    parent: String,
    kind: Kind,
    name: String,
) -> Result<String, NotesError> {
    notes::create(&root.get(), &parent, kind, &name)
}

#[tauri::command]
fn notes_rename(
    root: State<NotesRoot>,
    path: String,
    new_name: String,
) -> Result<String, NotesError> {
    notes::rename(&root.get(), &path, &new_name)
}

#[tauri::command]
fn notes_move(
    root: State<NotesRoot>,
    path: String,
    new_parent: String,
) -> Result<String, NotesError> {
    notes::move_item(&root.get(), &path, &new_parent)
}

#[tauri::command]
fn notes_search(root: State<NotesRoot>, query: String) -> Result<notes::SearchResult, NotesError> {
    notes::search(&root.get(), &query)
}

#[tauri::command]
fn notes_read(root: State<NotesRoot>, path: String) -> Result<String, NotesError> {
    notes::read(&root.get(), &path)
}

#[tauri::command]
fn notes_write(root: State<NotesRoot>, path: String, text: String) -> Result<(), NotesError> {
    notes::write(&root.get(), &path, &text)
}

// Only web and mail links open outside the app.
fn web_link(url: &str) -> Result<tauri::Url, String> {
    let refused = || "Can't open this link.".to_string();
    let url = tauri::Url::parse(url).map_err(|_| refused())?;
    match url.scheme() {
        "http" | "https" | "mailto" => Ok(url),
        _ => Err(refused()),
    }
}

// Opens a web or mail link in the system's browser or mail app.
#[tauri::command]
fn open_web_link(app: AppHandle, url: String) -> Result<(), String> {
    let url = web_link(&url)?;
    app.opener()
        .open_url(url.as_str(), None::<&str>)
        .map_err(|e| format!("Couldn't open the link: {e}."))
}

#[tauri::command]
fn notes_delete(root: State<NotesRoot>, path: String) -> Result<(), NotesError> {
    notes::delete(&root.get(), &path)
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let start = config::notes_start(
                &config_file(app.handle())?,
                &app.path().app_data_dir()?.join("notes"),
            )?;

            let handle = app.handle().clone();
            let watcher = new_debouncer(
                Duration::from_millis(200),
                move |res: notify_debouncer_mini::DebounceEventResult| {
                    if res.is_ok() {
                        let _ = handle.emit("notes-changed", ());
                    }
                },
            );
            match watcher {
                Ok(mut debouncer) => {
                    if let Err(e) = debouncer
                        .watcher()
                        .watch(&start.root, RecursiveMode::Recursive)
                    {
                        eprintln!(
                            "Couldn't watch the notes folder {}: {e}",
                            start.root.display()
                        );
                    }
                    app.manage(Mutex::new(debouncer));
                }
                Err(e) => eprintln!("Couldn't watch the notes folder: {e}"),
            }

            app.manage(NotesRoot(Mutex::new(start.root)));
            app.manage(MissingNotesDir(start.missing));
            app.manage(chat::ChatState::with_codex_dir(
                app.path().app_cache_dir()?.join("codex"),
            ));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            notes_list,
            notes_create,
            notes_rename,
            notes_move,
            notes_delete,
            notes_read,
            notes_write,
            notes_search,
            notes_folder,
            notes_choose_folder,
            open_web_link,
            chat::chat_settings,
            chat::chat_set_model,
            chat::chat_set_permission_mode,
            chat::key_saved,
            chat::key_save,
            chat::key_remove,
            chat::chat_models,
            chat::codex_status,
            chat::chat_latest,
            chat::chat_list,
            chat::chat_open,
            chat::chat_rename,
            chat::chat_set_archived,
            chat::chat_delete,
            chat::chat_send,
            chat::chat_tool_result,
            chat::chat_stop,
            web::web_search,
            web::web_fetch
        ])
        .build(tauri::generate_context!())
        .expect("error while running Ror Desktop")
        .run(|app, event| {
            // The Codex app server ends with the app.
            if let tauri::RunEvent::Exit = event {
                if let Some(chat) = app.try_state::<chat::ChatState>() {
                    chat.shutdown();
                }
            }
        });
}

#[cfg(test)]
mod tests {
    use super::*;
    use notify_debouncer_mini::DebounceEventResult;
    use std::cell::Cell;
    use std::fs;
    use std::sync::mpsc::{channel, Receiver};

    struct Setup {
        _temp: tempfile::TempDir,
        old: PathBuf,
        other: PathBuf,
        watcher: Debouncer<RecommendedWatcher>,
        events: Receiver<DebounceEventResult>,
        probes: Cell<u32>,
    }

    // Watches `old` the way startup does.
    fn setup() -> Setup {
        let temp = tempfile::tempdir().unwrap();
        let old = temp.path().join("Old");
        let other = temp.path().join("Other");
        fs::create_dir_all(old.join("Inner")).unwrap();
        fs::create_dir(&other).unwrap();
        let (tx, events) = channel();
        let mut watcher = new_debouncer(Duration::from_millis(50), tx).unwrap();
        watcher
            .watcher()
            .watch(&old, RecursiveMode::Recursive)
            .unwrap();
        Setup {
            _temp: temp,
            old,
            other,
            watcher,
            events,
            probes: Cell::new(0),
        }
    }

    // Writes a new file in `dir` and reports whether the watcher saw it. Each
    // probe uses its own file, so a late event from an earlier probe can't
    // answer for it.
    fn sees_change(setup: &Setup, dir: &Path) -> bool {
        let probe = setup.probes.get() + 1;
        setup.probes.set(probe);
        let file = dir.join(format!("change-{probe}.md"));
        fs::write(&file, "x").unwrap();
        let deadline = std::time::Instant::now() + Duration::from_secs(5);
        while let Some(left) = deadline.checked_duration_since(std::time::Instant::now()) {
            match setup.events.recv_timeout(left) {
                Ok(Ok(events)) if events.iter().any(|e| e.path == file) => return true,
                Ok(_) => {}
                Err(_) => return false,
            }
        }
        false
    }

    #[test]
    fn only_web_and_mail_links_open() {
        for url in ["https://x.y/a?b#c", "HTTP://x.y", "mailto:a@x.y"] {
            assert!(web_link(url).is_ok(), "{url}");
        }
        for url in [
            "file:///etc/passwd",
            "javascript:alert(1)",
            "ftp://x.y",
            "Ada.md",
            "",
        ] {
            assert_eq!(
                web_link(url),
                Err("Can't open this link.".to_string()),
                "{url}"
            );
        }
    }

    #[test]
    fn a_switch_watches_the_new_folder_only() {
        let mut s = setup();
        let (old, other) = (s.old.clone(), s.other.clone());
        let mut saved = false;
        switch_watch(&mut s.watcher, &old, &other, || {
            saved = true;
            Ok(())
        })
        .unwrap();
        assert!(saved);
        assert!(sees_change(&s, &other));
        assert!(!sees_change(&s, &old));
    }

    #[test]
    fn a_folder_that_cant_be_watched_is_not_saved() {
        let mut s = setup();
        let old = s.old.clone();
        let gone = s.other.join("Gone");
        let mut saved = false;
        let result = switch_watch(&mut s.watcher, &old, &gone, || {
            saved = true;
            Ok(())
        });
        assert!(result.is_err());
        assert!(!saved);
        assert!(sees_change(&s, &old));
    }

    #[test]
    fn a_failed_save_keeps_the_old_watch() {
        for inside in [false, true] {
            let mut s = setup();
            let old = s.old.clone();
            let new = if inside {
                old.join("Inner")
            } else {
                s.other.clone()
            };
            let result = switch_watch(&mut s.watcher, &old, &new, || {
                Err("Couldn't save".to_string())
            });
            assert_eq!(result, Err("Couldn't save".to_string()));
            assert!(sees_change(&s, &old.join("Inner")), "inside: {inside}");
            if !inside {
                assert!(!sees_change(&s, &new));
            }
        }
    }

    #[test]
    fn overlapping_folders_stay_watched() {
        // The same folder, a folder inside the old one, and the folder around it.
        for case in ["same", "inside", "around"] {
            let mut s = setup();
            let old = s.old.clone();
            let inner = old.join("Inner");
            let (from, to) = match case {
                "same" => (&old, &old),
                "inside" => (&old, &inner),
                _ => {
                    switch_watch(&mut s.watcher, &old, &inner, || Ok(())).unwrap();
                    (&inner, &old)
                }
            };
            switch_watch(&mut s.watcher, from, to, || Ok(())).unwrap();
            assert!(sees_change(&s, &inner), "{case}");
            assert!(sees_change(&s, to), "{case}");
        }
    }
}
