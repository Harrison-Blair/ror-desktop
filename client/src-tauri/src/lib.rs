mod config;
mod notes;

use notes::{Entry, Kind, NotesError};
use notify_debouncer_mini::{
    new_debouncer,
    notify::{RecommendedWatcher, RecursiveMode},
    Debouncer,
};
use serde::Serialize;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager, State, WebviewWindow};
use tauri_plugin_dialog::DialogExt;

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

// Watches `root` in place of `old`, if the watcher started.
fn watch(app: &AppHandle, old: Option<&Path>, root: &Path) {
    let Some(watcher) = app.try_state::<NotesWatcher>() else {
        return;
    };
    let mut watcher = watcher.lock().unwrap();
    if let Some(old) = old {
        let _ = watcher.watcher().unwatch(old);
    }
    if let Err(e) = watcher.watcher().watch(root, RecursiveMode::Recursive) {
        eprintln!("Couldn't watch the notes folder {}: {e}", root.display());
    }
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
    config::save_notes_dir(&file, &dir)
        .map_err(|e| format!("Couldn't save the notes folder: {e}."))?;

    let root = app.state::<NotesRoot>();
    let old = std::mem::replace(&mut *root.0.lock().unwrap(), dir.clone());
    watch(&app, Some(&old), &dir);
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
fn notes_delete(root: State<NotesRoot>, path: String) -> Result<(), NotesError> {
    notes::delete(&root.get(), &path)
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
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
                Ok(debouncer) => {
                    app.manage(Mutex::new(debouncer));
                }
                Err(e) => eprintln!("Couldn't watch the notes folder: {e}"),
            }
            watch(app.handle(), None, &start.root);

            app.manage(NotesRoot(Mutex::new(start.root)));
            app.manage(MissingNotesDir(start.missing));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            notes_list,
            notes_create,
            notes_rename,
            notes_move,
            notes_delete,
            notes_folder,
            notes_choose_folder
        ])
        .run(tauri::generate_context!())
        .expect("error while running Ror Desktop");
}
