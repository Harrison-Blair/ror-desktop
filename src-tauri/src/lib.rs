mod notes;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(notes::NotesRoot::default())
        .invoke_handler(tauri::generate_handler![
            notes::pick_folder,
            notes::list_tree
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
