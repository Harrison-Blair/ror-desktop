use super::*;
use std::fs;
use tempfile::{tempdir, TempDir};

fn fixture() -> (TempDir, WorkspaceStore, Workspace) {
    let temp = tempdir().unwrap();
    let root = temp.path().join("notes");
    fs::create_dir(&root).unwrap();
    let mut store = WorkspaceStore::new(temp.path().join("config/preferences.json"));
    let workspace = store.pick(Some(root)).unwrap().unwrap();
    (temp, store, workspace)
}

#[test]
fn defaults_and_partial_preferences_persist_without_losing_fields() {
    let temp = tempdir().unwrap();
    let config = temp.path().join("config/preferences.json");
    let mut store = WorkspaceStore::new(config.clone());
    let bootstrap = store.initialize().unwrap();
    assert_eq!(bootstrap.preferences, Preferences::default());
    assert!(bootstrap.workspace.is_none());
    store
        .update_preferences(PreferencesPatch {
            show_hidden: Some(true),
            ..Default::default()
        })
        .unwrap();
    store
        .update_preferences(PreferencesPatch {
            sidebar_width: Some(310.0),
            line_numbers: Some(true),
            ..Default::default()
        })
        .unwrap();
    let preferences = WorkspaceStore::new(config)
        .initialize()
        .unwrap()
        .preferences;
    assert!(preferences.show_hidden && preferences.line_numbers);
    assert_eq!(preferences.sidebar_width, 310.0);
    assert!(serde_json::from_str::<PreferencesPatch>(r#"{"lastFolder":"/tmp"}"#).is_err());
}

#[test]
fn restore_and_cancel_keep_root_and_generation_stable() {
    let (temp, mut store, workspace) = fixture();
    assert!(store.pick(None).unwrap().is_none());
    assert_eq!(
        store.refresh(workspace.generation).unwrap().display_path,
        workspace.display_path
    );
    assert!(store.pick(Some(temp.path().join("missing"))).is_err());
    assert_eq!(
        store.refresh(workspace.generation).unwrap().generation,
        workspace.generation
    );
    let restored = WorkspaceStore::new(temp.path().join("config/preferences.json"))
        .initialize()
        .unwrap();
    assert_eq!(
        restored.workspace.unwrap().display_path,
        workspace.display_path
    );
    assert!(restored.restore_error.is_none());
    // initialize is idempotent: React strict mode must not invalidate a mounted workspace.
    assert_eq!(
        store.initialize().unwrap().workspace.unwrap().generation,
        workspace.generation
    );
}

#[test]
fn missing_restore_and_corrupt_preferences_are_visible() {
    let (temp, _, _) = fixture();
    fs::remove_dir(temp.path().join("notes")).unwrap();
    let config = temp.path().join("config/preferences.json");
    let bootstrap = WorkspaceStore::new(config.clone()).initialize().unwrap();
    assert!(bootstrap.workspace.is_none());
    assert!(bootstrap.restore_error.is_some());
    fs::write(&config, "{broken").unwrap();
    assert!(WorkspaceStore::new(config).initialize().is_err());
}

#[test]
fn failed_preference_write_does_not_replace_active_root_or_preferences() {
    let (temp, mut store, workspace) = fixture();
    let config_dir = temp.path().join("config");
    fs::remove_file(config_dir.join("preferences.json")).unwrap();
    fs::remove_dir(&config_dir).unwrap();
    fs::write(&config_dir, "blocked").unwrap();
    let other = temp.path().join("other");
    fs::create_dir(&other).unwrap();
    assert!(store.pick(Some(other)).is_err());
    assert!(store
        .update_preferences(PreferencesPatch {
            show_hidden: Some(true),
            ..Default::default()
        })
        .is_err());
    let state = store.initialize().unwrap();
    assert!(!state.preferences.show_hidden);
    assert_eq!(
        state.workspace.unwrap().display_path,
        workspace.display_path
    );
}

#[test]
fn tree_contains_hidden_and_all_file_types_sorted_folders_first() {
    let (temp, store, workspace) = fixture();
    let root = temp.path().join("notes");
    fs::create_dir(root.join("zFolder")).unwrap();
    for name in [
        "b.md",
        "A.PNG",
        ".hidden",
        "unknown.bin",
        "zFolder/nested.MD",
    ] {
        fs::write(root.join(name), "").unwrap();
    }
    let tree = serde_json::to_value(store.refresh(workspace.generation).unwrap()).unwrap();
    let nodes = tree["nodes"].as_array().unwrap();
    assert_eq!(
        nodes
            .iter()
            .map(|n| n["name"].as_str().unwrap())
            .collect::<Vec<_>>(),
        ["zFolder", ".hidden", "A.PNG", "b.md", "unknown.bin"]
    );
    assert_eq!(nodes[0]["children"][0]["path"], "zFolder/nested.MD");
    assert_eq!(nodes[0]["children"][0]["fileKind"], "note");
    assert_eq!(nodes[1]["fileKind"], "other");
    assert_eq!(nodes[2]["fileKind"], "image");
    assert_eq!(nodes[2]["isSymlink"], false);
}

#[test]
fn notes_round_trip_and_every_operation_rejects_stale_generation() {
    let (temp, mut store, workspace) = fixture();
    let generation = workspace.generation;
    store
        .create(generation, "", "draft.md", EntryKind::Note)
        .unwrap();
    store
        .write_note(generation, "draft.md", "# Hello\n🌱")
        .unwrap();
    assert_eq!(
        store.read_note(generation, "draft.md").unwrap(),
        "# Hello\n🌱"
    );
    let replacement = store
        .pick(Some(temp.path().join("notes")))
        .unwrap()
        .unwrap();
    assert!(replacement.generation > generation);
    assert!(store.refresh(generation).is_err());
    assert!(store.read_note(generation, "draft.md").is_err());
    assert!(store.write_note(generation, "draft.md", "oops").is_err());
    assert!(store.read_image(generation, "pic.png", None).is_err());
    assert!(store
        .create(generation, "", "other.md", EntryKind::Note)
        .is_err());
    assert!(store.rename(generation, "draft.md", "other.md").is_err());
    assert!(store
        .trash_with(generation, "draft.md", |_| panic!("stale trash called"))
        .is_err());
    assert_eq!(
        fs::read_to_string(temp.path().join("notes/draft.md")).unwrap(),
        "# Hello\n🌱"
    );
}

#[test]
fn names_are_portable_and_create_never_overwrites() {
    for name in [
        "", " ", "..", ".", "a/b", "a\\b", "a:b", "a*", "a?", "a\"", "a<", "a>", "a|", "a.", "a ",
        "a\0", "a\n",
    ] {
        assert!(validate_name(name).is_err(), "accepted {name:?}");
    }
    for name in [".hidden", "hello.md", "日本語", "two words"] {
        validate_name(name).unwrap();
    }
    let (temp, store, workspace) = fixture();
    let generation = workspace.generation;
    store
        .create(generation, "", "folder", EntryKind::Folder)
        .unwrap();
    store
        .create(generation, "folder", "exact-name", EntryKind::Note)
        .unwrap();
    assert!(temp.path().join("notes/folder/exact-name").is_file());
    store
        .create(generation, "", "existing.md", EntryKind::Note)
        .unwrap();
    fs::write(temp.path().join("notes/existing.md"), "keep").unwrap();
    assert!(store
        .create(generation, "", "existing.md", EntryKind::Note)
        .is_err());
    assert_eq!(
        fs::read_to_string(temp.path().join("notes/existing.md")).unwrap(),
        "keep"
    );
    assert!(store
        .create(generation, "", "folder", EntryKind::Folder)
        .is_err());
}

#[test]
fn rename_supports_case_changes_noop_and_rejects_collisions() {
    let (temp, store, workspace) = fixture();
    let generation = workspace.generation;
    store
        .create(generation, "", "name.md", EntryKind::Note)
        .unwrap();
    let renamed = store.rename(generation, "name.md", "NAME.md").unwrap();
    assert_eq!(renamed.path, "NAME.md");
    assert_eq!(renamed.workspace.generation, generation);
    store.rename(generation, "NAME.md", "NAME.md").unwrap();
    assert!(store
        .rename(generation, "missing.md", "missing.md")
        .is_err());
    store
        .create(generation, "", "other.md", EntryKind::Note)
        .unwrap();
    fs::write(temp.path().join("notes/other.md"), "keep").unwrap();
    assert!(store.rename(generation, "NAME.md", "other.md").is_err());
    assert_eq!(
        fs::read_to_string(temp.path().join("notes/other.md")).unwrap(),
        "keep"
    );
    assert!(store.rename(generation, "", "root").is_err());
    assert!(store
        .trash_with(generation, "", |_| panic!("root trash called"))
        .is_err());
}

#[cfg(target_os = "linux")]
#[test]
fn distinct_case_sensitive_target_is_never_overwritten_even_for_hardlinks() {
    let (temp, store, workspace) = fixture();
    fs::write(temp.path().join("notes/a.md"), "keep").unwrap();
    fs::hard_link(
        temp.path().join("notes/a.md"),
        temp.path().join("notes/A.md"),
    )
    .unwrap();
    assert!(store.rename(workspace.generation, "a.md", "A.md").is_err());
    assert!(temp.path().join("notes/a.md").exists());
    assert!(temp.path().join("notes/A.md").exists());
}

#[test]
fn image_paths_resolve_against_note_parent_and_stay_inside_root() {
    let (temp, store, workspace) = fixture();
    let generation = workspace.generation;
    fs::create_dir(temp.path().join("notes/sub")).unwrap();
    fs::write(temp.path().join("notes/sub/note.md"), "").unwrap();
    fs::write(temp.path().join("notes/pic space.PNG"), [1, 2, 3]).unwrap();
    assert_eq!(
        store
            .read_image(generation, "../pic space.PNG", Some("sub/note.md"))
            .unwrap(),
        [1, 2, 3]
    );
    assert_eq!(
        store.read_image(generation, "pic space.PNG", None).unwrap(),
        [1, 2, 3]
    );
    for path in [
        "../../outside.png",
        "/tmp/a.png",
        "https://example.com/a.png",
        "file:a.png",
        "data:image/png,abc",
        "C:\\a.png",
        "//server/a.png",
        "sub/note.md",
    ] {
        assert!(
            store
                .read_image(generation, path, Some("sub/note.md"))
                .is_err(),
            "accepted {path}"
        );
    }
    assert!(store
        .read_image(generation, "../pic space.PNG", Some("../outside.md"))
        .is_err());
    assert!(store.read_note(generation, "pic space.PNG").is_err());
    assert!(store
        .write_note(generation, "pic space.PNG", "oops")
        .is_err());
    assert!(store.write_note(generation, "missing.md", "oops").is_err());
}

#[test]
fn relative_file_commands_reject_escape_and_absolute_paths() {
    let (temp, store, workspace) = fixture();
    fs::write(temp.path().join("outside.md"), "private").unwrap();
    for path in [
        "../outside.md",
        "/tmp/outside.md",
        "C:/outside.md",
        "a\\b.md",
    ] {
        assert!(store.read_note(workspace.generation, path).is_err());
        assert!(store
            .write_note(workspace.generation, path, "oops")
            .is_err());
        assert!(store.rename(workspace.generation, path, "new.md").is_err());
        assert!(store
            .create(workspace.generation, path, "new.md", EntryKind::Note)
            .is_err());
        assert!(store
            .trash_with(workspace.generation, path, |_| panic!(
                "escape trash called"
            ))
            .is_err());
    }
    assert_eq!(
        fs::read_to_string(temp.path().join("outside.md")).unwrap(),
        "private"
    );
}

#[test]
fn trash_failure_preserves_file_and_success_refreshes_without_new_generation() {
    let (temp, store, workspace) = fixture();
    store
        .create(workspace.generation, "", "note.md", EntryKind::Note)
        .unwrap();
    assert!(store
        .trash_with(workspace.generation, "note.md", |_| Err(
            "trash unavailable".into()
        ))
        .unwrap_err()
        .contains("trash unavailable"));
    assert!(temp.path().join("notes/note.md").exists());
    let trashed = store
        .trash_with(workspace.generation, "note.md", |path| {
            fs::rename(path, temp.path().join("fake-trash.md")).map_err(|e| e.to_string())
        })
        .unwrap();
    assert_eq!(trashed.generation, workspace.generation);
    assert!(trashed.nodes.is_empty());
    assert!(temp.path().join("fake-trash.md").exists());
}

#[cfg(unix)]
#[test]
fn symlinks_are_listed_without_recursion_and_reads_check_targets() {
    use std::os::unix::fs::symlink;
    let (temp, store, workspace) = fixture();
    let root = temp.path().join("notes");
    fs::write(root.join("note.md"), "inside").unwrap();
    fs::write(temp.path().join("outside.md"), "outside").unwrap();
    symlink(&root, root.join("loop")).unwrap();
    symlink(root.join("note.md"), root.join("inside.md")).unwrap();
    symlink(temp.path().join("outside.md"), root.join("outside.md")).unwrap();
    symlink(temp.path().join("missing"), root.join("broken")).unwrap();
    let tree = serde_json::to_value(store.refresh(workspace.generation).unwrap()).unwrap();
    assert_eq!(tree["nodes"][0]["name"], "loop");
    assert_eq!(tree["nodes"][0]["children"], serde_json::json!([]));
    assert_eq!(tree["nodes"][0]["isSymlink"], true);
    assert_eq!(
        store.read_note(workspace.generation, "inside.md").unwrap(),
        "inside"
    );
    assert!(store.read_note(workspace.generation, "outside.md").is_err());
    assert!(store
        .write_note(workspace.generation, "outside.md", "oops")
        .is_err());
    assert!(store
        .create(workspace.generation, "loop", "new.md", EntryKind::Note)
        .is_err());
    assert!(store
        .write_note(workspace.generation, "loop/note.md", "oops")
        .is_err());
    assert!(store
        .rename(workspace.generation, "loop/note.md", "other.md")
        .is_err());
    assert!(store
        .trash_with(workspace.generation, "loop/note.md", |_| panic!(
            "linked parent trash called"
        ))
        .is_err());
    store
        .rename(workspace.generation, "outside.md", "renamed.md")
        .unwrap();
    assert!(root.join("renamed.md").is_symlink());
    store
        .trash_with(workspace.generation, "renamed.md", |path| {
            assert!(path.is_symlink());
            fs::remove_file(path).map_err(|e| e.to_string())
        })
        .unwrap();
    assert_eq!(
        fs::read_to_string(temp.path().join("outside.md")).unwrap(),
        "outside"
    );
}

#[cfg(unix)]
#[test]
fn non_utf8_names_produce_visible_scan_error_and_preserve_active_root() {
    use std::os::unix::ffi::OsStringExt;
    let (temp, mut store, workspace) = fixture();
    let other = temp.path().join("other");
    fs::create_dir(&other).unwrap();
    fs::write(other.join(std::ffi::OsString::from_vec(vec![0xff])), "").unwrap();
    assert!(store.pick(Some(other)).is_err());
    assert_eq!(
        store.refresh(workspace.generation).unwrap().display_path,
        workspace.display_path
    );
}

#[test]
fn case_only_rename_rolls_back_and_reports_recovery_path_if_rollback_fails() {
    let temp = tempdir().unwrap();
    let source = temp.path().join("name.md");
    let target = temp.path().join("NAME.md");
    fs::write(&source, "keep").unwrap();
    let mut calls = 0;
    let error = rename_case_only_with(&source, &target, |from, to| {
        calls += 1;
        if calls == 2 {
            Err(std::io::Error::other("target failed"))
        } else {
            fs::rename(from, to)
        }
    })
    .unwrap_err();
    assert!(error.contains("target failed"));
    assert_eq!(fs::read_to_string(&source).unwrap(), "keep");
    assert_eq!(calls, 3);
    let mut remaining = PathBuf::new();
    let mut calls = 0;
    let error = rename_case_only_with(&source, &target, |from, to| {
        calls += 1;
        if calls == 1 {
            remaining = to.to_owned();
            fs::rename(from, to)
        } else {
            Err(std::io::Error::other("blocked"))
        }
    })
    .unwrap_err();
    assert!(error.contains(remaining.to_str().unwrap()));
    assert_eq!(fs::read_to_string(remaining).unwrap(), "keep");
}

#[test]
fn case_only_rename_intermediate_step_preserves_content() {
    let temp = tempdir().unwrap();
    let source = temp.path().join("name.md");
    let target = temp.path().join("NAME.md");
    fs::write(&source, "keep").unwrap();
    rename_case_only_with(&source, &target, |from, to| {
        renamore::rename_exclusive(from, to)
    })
    .unwrap();
    assert_eq!(fs::read_to_string(target).unwrap(), "keep");
    assert_eq!(fs::read_dir(temp.path()).unwrap().count(), 1);
}

#[cfg(unix)]
#[test]
fn unreadable_subtrees_return_scan_error() {
    use std::os::unix::fs::PermissionsExt;
    let (temp, store, workspace) = fixture();
    let blocked = temp.path().join("notes/blocked");
    fs::create_dir(&blocked).unwrap();
    fs::set_permissions(&blocked, fs::Permissions::from_mode(0o0)).unwrap();
    let scan = store.refresh(workspace.generation);
    fs::set_permissions(&blocked, fs::Permissions::from_mode(0o700)).unwrap();
    assert!(scan.is_err());
}
