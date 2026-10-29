// The chat panel's commands. Rust runs the agent loop and holds the keys.
// The webview owns the tools: each turn it sends their definitions, runs the
// calls the model makes through its permission gate, and returns the results.

pub mod agent;
pub mod openai;
pub mod store;

#[cfg(test)]
mod tests;

use crate::config::{self, PermissionMode};
use crate::secrets;
use agent::{Backend, ChatEvent, ToolOutput, ToolSpec, Turn, TurnEnd, TurnHost};
use serde::Serialize;
use std::path::PathBuf;
use std::sync::Mutex;
use store::{Chat, Message, NoticeLevel, ToolCall};
use tauri::ipc::Channel;
use tauri::{AppHandle, Manager, State};
use tokio::sync::oneshot;
use tokio_util::sync::CancellationToken;

// The running turn. Its pending tool call is under the same lock, so a turn
// that ends can't clear the next turn's call.
struct ActiveTurn {
    // Made by the webview before it sends, so Stop can name the turn.
    id: String,
    cancel: CancellationToken,
    // The tool call the webview is running, by the token Rust gave it.
    pending: Option<(String, oneshot::Sender<ToolOutput>)>,
}

#[derive(Default)]
struct Turns {
    // One turn runs at a time.
    active: Option<ActiveTurn>,
    // A Stop that came before its turn began. Only the latest is kept.
    stopped_early: Option<String>,
}

pub struct ChatState {
    client: reqwest::Client,
    turns: Mutex<Turns>,
}

impl ChatState {
    pub fn new() -> Self {
        ChatState {
            // OpenCode Go asks each client to name itself.
            client: reqwest::Client::builder()
                .user_agent(concat!("ror-desktop/", env!("CARGO_PKG_VERSION")))
                .build()
                .unwrap_or_default(),
            turns: Mutex::default(),
        }
    }

    // Starts turn `id`. Its token is already cancelled when Stop for `id`
    // came first.
    fn begin_turn(&self, id: &str) -> Result<CancellationToken, String> {
        let mut turns = self.turns.lock().unwrap();
        if turns.active.is_some() {
            return Err("A reply is already running.".to_string());
        }
        let cancel = CancellationToken::new();
        if turns.stopped_early.as_deref() == Some(id) {
            turns.stopped_early = None;
            cancel.cancel();
        }
        turns.active = Some(ActiveTurn {
            id: id.to_string(),
            cancel: cancel.clone(),
            pending: None,
        });
        Ok(cancel)
    }

    // Ends turn `id`, with its pending call. Another turn is left alone.
    fn end_turn(&self, id: &str) {
        let mut turns = self.turns.lock().unwrap();
        if turns.active.as_ref().is_some_and(|t| t.id == id) {
            turns.active = None;
        }
    }

    // Waits for the result with `token`. When turn `id` is no longer
    // running, the result never comes.
    fn wait_for_tool(&self, id: &str, token: &str) -> oneshot::Receiver<ToolOutput> {
        let (sender, receiver) = oneshot::channel();
        let mut turns = self.turns.lock().unwrap();
        if let Some(turn) = turns.active.as_mut().filter(|t| t.id == id) {
            turn.pending = Some((token.to_string(), sender));
        }
        receiver
    }

    // Hands a result to the call waiting for `token`. A result for a call
    // that is no longer waiting, such as one from a stopped turn, is dropped.
    fn deliver(&self, token: &str, output: ToolOutput) -> bool {
        let mut turns = self.turns.lock().unwrap();
        let Some(turn) = turns.active.as_mut() else {
            return false;
        };
        if !turn.pending.as_ref().is_some_and(|(t, _)| t == token) {
            return false;
        }
        let (_, sender) = turn.pending.take().unwrap();
        sender.send(output).is_ok()
    }

    // Stops turn `id`. When it hasn't begun, it stops as it begins. A Stop
    // for another turn never touches the running one.
    fn stop(&self, id: &str) {
        let mut turns = self.turns.lock().unwrap();
        match turns.active.as_ref() {
            Some(turn) if turn.id == id => turn.cancel.cancel(),
            _ => turns.stopped_early = Some(id.to_string()),
        }
    }
}

fn chats_dir(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app
        .path()
        .app_config_dir()
        .map_err(|e| e.to_string())?
        .join("chats"))
}

fn config_file(app: &AppHandle) -> Result<PathBuf, String> {
    crate::config_file(app).map_err(|e| e.to_string())
}

const OPENCODE_GO: &str = "opencode-go";

// Reads the key off the main thread: the keychain may ask the user to unlock.
async fn key(provider: &'static str) -> Result<Option<String>, String> {
    tauri::async_runtime::spawn_blocking(move || secrets::get(provider))
        .await
        .map_err(|e| e.to_string())?
}

fn opencode_go(
    state: &ChatState,
    api_key: String,
    model: &str,
    session: Option<String>,
) -> openai::Endpoint {
    openai::Endpoint {
        client: state.client.clone(),
        base_url: openai::OPENCODE_GO_URL.to_string(),
        label: openai::OPENCODE_GO_LABEL,
        api_key,
        model: model.to_string(),
        session,
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatSettings {
    model: Option<String>,
    permission_mode: PermissionMode,
}

#[tauri::command]
pub fn chat_settings(app: AppHandle) -> Result<ChatSettings, String> {
    let config = config::load(&config_file(&app)?);
    Ok(ChatSettings {
        model: config.chat_model,
        permission_mode: config.permission_mode,
    })
}

#[tauri::command]
pub fn chat_set_model(app: AppHandle, model: String) -> Result<(), String> {
    config::update(&config_file(&app)?, |c| c.chat_model = Some(model))
        .map_err(|e| format!("Couldn't save the model: {e}."))
}

#[tauri::command]
pub fn chat_set_permission_mode(app: AppHandle, mode: PermissionMode) -> Result<(), String> {
    config::update(&config_file(&app)?, |c| c.permission_mode = mode)
        .map_err(|e| format!("Couldn't save the permission mode: {e}."))
}

/// Whether a key is saved for the provider. The key itself never leaves Rust.
#[tauri::command]
pub async fn key_saved(provider: String) -> Result<bool, String> {
    tauri::async_runtime::spawn_blocking(move || secrets::get(&provider).map(|k| k.is_some()))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn key_save(provider: String, key: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || secrets::set(&provider, &key))
        .await
        .map_err(|e| e.to_string())?
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelGroup {
    backend: store::BackendId,
    label: &'static str,
    models: Vec<String>,
}

#[tauri::command]
pub async fn chat_models(state: State<'_, ChatState>) -> Result<Vec<ModelGroup>, String> {
    let Some(api_key) = key(OPENCODE_GO).await? else {
        return Err(missing_key());
    };
    let endpoint = opencode_go(&state, api_key, "", None);
    Ok(vec![ModelGroup {
        backend: store::BackendId::OpencodeGo,
        label: openai::OPENCODE_GO_LABEL,
        models: openai::list_models(&endpoint).await?,
    }])
}

fn missing_key() -> String {
    format!(
        "Add an {} key in the model menu.",
        openai::OPENCODE_GO_LABEL
    )
}

#[tauri::command]
pub fn chat_latest(app: AppHandle) -> Result<Option<Chat>, String> {
    store::latest(&chats_dir(&app)?).map_err(|e| format!("Couldn't read the saved chats: {e}."))
}

struct TauriHost<'a> {
    channel: Channel<ChatEvent>,
    state: &'a ChatState,
    turn: &'a str,
    dir: PathBuf,
}

impl TurnHost for TauriHost<'_> {
    fn emit(&self, event: ChatEvent) {
        let _ = self.channel.send(event);
    }

    fn save(&self, chat: &Chat) {
        if let Err(e) = store::save(&self.dir, chat) {
            self.emit(ChatEvent::Toast {
                message: format!("Couldn't save the chat: {e}."),
            });
        }
    }

    fn run_tool(
        &self,
        _call: &ToolCall,
        token: &str,
    ) -> impl std::future::Future<Output = ToolOutput> + Send {
        let receiver = self.state.wait_for_tool(self.turn, token);
        async move {
            receiver.await.unwrap_or(ToolOutput {
                content: "The app dropped this tool call.".to_string(),
                is_error: true,
            })
        }
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TurnResult {
    chat_id: String,
    end: TurnEnd,
}

// Ends the turn however `chat_send` returns.
struct TurnGuard<'a>(&'a ChatState, &'a str);

impl Drop for TurnGuard<'_> {
    fn drop(&mut self) {
        self.0.end_turn(self.1);
    }
}

/// Runs one turn: adds the user's message to the chat (a new one when
/// `chat_id` is None), then streams the reply as events on `on_event`.
#[allow(clippy::too_many_arguments)]
#[tauri::command]
pub async fn chat_send(
    app: AppHandle,
    state: State<'_, ChatState>,
    turn_id: String,
    chat_id: Option<String>,
    text: String,
    model: String,
    system: String,
    tools: Vec<ToolSpec>,
    on_event: Channel<ChatEvent>,
) -> Result<TurnResult, String> {
    let dir = chats_dir(&app)?;
    let cancel = state.begin_turn(&turn_id)?;
    let _guard = TurnGuard(&state, &turn_id);

    let mut chat = match &chat_id {
        Some(id) => store::load(&dir, id).map_err(|e| format!("Couldn't open the chat: {e}."))?,
        None => Chat::new(store::BackendId::OpencodeGo, &model),
    };
    chat.model = model.clone();
    let host = TauriHost {
        channel: on_event,
        state: &state,
        turn: &turn_id,
        dir,
    };
    let mut turn = Turn {
        chat: &mut chat,
        system,
        tools,
        cancel,
    };
    turn.push(&host, Message::User { text });

    // Stop came before the turn began: no keychain, no provider.
    let end = if turn.cancel.is_cancelled() {
        turn.notice(&host, NoticeLevel::Info, agent::STOPPED);
        TurnEnd::Stopped
    } else {
        match key(OPENCODE_GO).await {
            Ok(Some(api_key)) => {
                let backend = Backend::OpenAi(opencode_go(
                    &state,
                    api_key,
                    &model,
                    Some(turn.chat.id.clone()),
                ));
                if backend.id() != turn.chat.backend {
                    turn.notice(&host, NoticeLevel::Error, "This chat uses another backend.");
                    TurnEnd::Failed
                } else {
                    backend.run_turn(&mut turn, &host).await
                }
            }
            Ok(None) => {
                let message = missing_key();
                turn.notice(&host, NoticeLevel::Error, &message);
                host.emit(ChatEvent::Toast { message });
                TurnEnd::Failed
            }
            Err(e) => {
                turn.notice(&host, NoticeLevel::Error, &e);
                TurnEnd::Failed
            }
        }
    };
    Ok(TurnResult {
        chat_id: chat.id,
        end,
    })
}

/// The result of a tool call, by the token of its `ToolCall` event.
#[tauri::command]
pub fn chat_tool_result(state: State<ChatState>, token: String, output: ToolOutput) {
    state.deliver(&token, output);
}

/// Stops turn `turn_id`, even when `chat_send` for it hasn't begun yet.
#[tauri::command]
pub fn chat_stop(state: State<ChatState>, turn_id: String) {
    state.stop(&turn_id);
}
