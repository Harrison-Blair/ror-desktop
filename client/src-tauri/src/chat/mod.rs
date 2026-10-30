// The chat panel's commands. Rust runs the agent loop and holds the keys.
// The webview owns the tools: each turn it sends their definitions, runs the
// calls the model makes through its permission gate, and returns the results.

pub mod agent;
pub mod openai;
pub mod store;

#[cfg(test)]
mod tests;

use crate::config::{self, CustomProvider, PermissionMode};
use crate::secrets;
use agent::{Backend, ChatEvent, ToolOutput, ToolSpec, Turn, TurnEnd, TurnHost};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::sync::Mutex;
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
    pub fn new() -> Self {
        ChatState {
            client: http_client(),
            turns: Mutex::default(),
        }
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

/// The keychain entry of each backend's key.
fn key_provider(backend: BackendId) -> &'static str {
    match backend {
        BackendId::OpencodeGo => "opencode-go",
        BackendId::Custom => "custom",
    }
}

// Reads the key off the main thread: the keychain may ask the user to unlock.
pub async fn key(provider: &'static str) -> Result<Option<String>, String> {
    tauri::async_runtime::spawn_blocking(move || secrets::get(provider))
        .await
        .map_err(|e| e.to_string())?
}

/// Where requests for `backend` go. `session` names the chat for OpenCode
/// Go, which alone gets the `x-opencode-session` header.
fn endpoint(
    client: &reqwest::Client,
    backend: BackendId,
    custom: Option<CustomProvider>,
    api_key: Option<String>,
    model: &str,
    session: Option<String>,
) -> Result<openai::Endpoint, String> {
    let (base_url, label, api_key, session) = match backend {
        BackendId::OpencodeGo => {
            let Some(api_key) = api_key else {
                return Err(format!(
                    "Add an {} key in the model menu.",
                    openai::OPENCODE_GO_LABEL
                ));
            };
            let label = openai::OPENCODE_GO_LABEL.to_string();
            (openai::OPENCODE_GO_URL.to_string(), label, api_key, session)
        }
        BackendId::Custom => {
            let Some(custom) = custom else {
                return Err("Add a custom provider in the model menu.".to_string());
            };
            (
                custom.base_url,
                custom.name,
                api_key.unwrap_or_default(),
                None,
            )
        }
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
    let custom = config::load(&config_file(app)?).custom_provider;
    let saved = key(key_provider(backend)).await?;
    let api_key = match backend {
        BackendId::OpencodeGo => saved,
        BackendId::Custom => custom.as_ref().and_then(|c| custom_key(saved, &c.base_url)),
    };
    endpoint(&state.client, backend, custom, api_key, model, session)
}

/// Checks a provider's base URL. Returns it without a trailing slash.
pub fn base_url(url: &str) -> Result<String, String> {
    let refused = || "Enter an http or https URL, such as http://localhost:11434/v1.".to_string();
    let url = url.trim().trim_end_matches('/');
    let parsed = reqwest::Url::parse(url).map_err(|_| refused())?;
    if !matches!(parsed.scheme(), "http" | "https") || parsed.host().is_none() {
        return Err(refused());
    }
    // The URL is saved in the config and shown in the menu: a key must not be.
    if !parsed.username().is_empty() || parsed.password().is_some() {
        return Err("Put the key in the API key field, not in the URL.".to_string());
    }
    // Paths such as /models are added to the end of the URL.
    if parsed.query().is_some() || parsed.fragment().is_some() {
        return Err(
            "Enter the base URL without a ? or # part, such as http://localhost:11434/v1."
                .to_string(),
        );
    }
    Ok(url.to_string())
}

// The custom provider's key is saved with the base URL it was given for, so
// it is never sent to another host, even after a failed save.
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CustomKey {
    base_url: String,
    key: String,
}

/// The saved custom key, when it was saved for `base_url`.
fn custom_key(saved: Option<String>, base_url: &str) -> Option<String> {
    let saved: CustomKey = serde_json::from_str(&saved?).ok()?;
    (saved.base_url == base_url).then_some(saved.key)
}

// Save and remove each change the keychain and then the config. One runs at
// a time, so their steps never interleave.
static CUSTOM: Mutex<()> = Mutex::new(());

// Runs between the keychain step and the config step, for tests.
#[cfg(test)]
thread_local! {
    pub static BETWEEN_STEPS: std::cell::RefCell<Option<Box<dyn FnMut()>>> =
        std::cell::RefCell::new(None);
}

fn between_steps() {
    #[cfg(test)]
    BETWEEN_STEPS.with_borrow_mut(|hook| {
        if let Some(hook) = hook {
            hook()
        }
    });
}

/// Saves the custom provider. An empty `key` keeps the saved key, which then
/// goes with the new URL. A new provider without a key keeps no old key.
pub fn save_custom(
    config_file: &Path,
    name: &str,
    base_url: &str,
    key: Option<String>,
) -> Result<CustomProvider, String> {
    let name = name.trim().to_string();
    if name.is_empty() {
        return Err("Enter a name.".to_string());
    }
    let provider = CustomProvider {
        name,
        base_url: self::base_url(base_url)?,
    };
    let _one_at_a_time = CUSTOM.lock().unwrap_or_else(|e| e.into_inner());
    let old = secrets::get("custom")?;
    let key = key
        .map(|k| k.trim().to_string())
        .filter(|k| !k.is_empty())
        .or_else(|| {
            let editing = config::load(config_file).custom_provider?;
            custom_key(old.clone(), &editing.base_url)
        });
    // The key changes first. If the config then can't change, the old key
    // goes back. Should that fail too, the new key stays bound to the new
    // URL, so it is not sent to the old provider.
    match key {
        Some(key) => {
            let bound = CustomKey {
                base_url: provider.base_url.clone(),
                key,
            };
            secrets::set("custom", &serde_json::to_string(&bound).unwrap_or_default())?;
        }
        None => secrets::remove("custom")?,
    }
    between_steps();
    let saved = provider.clone();
    if let Err(e) = config::update(config_file, |c| c.custom_provider = Some(saved)) {
        let rollback = match old {
            Some(old) => secrets::set("custom", &old),
            None => secrets::remove("custom"),
        };
        // The key left behind is bound to the new URL. Saving the provider
        // again, or Remove, replaces or deletes it.
        return Err(match rollback {
            Ok(()) => format!("Couldn't save the provider: {e}."),
            Err(r) => format!(
                "Couldn't save the provider: {e}. Its key also couldn't be put back ({r}). Save the provider again, or remove it to delete the key."
            ),
        });
    }
    Ok(provider)
}

/// Removes the custom provider: its key, then its name and URL. If the
/// config can't change, the provider stays without a key and Remove can run
/// again.
pub fn remove_custom(config_file: &Path) -> Result<(), String> {
    let _one_at_a_time = CUSTOM.lock().unwrap_or_else(|e| e.into_inner());
    secrets::remove("custom")?;
    between_steps();
    config::update(config_file, |c| {
        c.custom_provider = None;
        if c.chat_backend == Some(BackendId::Custom) {
            c.chat_model = None;
            c.chat_backend = None;
        }
    })
    .map_err(|e| format!("Couldn't remove the provider: {e}. Its key was removed."))
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatSettings {
    model: Option<String>,
    backend: BackendId,
    permission_mode: PermissionMode,
    custom_provider: Option<CustomProvider>,
}

#[tauri::command]
pub fn chat_settings(app: AppHandle) -> Result<ChatSettings, String> {
    let config = config::load(&config_file(&app)?);
    Ok(ChatSettings {
        model: config.chat_model,
        backend: config.chat_backend.unwrap_or(BackendId::OpencodeGo),
        permission_mode: config.permission_mode,
        custom_provider: config.custom_provider,
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

/// Saves the custom provider. An empty `key` keeps the saved key.
#[tauri::command]
pub async fn custom_provider_save(
    app: AppHandle,
    name: String,
    base_url: String,
    key: Option<String>,
) -> Result<CustomProvider, String> {
    let file = config_file(&app)?;
    tauri::async_runtime::spawn_blocking(move || save_custom(&file, &name, &base_url, key))
        .await
        .map_err(|e| e.to_string())?
}

/// Removes the custom provider: its name, URL and key.
#[tauri::command]
pub async fn custom_provider_remove(app: AppHandle) -> Result<(), String> {
    let file = config_file(&app)?;
    tauri::async_runtime::spawn_blocking(move || remove_custom(&file))
        .await
        .map_err(|e| e.to_string())?
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
    if provider == "custom" {
        return Err("Save the custom provider's key in its form.".to_string());
    }
    tauri::async_runtime::spawn_blocking(move || secrets::set(&provider, &key))
        .await
        .map_err(|e| e.to_string())?
}

/// Deletes the provider's key from the keychain.
#[tauri::command]
pub async fn key_remove(provider: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || secrets::remove(&provider))
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
    let endpoint = endpoint_for(&app, &state, backend, "", None).await?;
    openai::list_models(&endpoint, openai::MODELS_TIMEOUT).await
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

    // Stop came before the turn began: no keychain, no provider.
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
    } else {
        match endpoint_for(&app, &state, backend, &model, Some(turn.chat.id.clone())).await {
            Ok(endpoint) => Backend::OpenAi(endpoint).run_turn(&mut turn, &host).await,
            // A missing key or provider: the user must fix it in the model menu.
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
