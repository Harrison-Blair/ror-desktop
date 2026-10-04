use crate::workspace::{
    Bootstrap, EntryKind, Preferences, PreferencesPatch, RenameResult, Workspace, WorkspaceStore,
};
use std::{
    path::PathBuf,
    sync::{Arc, Mutex},
};
use tauri::{ipc::Response, State};
#[cfg(desktop)]
use tauri_plugin_dialog::DialogExt;

type Result<T> = std::result::Result<T, String>;

#[derive(Clone)]
pub struct ManagedWorkspace(Arc<Mutex<WorkspaceStore>>);

impl ManagedWorkspace {
    pub fn new(config: PathBuf) -> Self {
        Self(Arc::new(Mutex::new(WorkspaceStore::new(config))))
    }
}

pub fn register<R: tauri::Runtime>(builder: tauri::Builder<R>) -> tauri::Builder<R> {
    builder.invoke_handler(tauri::generate_handler![
        initialize_workspace,
        pick_workspace,
        refresh_workspace,
        read_note,
        write_note,
        read_image,
        create_entry,
        rename_entry,
        trash_entry,
        update_preferences,
    ])
}

async fn with_store<T: Send + 'static>(
    state: ManagedWorkspace,
    operation: impl FnOnce(&mut WorkspaceStore) -> Result<T> + Send + 'static,
) -> Result<T> {
    tauri::async_runtime::spawn_blocking(move || {
        // Hold the lock through I/O: a root switch cannot interleave a validated operation.
        let mut store = state
            .0
            .lock()
            .map_err(|_| "Workspace state is unavailable")?;
        operation(&mut store)
    })
    .await
    .map_err(|error| format!("Workspace operation failed: {error}"))?
}

#[tauri::command]
async fn initialize_workspace(state: State<'_, ManagedWorkspace>) -> Result<Bootstrap> {
    with_store(state.inner().clone(), WorkspaceStore::initialize).await
}

#[tauri::command]
async fn pick_workspace<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    state: State<'_, ManagedWorkspace>,
) -> Result<Option<Workspace>> {
    #[cfg(desktop)]
    {
        // The dialog runs without the store lock so canceling never changes the active root.
        let selected = tauri::async_runtime::spawn_blocking(move || {
            app.dialog()
                .file()
                .set_title("Open a folder")
                .blocking_pick_folder()
                .map(|path| path.into_path().map_err(|error| error.to_string()))
                .transpose()
        })
        .await
        .map_err(|error| format!("Folder picker failed: {error}"))??;
        with_store(state.inner().clone(), move |store| store.pick(selected)).await
    }
    #[cfg(not(desktop))]
    {
        let _ = (app, state);
        Err("Folder selection is supported on desktop only".into())
    }
}

#[tauri::command]
async fn refresh_workspace(
    state: State<'_, ManagedWorkspace>,
    generation: u64,
) -> Result<Workspace> {
    with_store(state.inner().clone(), move |store| {
        store.refresh(generation)
    })
    .await
}

#[tauri::command]
async fn read_note(
    state: State<'_, ManagedWorkspace>,
    generation: u64,
    path: String,
) -> Result<String> {
    with_store(state.inner().clone(), move |store| {
        store.read_note(generation, &path)
    })
    .await
}

#[tauri::command]
async fn write_note(
    state: State<'_, ManagedWorkspace>,
    generation: u64,
    path: String,
    content: String,
) -> Result<()> {
    with_store(state.inner().clone(), move |store| {
        store.write_note(generation, &path, &content)
    })
    .await
}

#[tauri::command]
async fn read_image(
    state: State<'_, ManagedWorkspace>,
    generation: u64,
    path: String,
    note_path: Option<String>,
) -> Result<Response> {
    with_store(state.inner().clone(), move |store| {
        store
            .read_image(generation, &path, note_path.as_deref())
            .map(Response::new)
    })
    .await
}

#[tauri::command]
async fn create_entry(
    state: State<'_, ManagedWorkspace>,
    generation: u64,
    parent_path: String,
    name: String,
    kind: EntryKind,
) -> Result<Workspace> {
    with_store(state.inner().clone(), move |store| {
        store.create(generation, &parent_path, &name, kind)
    })
    .await
}

#[tauri::command]
async fn rename_entry(
    state: State<'_, ManagedWorkspace>,
    generation: u64,
    path: String,
    name: String,
) -> Result<RenameResult> {
    with_store(state.inner().clone(), move |store| {
        store.rename(generation, &path, &name)
    })
    .await
}

#[tauri::command]
async fn trash_entry(
    state: State<'_, ManagedWorkspace>,
    generation: u64,
    path: String,
) -> Result<Workspace> {
    with_store(state.inner().clone(), move |store| {
        store.trash_with(generation, &path, |entry| {
            trash::delete(entry).map_err(|error| format!("Could not move entry to trash: {error}"))
        })
    })
    .await
}

#[tauri::command]
async fn update_preferences(
    state: State<'_, ManagedWorkspace>,
    patch: PreferencesPatch,
) -> Result<Preferences> {
    with_store(state.inner().clone(), move |store| {
        store.update_preferences(patch)
    })
    .await
}

#[cfg(test)]
mod tests;
