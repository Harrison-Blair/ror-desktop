mod notes;

use notes::{Entry, Kind, NotesError};
use notify_debouncer_mini::{new_debouncer, notify::RecursiveMode};
use std::path::PathBuf;
use std::sync::Mutex;
use std::time::Duration;
use tauri::{Emitter, Manager, State};

struct NotesRoot(PathBuf);

#[tauri::command]
fn notes_list(root: State<NotesRoot>) -> Result<Vec<Entry>, NotesError> {
    notes::list(&root.0)
}

#[tauri::command]
fn notes_create(
    root: State<NotesRoot>,
    parent: String,
    kind: Kind,
    name: String,
) -> Result<String, NotesError> {
    notes::create(&root.0, &parent, kind, &name)
}

#[tauri::command]
fn notes_rename(
    root: State<NotesRoot>,
    path: String,
    new_name: String,
) -> Result<String, NotesError> {
    notes::rename(&root.0, &path, &new_name)
}

#[tauri::command]
fn notes_move(
    root: State<NotesRoot>,
    path: String,
    new_parent: String,
) -> Result<String, NotesError> {
    notes::move_item(&root.0, &path, &new_parent)
}

#[tauri::command]
fn notes_delete(root: State<NotesRoot>, path: String) -> Result<(), NotesError> {
    notes::delete(&root.0, &path)
}

pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let root = app.path().app_data_dir()?.join("notes");
            std::fs::create_dir_all(&root)?;

            let handle = app.handle().clone();
            let watcher = new_debouncer(
                Duration::from_millis(200),
                move |res: notify_debouncer_mini::DebounceEventResult| {
                    if res.is_ok() {
                        let _ = handle.emit("notes-changed", ());
                    }
                },
            )
            .and_then(|mut debouncer| {
                debouncer.watcher().watch(&root, RecursiveMode::Recursive)?;
                Ok(debouncer)
            });
            match watcher {
                Ok(debouncer) => {
                    app.manage(Mutex::new(debouncer));
                }
                Err(e) => eprintln!("Couldn't watch the notes folder {}: {e}", root.display()),
            }

            app.manage(NotesRoot(root));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            notes_list,
            notes_create,
            notes_rename,
            notes_move,
            notes_delete
        ])
        .run(tauri::generate_context!())
        .expect("error while running Ror Desktop");
}
