use super::*;
use crate::workspace::PreferencesPatch;
use serde_json::{json, Value};
use std::{
    fs,
    sync::atomic::{AtomicUsize, Ordering},
};
use tauri::{
    ipc::{CallbackFn, InvokeBody, InvokeResponseBody},
    test::{get_ipc_response, mock_builder, mock_context, noop_assets, INVOKE_KEY},
    webview::InvokeRequest,
};
use tempfile::tempdir;

#[test]
fn ipc_contract_uses_camel_case_args_and_binary_image_response() {
    let temp = tempdir().unwrap();
    let root = temp.path().join("notes");
    fs::create_dir(&root).unwrap();
    fs::write(root.join("photo.PNG"), [1, 2, 3]).unwrap();
    let state = ManagedWorkspace::new(temp.path().join("config/preferences.json"));
    let generation = state
        .0
        .lock()
        .unwrap()
        .pick(Some(root))
        .unwrap()
        .unwrap()
        .generation;
    let app = register(mock_builder())
        .manage(state)
        .build(mock_context(noop_assets()))
        .unwrap();
    let window = tauri::WebviewWindowBuilder::new(&app, "main", Default::default())
        .build()
        .unwrap();
    let invoke = |cmd: &str, args: Value| {
        get_ipc_response(
            &window,
            InvokeRequest {
                cmd: cmd.into(),
                callback: CallbackFn(0),
                error: CallbackFn(1),
                url: if cfg!(windows) {
                    "http://tauri.localhost"
                } else {
                    "tauri://localhost"
                }
                .parse()
                .unwrap(),
                body: InvokeBody::Json(args),
                headers: Default::default(),
                invoke_key: INVOKE_KEY.into(),
            },
        )
    };
    let bootstrap = invoke("initialize_workspace", json!({}))
        .unwrap()
        .deserialize::<Value>()
        .unwrap();
    let player = invoke("read_player", json!({"generation":generation}))
        .unwrap()
        .deserialize::<Value>()
        .unwrap();
    assert_eq!(player["profile"]["version"], 1);
    assert_eq!(player["metadataExists"], false);
    assert_eq!(player["descriptionExists"], false);
    let profile =
        json!({"version":1,"name":"Player","photoPath":null,"stats":[{"label":"HP","value":"12"}]});
    invoke(
        "write_player",
        json!({"generation":generation,"profile":profile,"createIfMissing":true}),
    )
    .unwrap();
    assert!(invoke(
        "write_player",
        json!({"generation":generation,"profile":profile,"createIfMissing":true})
    )
    .is_err());
    invoke(
        "write_player_description",
        json!({"generation":generation,"content":"# Player","createIfMissing":true}),
    )
    .unwrap();
    let player = invoke("read_player", json!({"generation":generation}))
        .unwrap()
        .deserialize::<Value>()
        .unwrap();
    assert_eq!(player["profile"], profile);
    assert_eq!(player["description"], "# Player");
    assert_eq!(player["metadataExists"], true);
    assert_eq!(player["descriptionExists"], true);
    assert_eq!(bootstrap["preferences"]["sidebarWidth"], 260.0);
    assert_eq!(bootstrap["workspace"]["generation"], generation);
    invoke(
        "create_entry",
        json!({"generation":generation,"parentPath":"","name":"sub","kind":"folder"}),
    )
    .unwrap();
    invoke(
        "create_entry",
        json!({"generation":generation,"parentPath":"sub","name":"note.md","kind":"note"}),
    )
    .unwrap();
    invoke(
        "write_note",
        json!({"generation":generation,"path":"sub/note.md","content":"# Hello"}),
    )
    .unwrap();
    assert_eq!(
        invoke(
            "read_note",
            json!({"generation":generation,"path":"sub/note.md"})
        )
        .unwrap()
        .deserialize::<String>()
        .unwrap(),
        "# Hello"
    );
    for args in [
        json!({"generation":generation,"path":"photo.PNG"}),
        json!({"generation":generation,"path":"../photo.PNG","notePath":"sub/note.md"}),
    ] {
        match invoke("read_image", args).unwrap() {
            InvokeResponseBody::Raw(bytes) => assert_eq!(bytes, [1, 2, 3]),
            _ => panic!("image response must be binary"),
        }
    }
    let renamed = invoke(
        "rename_entry",
        json!({"generation":generation,"path":"sub/note.md","name":"renamed.markdown"}),
    )
    .unwrap()
    .deserialize::<Value>()
    .unwrap();
    assert_eq!(renamed["path"], "sub/renamed.markdown");
    invoke("refresh_workspace", json!({"generation":generation})).unwrap();
    let preferences = invoke(
        "update_preferences",
        json!({"patch":{"sidebarCollapsed":true,"lineNumbers":true}}),
    )
    .unwrap()
    .deserialize::<Value>()
    .unwrap();
    assert_eq!(preferences["sidebarCollapsed"], true);
    assert_eq!(preferences["lineNumbers"], true);
    let error = invoke(
        "trash_entry",
        json!({"generation":generation+1,"path":"sub/renamed.markdown"}),
    )
    .unwrap_err();
    assert!(error.as_str().unwrap().contains("workspace changed"));
}

#[test]
fn blocking_operations_serialize_preferences_and_generation_changes() {
    let temp = tempdir().unwrap();
    let config = temp.path().join("preferences.json");
    let state = ManagedWorkspace::new(config.clone());
    let active = Arc::new(AtomicUsize::new(0));
    std::thread::scope(|scope| {
        let handles: Vec<_> = (0..4)
            .map(|index| {
                let state = state.clone();
                let active = active.clone();
                scope.spawn(move || {
                    tauri::async_runtime::block_on(with_store(state, move |store| {
                        assert_eq!(active.fetch_add(1, Ordering::SeqCst), 0);
                        std::thread::sleep(std::time::Duration::from_millis(5));
                        let patch = match index {
                            0 => PreferencesPatch {
                                sidebar_width: Some(333.0),
                                ..Default::default()
                            },
                            1 => PreferencesPatch {
                                sidebar_collapsed: Some(true),
                                ..Default::default()
                            },
                            2 => PreferencesPatch {
                                show_hidden: Some(true),
                                ..Default::default()
                            },
                            _ => PreferencesPatch {
                                line_numbers: Some(true),
                                ..Default::default()
                            },
                        };
                        store.update_preferences(patch)?;
                        active.fetch_sub(1, Ordering::SeqCst);
                        Ok(())
                    }))
                    .unwrap()
                })
            })
            .collect();
        for handle in handles {
            handle.join().unwrap();
        }
    });
    let preferences = WorkspaceStore::new(config)
        .initialize()
        .unwrap()
        .preferences;
    assert_eq!(preferences.sidebar_width, 333.0);
    assert!(preferences.sidebar_collapsed && preferences.show_hidden && preferences.line_numbers);
    let old_root = temp.path().join("old");
    let new_root = temp.path().join("new");
    fs::create_dir(&old_root).unwrap();
    fs::create_dir(&new_root).unwrap();
    fs::write(old_root.join("note.md"), "old").unwrap();
    fs::write(new_root.join("note.md"), "new").unwrap();
    let generation = state
        .0
        .lock()
        .unwrap()
        .pick(Some(old_root.clone()))
        .unwrap()
        .unwrap()
        .generation;
    let (started_tx, started_rx) = std::sync::mpsc::channel();
    let (release_tx, release_rx) = std::sync::mpsc::channel();
    let writing_state = state.clone();
    let writer = std::thread::spawn(move || {
        tauri::async_runtime::block_on(with_store(writing_state, move |store| {
            started_tx.send(()).unwrap();
            release_rx.recv().unwrap();
            store.write_note(generation, "note.md", "saved")
        }))
    });
    started_rx.recv().unwrap();
    let switching_state = state.clone();
    let switcher = std::thread::spawn(move || {
        tauri::async_runtime::block_on(with_store(switching_state, move |store| {
            store.pick(Some(new_root))
        }))
    });
    release_tx.send(()).unwrap();
    writer.join().unwrap().unwrap();
    switcher.join().unwrap().unwrap();
    assert_eq!(
        fs::read_to_string(old_root.join("note.md")).unwrap(),
        "saved"
    );
    assert!(
        tauri::async_runtime::block_on(with_store(state, move |store| store
            .write_note(generation, "note.md", "stale")))
        .is_err()
    );
    assert_eq!(
        fs::read_to_string(temp.path().join("new/note.md")).unwrap(),
        "new"
    );
}
