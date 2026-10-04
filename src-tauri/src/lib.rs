mod commands;
mod workspace;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    commands::register(tauri::Builder::default())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let config = app.path().app_config_dir()?.join("preferences.json");
            app.manage(commands::ManagedWorkspace::new(config));
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
