// Saved chats: one JSON file per chat in the chats folder, named by its id.

use serde::{Deserialize, Serialize};
use std::fs;
use std::io::{self, Write};
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

/// The backend that runs a chat. A chat stays on one backend.
#[derive(Clone, Copy, Debug, PartialEq, Serialize, Deserialize)]
pub enum BackendId {
    #[serde(rename = "opencode-go")]
    OpencodeGo,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Chat {
    pub id: String,
    pub title: String,
    /// Milliseconds since the Unix epoch.
    pub created_at: u64,
    pub updated_at: u64,
    pub backend: BackendId,
    pub model: String,
    #[serde(default)]
    pub archived: bool,
    pub messages: Vec<Message>,
    #[serde(default)]
    pub usage: Usage,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(
    tag = "role",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum Message {
    User {
        text: String,
    },
    Assistant {
        text: String,
        /// The model's reasoning, sent back to models that need it with
        /// their tool calls. Not shown.
        #[serde(default, skip_serializing_if = "String::is_empty")]
        reasoning: String,
        #[serde(default, skip_serializing_if = "Vec::is_empty")]
        tool_calls: Vec<ToolCall>,
    },
    Tool {
        call_id: String,
        name: String,
        content: String,
        is_error: bool,
    },
    /// A line from the app, such as an error. Never sent to the model.
    Notice {
        level: NoticeLevel,
        text: String,
    },
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolCall {
    pub id: String,
    pub name: String,
    /// The JSON arguments, as the model wrote them.
    pub arguments: String,
}

#[derive(Clone, Copy, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum NoticeLevel {
    Info,
    Error,
}

/// Tokens used by the whole chat.
#[derive(Clone, Copy, Debug, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Usage {
    pub input_tokens: u64,
    pub output_tokens: u64,
}

pub fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |d| d.as_millis() as u64)
}

const TITLE_LENGTH: usize = 60;

impl Chat {
    pub fn new(backend: BackendId, model: &str) -> Self {
        let now = now_ms();
        Chat {
            id: uuid::Uuid::new_v4().to_string(),
            title: String::new(),
            created_at: now,
            updated_at: now,
            backend,
            model: model.to_string(),
            archived: false,
            messages: Vec::new(),
            usage: Usage::default(),
        }
    }

    pub fn push(&mut self, message: Message) {
        // Until wave 4 names chats, the first line of the first message does.
        if let (true, Message::User { text }) = (self.title.is_empty(), &message) {
            let line = text.lines().next().unwrap_or("").trim();
            self.title = line.chars().take(TITLE_LENGTH).collect();
        }
        self.messages.push(message);
        self.updated_at = now_ms();
    }
}

// Ids come from the webview, so only UUIDs name a file.
fn chat_file(dir: &Path, id: &str) -> io::Result<PathBuf> {
    uuid::Uuid::parse_str(id)
        .map(|uuid| dir.join(format!("{uuid}.json")))
        .map_err(|_| io::Error::new(io::ErrorKind::InvalidInput, "Not a chat id."))
}

/// Writes the chat to `<id>.json.tmp` and renames it over the old file, so a
/// failed write keeps the previous version. One turn runs at a time, so two
/// saves never share the temporary file.
pub fn save(dir: &Path, chat: &Chat) -> io::Result<()> {
    let file = chat_file(dir, &chat.id)?;
    fs::create_dir_all(dir)?;
    let text = serde_json::to_vec_pretty(chat).map_err(io::Error::other)?;
    // Two app instances saving the same chat at once is a known, accepted risk.
    let temp = file.with_extension("json.tmp");
    let result = fs::File::create(&temp)
        .and_then(|mut f| {
            owner_only(&f)?;
            f.write_all(&text)
        })
        .and_then(|()| fs::rename(&temp, &file));
    if result.is_err() {
        let _ = fs::remove_file(&temp);
    }
    result
}

// Chats are private. The mode is set on the open file, because a leftover
// temp file keeps the mode it was created with.
#[cfg(unix)]
fn owner_only(file: &fs::File) -> io::Result<()> {
    use std::os::unix::fs::PermissionsExt;
    file.set_permissions(fs::Permissions::from_mode(0o600))
}

#[cfg(not(unix))]
fn owner_only(_file: &fs::File) -> io::Result<()> {
    Ok(())
}

pub fn load(dir: &Path, id: &str) -> io::Result<Chat> {
    let text = fs::read_to_string(chat_file(dir, id)?)?;
    serde_json::from_str(&text).map_err(|e| io::Error::new(io::ErrorKind::InvalidData, e))
}

/// The most recently updated chat that is not archived. Files that can't be
/// read are skipped.
pub fn latest(dir: &Path) -> io::Result<Option<Chat>> {
    let entries = match fs::read_dir(dir) {
        Ok(entries) => entries,
        Err(e) if e.kind() == io::ErrorKind::NotFound => return Ok(None),
        Err(e) => return Err(e),
    };
    Ok(entries
        .filter_map(|entry| {
            let path = entry.ok()?.path();
            if path.extension()? != "json" {
                return None;
            }
            serde_json::from_str::<Chat>(&fs::read_to_string(path).ok()?).ok()
        })
        .filter(|chat| !chat.archived)
        .max_by_key(|chat| chat.updated_at))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn chat_with_everything() -> Chat {
        let mut chat = Chat::new(BackendId::OpencodeGo, "glm-5.3");
        chat.push(Message::User {
            text: "Roll for the ogre\nplease".into(),
        });
        chat.push(Message::Assistant {
            text: "Rolling.".into(),
            reasoning: "Needs a d20.".into(),
            tool_calls: vec![ToolCall {
                id: "call_1".into(),
                name: "dice_roll".into(),
                arguments: r#"{"notation":"1d20"}"#.into(),
            }],
        });
        chat.push(Message::Tool {
            call_id: "call_1".into(),
            name: "dice_roll".into(),
            content: "17".into(),
            is_error: false,
        });
        chat.push(Message::Notice {
            level: NoticeLevel::Error,
            text: "Rate limited.".into(),
        });
        chat.usage = Usage {
            input_tokens: 120,
            output_tokens: 30,
        };
        chat
    }

    #[test]
    fn a_saved_chat_loads_back_the_same() {
        let temp = tempfile::tempdir().unwrap();
        let dir = temp.path().join("chats");
        let chat = chat_with_everything();
        save(&dir, &chat).unwrap();
        assert_eq!(load(&dir, &chat.id).unwrap(), chat);
        assert_eq!(chat.title, "Roll for the ogre");
    }

    #[test]
    fn the_file_uses_the_documented_format() {
        let temp = tempfile::tempdir().unwrap();
        let chat = chat_with_everything();
        save(temp.path(), &chat).unwrap();
        let text = fs::read_to_string(temp.path().join(format!("{}.json", chat.id))).unwrap();
        let value: serde_json::Value = serde_json::from_str(&text).unwrap();
        assert_eq!(value["backend"], "opencode-go");
        assert_eq!(value["archived"], false);
        assert_eq!(
            value["usage"],
            serde_json::json!({ "inputTokens": 120, "outputTokens": 30 })
        );
        assert_eq!(
            value["messages"][1]["toolCalls"][0],
            serde_json::json!({ "id": "call_1", "name": "dice_roll", "arguments": "{\"notation\":\"1d20\"}" })
        );
        assert_eq!(
            value["messages"][2],
            serde_json::json!({ "role": "tool", "callId": "call_1", "name": "dice_roll", "content": "17", "isError": false })
        );
    }

    #[test]
    fn saving_again_replaces_the_file_and_leaves_no_temp_files() {
        let temp = tempfile::tempdir().unwrap();
        let mut chat = chat_with_everything();
        save(temp.path(), &chat).unwrap();
        chat.push(Message::User {
            text: "Again".into(),
        });
        save(temp.path(), &chat).unwrap();
        assert_eq!(load(temp.path(), &chat.id).unwrap(), chat);
        let names: Vec<_> = fs::read_dir(temp.path())
            .unwrap()
            .map(|e| e.unwrap().file_name().into_string().unwrap())
            .collect();
        assert_eq!(names, vec![format!("{}.json", chat.id)]);
    }

    #[test]
    fn a_failed_save_keeps_what_was_there_and_leaves_no_temp_file() {
        let temp = tempfile::tempdir().unwrap();
        let chat = chat_with_everything();
        // A folder that isn't empty, where the chat file goes, makes the
        // rename fail on every platform.
        let target = temp.path().join(format!("{}.json", chat.id));
        fs::create_dir(&target).unwrap();
        fs::write(target.join("keep.txt"), "kept").unwrap();

        assert!(save(temp.path(), &chat).is_err());

        assert_eq!(fs::read_to_string(target.join("keep.txt")).unwrap(), "kept");
        let names: Vec<_> = fs::read_dir(temp.path())
            .unwrap()
            .map(|e| e.unwrap().file_name().into_string().unwrap())
            .collect();
        assert_eq!(names, vec![format!("{}.json", chat.id)]);
    }

    #[test]
    fn a_failed_save_keeps_the_previous_chat_file_byte_for_byte() {
        let temp = tempfile::tempdir().unwrap();
        let mut chat = chat_with_everything();
        save(temp.path(), &chat).unwrap();
        let file = temp.path().join(format!("{}.json", chat.id));
        let before = fs::read(&file).unwrap();
        // A folder at the temporary path makes the new write fail.
        let blocker = temp.path().join(format!("{}.json.tmp", chat.id));
        fs::create_dir(&blocker).unwrap();
        fs::write(blocker.join("keep.txt"), "kept").unwrap();

        chat.push(Message::User {
            text: "A change that is not saved".into(),
        });
        assert!(save(temp.path(), &chat).is_err());

        assert_eq!(fs::read(&file).unwrap(), before);
        assert_eq!(
            fs::read_to_string(blocker.join("keep.txt")).unwrap(),
            "kept"
        );
    }

    #[cfg(unix)]
    #[test]
    fn a_saved_chat_is_owner_only_even_over_a_leftover_temp_file() {
        use std::os::unix::fs::PermissionsExt;
        let temp = tempfile::tempdir().unwrap();
        let chat = chat_with_everything();
        let leftover = temp.path().join(format!("{}.json.tmp", chat.id));
        fs::write(&leftover, "left by a crash").unwrap();
        fs::set_permissions(&leftover, fs::Permissions::from_mode(0o644)).unwrap();

        save(temp.path(), &chat).unwrap();

        let file = temp.path().join(format!("{}.json", chat.id));
        let mode = fs::metadata(&file).unwrap().permissions().mode() & 0o777;
        assert_eq!(mode, 0o600, "{mode:o}");
    }

    #[test]
    fn latest_skips_archived_and_unreadable_chats() {
        let temp = tempfile::tempdir().unwrap();
        assert_eq!(latest(&temp.path().join("none")).unwrap(), None);
        let mut old = chat_with_everything();
        old.updated_at = 1;
        let mut newer = chat_with_everything();
        newer.updated_at = 2;
        let mut archived = chat_with_everything();
        archived.updated_at = 3;
        archived.archived = true;
        for chat in [&old, &newer, &archived] {
            save(temp.path(), chat).unwrap();
        }
        fs::write(temp.path().join("broken.json"), "{").unwrap();
        assert_eq!(latest(temp.path()).unwrap(), Some(newer));
    }

    #[test]
    fn ids_that_are_not_uuids_are_refused() {
        let temp = tempfile::tempdir().unwrap();
        for id in ["../config", "x", ""] {
            assert!(load(temp.path(), id).is_err(), "{id}");
        }
        let mut chat = chat_with_everything();
        chat.id = "../escape".into();
        assert!(save(temp.path(), &chat).is_err());
    }
}
