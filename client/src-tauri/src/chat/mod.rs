// The chat panel's commands. Rust runs the agent loop and holds the keys.
// The webview owns the tools: each turn it sends their definitions, runs the
// calls the model makes through its permission gate, and returns the results.

pub mod agent;
pub mod codex;
pub mod openai;
pub mod store;

#[cfg(test)]
mod codex_schema;
#[cfg(test)]
mod codex_tests;
#[cfg(test)]
mod tests;

use crate::config::{self, PermissionMode};
use crate::secrets;
use agent::{Backend, ChatEvent, ToolOutput, ToolSpec, Turn, TurnEnd, TurnHost};
use serde::Serialize;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use store::{BackendId, Chat, Message, NoticeLevel, ToolCall};
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
    codex: Arc<codex::Codex>,
}

/// The HTTP client for providers and the web tools. Every request names the
/// app, as OpenCode Go asks.
pub fn http_client() -> reqwest::Client {
    reqwest::Client::builder()
        .user_agent(concat!("ror-desktop/", env!("CARGO_PKG_VERSION")))
        .build()
        .unwrap_or_default()
}

impl ChatState {
    #[cfg(test)]
    pub fn new() -> Self {
        Self::with_codex_dir(std::env::temp_dir().join("ror-desktop-codex"))
    }

    /// Codex runs in `dir`, an empty folder of the app's.
    pub fn with_codex_dir(dir: PathBuf) -> Self {
        ChatState {
            client: http_client(),
            turns: Mutex::default(),
            codex: Arc::new(codex::Codex::new(Box::new(codex::CodexCommand), dir)),
        }
    }

    /// Ends the Codex app server, when the app exits.
    pub fn shutdown(&self) {
        self.codex.shutdown();
    }

    pub fn client(&self) -> &reqwest::Client {
        &self.client
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
        if turn.pending.as_ref().is_none_or(|(t, _)| t != token) {
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

fn keys_file(app: &AppHandle) -> Result<PathBuf, String> {
    crate::keys_file(app).map_err(|e| e.to_string())
}

/// The key file entry of each backend's key. Codex uses `codex login`.
fn key_provider(backend: BackendId) -> Option<&'static str> {
    match backend {
        BackendId::OpencodeGo => Some("opencode-go"),
        BackendId::Codex => None,
    }
}

// Reads the key file off the main thread.
pub async fn key(app: &AppHandle, provider: &'static str) -> Result<Option<String>, String> {
    let file = keys_file(app)?;
    tauri::async_runtime::spawn_blocking(move || secrets::get(&file, provider))
        .await
        .map_err(|e| e.to_string())?
}

/// Where requests for `backend` go. `session` names the chat for OpenCode
/// Go, which alone gets the `x-opencode-session` header.
fn endpoint(
    client: &reqwest::Client,
    backend: BackendId,
    api_key: Option<String>,
    model: &str,
    session: Option<String>,
) -> Result<openai::Endpoint, String> {
    let (base_url, label, api_key, session) = match backend {
        BackendId::OpencodeGo => {
            let Some(api_key) = api_key else {
                return Err(format!(
                    "Add an {} key in Settings.",
                    openai::OPENCODE_GO_LABEL
                ));
            };
            let label = openai::OPENCODE_GO_LABEL.to_string();
            (openai::OPENCODE_GO_URL.to_string(), label, api_key, session)
        }
        BackendId::Codex => return Err(format!("{} has no endpoint.", codex::LABEL)),
    };
    Ok(openai::Endpoint {
        client: client.clone(),
        base_url,
        label,
        api_key,
        model: model.to_string(),
        session,
    })
}

async fn endpoint_for(
    app: &AppHandle,
    state: &ChatState,
    backend: BackendId,
    model: &str,
    session: Option<String>,
) -> Result<openai::Endpoint, String> {
    let api_key = match key_provider(backend) {
        Some(provider) => key(app, provider).await?,
        None => None,
    };
    endpoint(&state.client, backend, api_key, model, session)
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatSettings {
    model: Option<String>,
    backend: BackendId,
    permission_mode: PermissionMode,
}

#[tauri::command]
pub fn chat_settings(app: AppHandle) -> Result<ChatSettings, String> {
    let config = config::load(&config_file(&app)?);
    Ok(ChatSettings {
        model: config.chat_model,
        backend: config.chat_backend.unwrap_or(BackendId::OpencodeGo),
        permission_mode: config.permission_mode,
    })
}

#[tauri::command]
pub fn chat_set_model(app: AppHandle, backend: BackendId, model: String) -> Result<(), String> {
    config::update(&config_file(&app)?, |c| {
        c.chat_model = Some(model);
        c.chat_backend = Some(backend);
    })
    .map_err(|e| format!("Couldn't save the model: {e}."))
}

#[tauri::command]
pub fn chat_set_permission_mode(app: AppHandle, mode: PermissionMode) -> Result<(), String> {
    config::update(&config_file(&app)?, |c| c.permission_mode = mode)
        .map_err(|e| format!("Couldn't save the permission mode: {e}."))
}

/// Whether a key is saved for the provider. The key itself never leaves Rust.
#[tauri::command]
pub async fn key_saved(app: AppHandle, provider: String) -> Result<bool, String> {
    let file = keys_file(&app)?;
    tauri::async_runtime::spawn_blocking(move || {
        secrets::get(&file, &provider).map(|k| k.is_some())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn key_save(app: AppHandle, provider: String, key: String) -> Result<(), String> {
    let file = keys_file(&app)?;
    tauri::async_runtime::spawn_blocking(move || secrets::set(&file, &provider, &key))
        .await
        .map_err(|e| e.to_string())?
}

/// Deletes the provider's key from the key file.
#[tauri::command]
pub async fn key_remove(app: AppHandle, provider: String) -> Result<(), String> {
    let file = keys_file(&app)?;
    tauri::async_runtime::spawn_blocking(move || secrets::remove(&file, &provider))
        .await
        .map_err(|e| e.to_string())?
}

/// The ids of the models `backend` offers.
#[tauri::command]
pub async fn chat_models(
    app: AppHandle,
    state: State<'_, ChatState>,
    backend: BackendId,
) -> Result<Vec<String>, String> {
    if backend == BackendId::Codex {
        return match state.codex.status().await {
            codex::Status::Ready { models } => Ok(models),
            codex::Status::SignedOut { .. } => Err(codex::SIGNED_OUT.to_string()),
            codex::Status::NotInstalled => Err(codex::NOT_INSTALLED.to_string()),
            codex::Status::Error { message } => Err(message),
        };
    }
    let endpoint = endpoint_for(&app, &state, backend, "", None).await?;
    openai::list_models(&endpoint, openai::MODELS_TIMEOUT).await
}

/// Whether Codex is installed and signed in, and its models. Starts the
/// app server when it isn't running.
#[tauri::command]
pub async fn codex_status(state: State<'_, ChatState>) -> Result<codex::Status, String> {
    Ok(state.codex.status().await)
}

#[tauri::command]
pub fn chat_latest(app: AppHandle) -> Result<Option<Chat>, String> {
    store::latest(&chats_dir(&app)?).map_err(|e| format!("Couldn't read the saved chats: {e}."))
}

/// The archived chats, or the others, newest first, that match `query`.
#[tauri::command]
pub fn chat_list(
    app: AppHandle,
    archived: bool,
    query: String,
) -> Result<Vec<store::ChatSummary>, String> {
    store::list(&chats_dir(&app)?, archived, &query)
        .map_err(|e| format!("Couldn't read the saved chats: {e}."))
}

#[tauri::command]
pub fn chat_open(app: AppHandle, id: String) -> Result<Chat, String> {
    store::load(&chats_dir(&app)?, &id).map_err(|e| format!("Couldn't open the chat: {e}."))
}

#[tauri::command]
pub fn chat_rename(app: AppHandle, id: String, title: String) -> Result<(), String> {
    store::rename(&chats_dir(&app)?, &id, &title)
        .map_err(|e| format!("Couldn't rename the chat: {e}"))
}

#[tauri::command]
pub fn chat_set_archived(app: AppHandle, id: String, archived: bool) -> Result<(), String> {
    store::set_archived(&chats_dir(&app)?, &id, archived)
        .map_err(|e| format!("Couldn't save the chat: {e}."))
}

/// Removes the chat's file. The webview asks the user first.
#[tauri::command]
pub fn chat_delete(app: AppHandle, id: String) -> Result<(), String> {
    store::delete(&chats_dir(&app)?, &id).map_err(|e| format!("Couldn't delete the chat: {e}."))
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
    backend: BackendId,
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
        None => Chat::new(backend, &model),
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

    // Stop came before the turn began: no key file, no provider.
    let end = if turn.cancel.is_cancelled() {
        turn.notice(&host, NoticeLevel::Info, agent::STOPPED);
        TurnEnd::Stopped
    } else if backend != turn.chat.backend {
        // A chat stays on its backend.
        turn.notice(
            &host,
            NoticeLevel::Error,
            "This chat uses another provider. Start a new chat to use this one.",
        );
        TurnEnd::Failed
    } else if backend == BackendId::Codex {
        let session = codex::Session {
            codex: state.codex.clone(),
            model: model.clone(),
        };
        agent::answer(&Backend::Codex(session), &mut turn, &host).await
    } else {
        match endpoint_for(&app, &state, backend, &model, Some(turn.chat.id.clone())).await {
            Ok(endpoint) => agent::answer(&Backend::OpenAi(endpoint), &mut turn, &host).await,
            // A missing key or provider: the user must fix it in Settings.
            Err(message) => {
                turn.notice(&host, NoticeLevel::Error, &message);
                host.emit(ChatEvent::Toast { message });
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
