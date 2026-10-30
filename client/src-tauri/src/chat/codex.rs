// A backend for Codex, through the `codex app-server` JSON-RPC protocol on
// stdio. One app server runs per app run, started on the first request.
//
// Each turn runs on a new ephemeral Codex thread: the chat file holds the
// history, so the thread gets it injected first. The agent's tools are
// dynamic tools that run in the webview, and Codex's own shell, file edit and
// web search tools are off or denied.

use super::agent::{ChatEvent, ToolOutput, Turn, TurnEnd, TurnHost, MAX_TOOL_CALLS, STOPPED};
use super::openai;
use super::store::{Chat, Message, NoticeLevel, ToolCall, Usage};
use serde::Serialize;
use serde_json::{json, Value};
use std::collections::HashMap;
use std::io;
use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tokio::io::{AsyncBufReadExt, AsyncRead, AsyncWrite, AsyncWriteExt, BufReader};
use tokio::sync::{mpsc, oneshot};
use tokio_util::sync::CancellationToken;

pub const LABEL: &str = "Codex";
pub const NOT_INSTALLED: &str = "Codex isn't installed. Install it, then run codex login.";
pub const SIGNED_OUT: &str = "Codex isn't signed in. Run codex login in a terminal.";
const CRASHED: &str = "Codex stopped unexpectedly. Send a message to start it again.";
const NOT_RUN_ENDED: &str = "Not run: the turn ended.";
const DENIED: &str = "The app does not allow Codex to run commands or edit files.";
/// How long the app server may take to answer a request outside a turn.
pub const REQUEST_TIMEOUT: Duration = Duration::from_secs(20);
/// How long a start that Stop left may take to name its turn.
pub const STOPPED_START_TIMEOUT: Duration = Duration::from_secs(10);

/// The app server's flags. Codex's own tools that could reach the user's
/// files or the web are off, and so are the user's hooks, plugins, apps and
/// MCP servers. What is left asks for approval, and every approval is denied.
/// The code-mode host stays on: Codex 0.166 calls dynamic tools through it.
/// Its JavaScript has no file, network or shell access.
pub fn launch_args() -> Vec<String> {
    let mut args = vec!["app-server".to_string()];
    for feature in [
        "shell_tool",
        "unified_exec",
        "view_image",
        "image_generation",
        "browser_use",
        "computer_use",
        "in_app_browser",
        "hooks",
        "apps",
        "plugins",
        "multi_agent",
        "goals",
        "skill_search",
        "tool_suggest",
        "sleep_tool",
    ] {
        args.extend(["--disable".to_string(), feature.to_string()]);
    }
    for config in [
        "web_search=\"disabled\"",
        "mcp_servers={}",
        "project_doc_max_bytes=0",
        "include_environment_context=false",
        "include_apps_instructions=false",
    ] {
        args.extend(["-c".to_string(), config.to_string()]);
    }
    args
}

pub type Input = Box<dyn AsyncWrite + Send + Unpin>;
pub type Output = Box<dyn AsyncRead + Send + Unpin>;

/// A running app server: its stdin, its stdout, and the process.
pub struct Pipes {
    pub input: Input,
    pub output: Output,
    pub child: Option<tokio::process::Child>,
}

/// Starts an app server. Tests start a fake one.
pub trait Launch: Send + Sync {
    fn launch(&self, cwd: &std::path::Path) -> io::Result<Pipes>;
}

/// Starts `codex app-server`.
pub struct CodexCommand;

// Apps started from the desktop may not have the user's shell PATH, so the
// usual install folders are searched too.
fn find_codex() -> Option<PathBuf> {
    let names: &[&str] = if cfg!(windows) {
        &["codex.exe", "codex.cmd"]
    } else {
        &["codex"]
    };
    let mut dirs: Vec<PathBuf> = std::env::var_os("PATH")
        .map(|path| std::env::split_paths(&path).collect())
        .unwrap_or_default();
    if let Some(home) = std::env::var_os("HOME") {
        let home = PathBuf::from(home);
        for dir in [".local/bin", ".npm-global/bin", ".bun/bin", ".cargo/bin"] {
            dirs.push(home.join(dir));
        }
    }
    dirs.extend(["/opt/homebrew/bin", "/usr/local/bin"].map(PathBuf::from));
    find_codex_in(&dirs, names)
}

/// The first of `names` in `dirs`. Relative and empty dirs are skipped:
/// Codex runs in another folder, where they would name another file.
pub fn find_codex_in(dirs: &[PathBuf], names: &[&str]) -> Option<PathBuf> {
    dirs.iter()
        .filter(|dir| dir.is_absolute())
        .flat_map(|dir| names.iter().map(move |name| dir.join(name)))
        .find(|path| path.is_file())
}

impl Launch for CodexCommand {
    fn launch(&self, cwd: &std::path::Path) -> io::Result<Pipes> {
        let program = find_codex().ok_or_else(|| io::Error::from(io::ErrorKind::NotFound))?;
        let mut command = tokio::process::Command::new(program);
        command
            .args(launch_args())
            .current_dir(cwd)
            .stdin(std::process::Stdio::piped())
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::null())
            .kill_on_drop(true);
        #[cfg(windows)]
        command.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
        let mut child = command.spawn()?;
        let input = child
            .stdin
            .take()
            .ok_or_else(|| io::Error::other("no stdin"))?;
        let output = child
            .stdout
            .take()
            .ok_or_else(|| io::Error::other("no stdout"))?;
        Ok(Pipes {
            input: Box::new(input),
            output: Box::new(output),
            child: Some(child),
        })
    }
}

/// A message from the app server that is not a response.
#[derive(Debug)]
pub enum Incoming {
    Notification {
        method: String,
        params: Value,
    },
    Request {
        id: Value,
        method: String,
        params: Value,
    },
}

// One app server process and the requests waiting on it.
struct Conn {
    input: tokio::sync::Mutex<Input>,
    next_id: AtomicU64,
    waiting: Mutex<HashMap<u64, oneshot::Sender<Result<Value, String>>>>,
    // The turn that receives notifications and server requests.
    listener: Mutex<Option<mpsc::UnboundedSender<Incoming>>>,
    // Cancelled when the process ends or the app closes it.
    ended: CancellationToken,
    child: Mutex<Option<tokio::process::Child>>,
}

impl Conn {
    async fn write(&self, message: Value) -> Result<(), String> {
        let mut line = message.to_string();
        line.push('\n');
        let mut input = self.input.lock().await;
        let written = async {
            input.write_all(line.as_bytes()).await?;
            input.flush().await
        };
        written.await.map_err(|_| CRASHED.to_string())
    }

    async fn request(&self, method: &str, params: Value) -> Result<Value, String> {
        let id = self.next_id.fetch_add(1, Ordering::Relaxed);
        let (sender, receiver) = oneshot::channel();
        self.waiting.lock().unwrap().insert(id, sender);
        if self.ended.is_cancelled() {
            self.waiting.lock().unwrap().remove(&id);
            return Err(CRASHED.to_string());
        }
        self.write(json!({ "id": id, "method": method, "params": params }))
            .await?;
        receiver.await.unwrap_or_else(|_| Err(CRASHED.to_string()))
    }

    // A request whose response nobody waits for.
    async fn send(&self, method: &str, params: Value) {
        let id = self.next_id.fetch_add(1, Ordering::Relaxed);
        let _ = self
            .write(json!({ "id": id, "method": method, "params": params }))
            .await;
    }

    async fn respond(&self, id: &Value, result: Result<Value, String>) {
        let message = match result {
            Ok(result) => json!({ "id": id, "result": result }),
            Err(message) => json!({ "id": id, "error": { "code": -32601, "message": message } }),
        };
        let _ = self.write(message).await;
    }

    fn listen(&self) -> mpsc::UnboundedReceiver<Incoming> {
        let (sender, receiver) = mpsc::unbounded_channel();
        // Under the lock, so a process that dies now still closes it.
        let mut listener = self.listener.lock().unwrap();
        if !self.ended.is_cancelled() {
            *listener = Some(sender);
        }
        receiver
    }

    fn stop_listening(&self) {
        *self.listener.lock().unwrap() = None;
    }

    // The process ended: every waiting request fails, and the turn's
    // listener closes.
    fn died(&self) {
        let mut listener = self.listener.lock().unwrap();
        self.ended.cancel();
        listener.take();
        drop(listener);
        for (_, sender) in self.waiting.lock().unwrap().drain() {
            let _ = sender.send(Err(CRASHED.to_string()));
        }
    }

    // Kills the process and ends the reader.
    fn close(&self) {
        if let Some(child) = self.child.lock().unwrap().as_mut() {
            let _ = child.start_kill();
        }
        self.died();
    }
}

// A connection that closes when dropped before it is ready: a failed or
// abandoned start leaves no process behind.
struct Starting(Option<Arc<Conn>>);

impl Drop for Starting {
    fn drop(&mut self) {
        if let Some(conn) = self.0.take() {
            conn.close();
        }
    }
}

/// The answer to a server request that no tool handles. Approvals are
/// denied; anything else is refused.
pub fn refusal(method: &str) -> Result<Value, String> {
    match method {
        "item/commandExecution/requestApproval" | "item/fileChange/requestApproval" => {
            Ok(json!({ "decision": "decline" }))
        }
        "execCommandApproval" | "applyPatchApproval" => {
            Ok(json!({ "decision": { "denied": { "rejection": DENIED } } }))
        }
        // Grants nothing.
        "item/permissions/requestApproval" => Ok(json!({ "permissions": {}, "scope": "turn" })),
        "mcpServer/elicitation/request" => {
            Ok(json!({ "action": "decline", "content": null, "_meta": null }))
        }
        "item/tool/call" => Ok(tool_response(NOT_RUN_ENDED, false)),
        _ => Err(format!("{method} is not supported by this app.")),
    }
}

fn tool_response(text: &str, success: bool) -> Value {
    json!({ "contentItems": [{ "type": "inputText", "text": text }], "success": success })
}

async fn read(conn: Arc<Conn>, output: Output) {
    let mut lines = BufReader::new(output).lines();
    loop {
        let line = tokio::select! {
            () = conn.ended.cancelled() => break,
            line = lines.next_line() => match line {
                Ok(Some(line)) => line,
                _ => break,
            },
        };
        let Ok(message) = serde_json::from_str::<Value>(&line) else {
            continue;
        };
        let method = message["method"].as_str().map(str::to_string);
        match (method, message.get("id")) {
            // A response to one of our requests.
            (None, Some(id)) => {
                let Some(sender) = id
                    .as_u64()
                    .and_then(|id| conn.waiting.lock().unwrap().remove(&id))
                else {
                    continue;
                };
                let result = match message.get("error") {
                    Some(error) => Err(error["message"]
                        .as_str()
                        .unwrap_or("Codex refused the request.")
                        .to_string()),
                    None => Ok(message["result"].clone()),
                };
                let _ = sender.send(result);
            }
            (Some(method), id) => {
                let params = message["params"].clone();
                let incoming = match id {
                    Some(id) => Incoming::Request {
                        id: id.clone(),
                        method,
                        params,
                    },
                    None => Incoming::Notification { method, params },
                };
                let unheard = {
                    let listener = conn.listener.lock().unwrap();
                    match listener.as_ref() {
                        Some(listener) => listener.send(incoming).err().map(|e| e.0),
                        None => Some(incoming),
                    }
                };
                if let Some(Incoming::Request { id, method, .. }) = unheard {
                    conn.respond(&id, refusal(&method)).await;
                }
            }
            (None, None) => {}
        }
    }
    conn.died();
}

pub enum ConnectError {
    NotInstalled,
    Failed(String),
}

impl ConnectError {
    pub fn message(&self) -> String {
        match self {
            ConnectError::NotInstalled => NOT_INSTALLED.to_string(),
            ConnectError::Failed(e) => format!("Couldn't start Codex: {e}"),
        }
    }
}

/// The shared app server. It starts on the first request and again after
/// it stops.
pub struct Codex {
    launcher: Box<dyn Launch>,
    // An empty folder for Codex to run in, away from the user's files.
    cwd: PathBuf,
    conn: tokio::sync::Mutex<Option<Arc<Conn>>>,
}

impl Codex {
    pub fn new(launcher: Box<dyn Launch>, cwd: PathBuf) -> Self {
        Codex {
            launcher,
            cwd,
            conn: tokio::sync::Mutex::new(None),
        }
    }

    async fn connection(&self) -> Result<Arc<Conn>, ConnectError> {
        let mut slot = self.conn.lock().await;
        if let Some(conn) = slot.as_ref().filter(|c| !c.ended.is_cancelled()) {
            return Ok(conn.clone());
        }
        *slot = None;
        std::fs::create_dir_all(&self.cwd).map_err(|e| ConnectError::Failed(e.to_string()))?;
        let pipes = self
            .launcher
            .launch(&self.cwd)
            .map_err(|e| match e.kind() {
                io::ErrorKind::NotFound => ConnectError::NotInstalled,
                _ => ConnectError::Failed(e.to_string()),
            })?;
        let conn = Arc::new(Conn {
            input: tokio::sync::Mutex::new(pipes.input),
            next_id: AtomicU64::new(1),
            waiting: Mutex::default(),
            listener: Mutex::default(),
            ended: CancellationToken::new(),
            child: Mutex::new(pipes.child),
        });
        tokio::spawn(read(conn.clone(), pipes.output));
        let mut starting = Starting(Some(conn.clone()));
        let initialize = conn.request(
            "initialize",
            json!({
                "clientInfo": {
                    "name": "ror-desktop",
                    "title": "Ror Desktop",
                    "version": env!("CARGO_PKG_VERSION"),
                },
                // Dynamic tools are an experimental field.
                "capabilities": { "experimentalApi": true, "requestAttestation": false },
            }),
        );
        match tokio::time::timeout(REQUEST_TIMEOUT, initialize).await {
            Ok(Ok(_)) => {}
            Ok(Err(e)) => return Err(ConnectError::Failed(e)),
            Err(_) => return Err(ConnectError::Failed("it did not answer.".to_string())),
        }
        conn.write(json!({ "method": "initialized" }))
            .await
            .map_err(ConnectError::Failed)?;
        starting.0 = None;
        *slot = Some(conn.clone());
        Ok(conn)
    }

    /// Ends the app server, when the app exits.
    pub fn shutdown(&self) {
        if let Ok(mut slot) = self.conn.try_lock() {
            if let Some(conn) = slot.take() {
                if let Some(child) = conn.child.lock().unwrap().as_mut() {
                    let _ = child.start_kill();
                }
            }
        }
    }

    /// Whether Codex can run, and its models.
    pub async fn status(&self) -> Status {
        let conn = match self.connection().await {
            Ok(conn) => conn,
            Err(ConnectError::NotInstalled) => return Status::NotInstalled,
            Err(e) => {
                return Status::Error {
                    message: e.message(),
                }
            }
        };
        let checked = async {
            let signed_in = signed_in(&conn).await?;
            let models = list_models(&conn).await?;
            Ok::<_, String>(if signed_in {
                Status::Ready { models }
            } else {
                Status::SignedOut { models }
            })
        };
        match tokio::time::timeout(REQUEST_TIMEOUT, checked).await {
            Ok(Ok(status)) => status,
            Ok(Err(message)) => Status::Error { message },
            Err(_) => Status::Error {
                message: "Codex took too long to list its models.".to_string(),
            },
        }
    }
}

/// What the model menu shows for Codex.
#[derive(Debug, PartialEq, Serialize)]
#[serde(tag = "state", rename_all = "camelCase")]
pub enum Status {
    Ready { models: Vec<String> },
    SignedOut { models: Vec<String> },
    NotInstalled,
    Error { message: String },
}

async fn signed_in(conn: &Conn) -> Result<bool, String> {
    let account = conn
        .request("account/read", json!({ "refreshToken": false }))
        .await?;
    Ok(!account["account"].is_null() || account["requiresOpenaiAuth"] == json!(false))
}

async fn list_models(conn: &Conn) -> Result<Vec<String>, String> {
    let mut models: Vec<String> = Vec::new();
    let mut cursor = Value::Null;
    loop {
        let page = conn
            .request("model/list", json!({ "cursor": cursor }))
            .await?;
        for model in page["data"].as_array().into_iter().flatten() {
            let name = model["model"].as_str().unwrap_or_default().to_string();
            if model["hidden"] != json!(true) && !name.is_empty() && !models.contains(&name) {
                models.push(name);
            }
        }
        cursor = page["nextCursor"].clone();
        if cursor.is_null() {
            return Ok(models);
        }
    }
}

/// A chat's way to Codex: the shared app server and the chat's model.
pub struct Session {
    pub codex: Arc<Codex>,
    pub model: String,
}

// The chat's messages as Responses API items, for `thread/inject_items`.
fn history_items(messages: &[Message]) -> Vec<Value> {
    let mut items = Vec::new();
    for message in messages {
        match message {
            Message::User { text } => items.push(json!({
                "type": "message", "role": "user",
                "content": [{ "type": "input_text", "text": text }],
            })),
            Message::Assistant {
                text, tool_calls, ..
            } => {
                if !text.is_empty() {
                    items.push(json!({
                        "type": "message", "role": "assistant",
                        "content": [{ "type": "output_text", "text": text }],
                    }));
                }
                for call in tool_calls {
                    items.push(json!({
                        "type": "function_call", "name": call.name,
                        "arguments": call.arguments, "call_id": call.id,
                    }));
                }
            }
            Message::Tool {
                call_id, content, ..
            } => items.push(json!({
                "type": "function_call_output", "call_id": call_id, "output": content,
            })),
            Message::Notice { .. } => {}
        }
    }
    items
}

// The `thread/start` request of an ephemeral thread.
fn thread_params(session: &Session, instructions: &str, tools: Value) -> Value {
    json!({
        "model": session.model,
        "cwd": session.codex.cwd,
        "approvalPolicy": "untrusted",
        "sandbox": "read-only",
        "baseInstructions": instructions,
        "ephemeral": true,
        "dynamicTools": tools,
    })
}

// Starts a thread with `thread` and `history`, then a turn with `text`, and
// returns their ids. A start that fails after the thread exists forgets it.
async fn begin(
    conn: Arc<Conn>,
    cancel: CancellationToken,
    thread: Value,
    history: Vec<Value>,
    text: String,
) -> Result<(String, String), String> {
    let started = conn.request("thread/start", thread).await?;
    let thread = started["thread"]["id"]
        .as_str()
        .ok_or("Codex started no thread.")?
        .to_string();
    let turn = async {
        if !history.is_empty() {
            conn.request(
                "thread/inject_items",
                json!({ "threadId": thread, "items": history }),
            )
            .await?;
        }
        // No turn for a stopped start.
        if cancel.is_cancelled() {
            return Err(STOPPED.to_string());
        }
        let turn = conn
            .request(
                "turn/start",
                json!({
                    "threadId": thread,
                    "input": [{ "type": "text", "text": text, "text_elements": [] }],
                }),
            )
            .await?;
        Ok(turn["turn"]["id"]
            .as_str()
            .ok_or("Codex started no turn.")?
            .to_string())
    }
    .await;
    match turn {
        Ok(turn) => Ok((thread, turn)),
        Err(e) => {
            end_thread(&conn, &thread, None).await;
            Err(e)
        }
    }
}

// Starts a thread and its turn, as `begin` does. None when Stop comes
// first: the start goes on, and the turn it starts is interrupted once
// Codex names it. When Codex does not answer in time, the app server ends,
// so a turn it never named can't keep running.
async fn start(
    conn: &Arc<Conn>,
    cancel: &CancellationToken,
    thread: Value,
    history: Vec<Value>,
    text: String,
) -> Option<Result<(String, String), String>> {
    let mut starting = tokio::spawn(begin(conn.clone(), cancel.clone(), thread, history, text));
    tokio::select! {
        biased;
        () = cancel.cancelled() => {
            let conn = conn.clone();
            tokio::spawn(async move {
                match tokio::time::timeout(STOPPED_START_TIMEOUT, &mut starting).await {
                    Ok(Ok(Ok((thread, turn)))) => end_thread(&conn, &thread, Some(&turn)).await,
                    Ok(_) => {}
                    // Closing fails the requests `begin` waits on, so it ends too.
                    Err(_) => {
                        conn.close();
                        let _ = conn.input.lock().await.shutdown().await;
                    }
                }
            });
            None
        }
        started = &mut starting => Some(started.unwrap_or_else(|e| Err(e.to_string()))),
    }
}

// Interrupts `turn` when it may still run, and lets the app server forget
// the ephemeral thread.
async fn end_thread(conn: &Conn, thread: &str, turn: Option<&str>) {
    if let Some(turn) = turn {
        conn.send(
            "turn/interrupt",
            json!({ "threadId": thread, "turnId": turn }),
        )
        .await;
    }
    conn.send("thread/unsubscribe", json!({ "threadId": thread }))
        .await;
}

// What a Codex turn sends while it runs, as the backend uses it.
enum Event {
    Delta(String),
    MessageStarted,
    ToolCall { id: Value, call: ToolCall },
    Usage(Usage),
    Error(String),
    Completed(Result<(), String>),
    // A request the backend answers itself, such as an approval.
    Refuse { id: Value, method: String },
}

// Reads one message of `thread`. Messages of other threads are dropped, and
// their requests refused.
async fn next_event(
    conn: &Conn,
    events: &mut mpsc::UnboundedReceiver<Incoming>,
    thread: &str,
) -> Option<Option<Event>> {
    let incoming = events.recv().await?;
    let (method, params, id) = match incoming {
        Incoming::Notification { method, params } => (method, params, None),
        Incoming::Request { id, method, params } => (method, params, Some(id)),
    };
    if params["threadId"].as_str() != Some(thread) {
        if let Some(id) = id {
            conn.respond(&id, refusal(&method)).await;
        }
        return Some(None);
    }
    if let Some(id) = id {
        if method == "item/tool/call" {
            let call = ToolCall {
                id: params["callId"].as_str().unwrap_or_default().to_string(),
                name: params["tool"].as_str().unwrap_or_default().to_string(),
                arguments: match &params["arguments"] {
                    Value::Null => "{}".to_string(),
                    arguments => arguments.to_string(),
                },
            };
            return Some(Some(Event::ToolCall { id, call }));
        }
        return Some(Some(Event::Refuse { id, method }));
    }
    Some(match method.as_str() {
        "item/agentMessage/delta" => params["delta"]
            .as_str()
            .map(|d| Event::Delta(d.to_string())),
        "item/started" if params["item"]["type"] == "agentMessage" => Some(Event::MessageStarted),
        "thread/tokenUsage/updated" => {
            let total = &params["tokenUsage"]["total"];
            Some(Event::Usage(Usage {
                input_tokens: total["inputTokens"].as_u64().unwrap_or(0),
                output_tokens: total["outputTokens"].as_u64().unwrap_or(0),
            }))
        }
        "error" if params["willRetry"] != json!(true) => params["error"]["message"]
            .as_str()
            .map(|m| Event::Error(m.to_string())),
        "turn/completed" => {
            let turn = &params["turn"];
            Some(Event::Completed(match turn["status"].as_str() {
                Some("completed") => Ok(()),
                Some("interrupted") => Err("Codex stopped the turn.".to_string()),
                _ => Err(turn["error"]["message"]
                    .as_str()
                    .unwrap_or("The turn failed.")
                    .to_string()),
            }))
        }
        _ => None,
    })
}

fn turn_tools(turn: &Turn) -> Value {
    turn.tools
        .iter()
        .map(|tool| {
            json!({
                "type": "function",
                "name": tool.name,
                "description": tool.description,
                "inputSchema": tool.input_schema,
            })
        })
        .collect()
}

// Why the turn ends: its end, and the notice it ends with.
type Ending = (TurnEnd, NoticeLevel, String);

fn stopped() -> Ending {
    (TurnEnd::Stopped, NoticeLevel::Info, STOPPED.to_string())
}

fn failed(message: String) -> Ending {
    (TurnEnd::Failed, NoticeLevel::Error, message)
}

pub async fn run_turn(session: &Session, turn: &mut Turn<'_>, host: &impl TurnHost) -> TurnEnd {
    let cancel = turn.cancel.clone();
    // A start that Stop drops closes its process.
    let connected = tokio::select! {
        biased;
        () = cancel.cancelled() => None,
        connected = session.codex.connection() => Some(connected),
    };
    let Some(connected) = connected else {
        turn.notice(host, NoticeLevel::Info, STOPPED);
        return TurnEnd::Stopped;
    };
    let conn = match connected {
        Ok(conn) => conn,
        Err(e) => {
            let message = e.message();
            turn.notice(host, NoticeLevel::Error, &message);
            host.emit(ChatEvent::Toast { message });
            return TurnEnd::Failed;
        }
    };
    let mut events = conn.listen();
    let mut usage = Usage::default();
    let mut text = String::new();
    let ending = drive(
        session,
        &conn,
        &mut events,
        turn,
        host,
        &mut usage,
        &mut text,
    )
    .await;
    conn.stop_listening();

    if usage.input_tokens + usage.output_tokens > 0 {
        turn.chat.usage.input_tokens += usage.input_tokens;
        turn.chat.usage.output_tokens += usage.output_tokens;
        host.emit(ChatEvent::Usage {
            usage: turn.chat.usage,
        });
    }
    if !text.is_empty() {
        turn.push(
            host,
            Message::Assistant {
                text,
                reasoning: String::new(),
                tool_calls: Vec::new(),
            },
        );
    }
    match ending {
        None => TurnEnd::Done,
        Some((end, level, message)) => {
            if end == TurnEnd::Failed && message == SIGNED_OUT {
                host.emit(ChatEvent::Toast {
                    message: message.clone(),
                });
            }
            turn.notice(host, level, &message);
            end
        }
    }
}

// How a tool call's wait ended.
enum Waited {
    Ran(ToolOutput),
    Stopped,
    // The app server ended.
    Ended,
}

// Runs the turn until it ends. Text that has not gone into a message yet is
// left in `text`.
async fn drive(
    session: &Session,
    conn: &Arc<Conn>,
    events: &mut mpsc::UnboundedReceiver<Incoming>,
    turn: &mut Turn<'_>,
    host: &impl TurnHost,
    usage: &mut Usage,
    text: &mut String,
) -> Option<Ending> {
    let cancel = turn.cancel.clone();
    // The new user message is the turn's input; the rest is history.
    let last_user = turn
        .chat
        .messages
        .iter()
        .rposition(|m| matches!(m, Message::User { .. }))
        .unwrap_or(0);
    let input = match turn.chat.messages.get(last_user) {
        Some(Message::User { text }) => text.clone(),
        _ => String::new(),
    };
    let history = history_items(&turn.chat.messages[..last_user]);
    let thread = thread_params(session, &turn.system, turn_tools(turn));
    let signed_in = tokio::select! {
        biased;
        () = cancel.cancelled() => return Some(stopped()),
        signed_in = signed_in(conn) => signed_in,
    };
    match signed_in {
        Ok(true) => {}
        Ok(false) => return Some(failed(SIGNED_OUT.to_string())),
        Err(e) => return Some(failed(e)),
    }
    let (thread, codex_turn) = match start(conn, &cancel, thread, history, input).await {
        None => return Some(stopped()),
        Some(Ok(ids)) => ids,
        Some(Err(e)) => return Some(failed(e)),
    };
    let interrupt = || {
        conn.send(
            "turn/interrupt",
            json!({ "threadId": thread, "turnId": codex_turn }),
        )
    };
    let mut calls_run = 0;
    let mut error = None;
    let ending = loop {
        let event = tokio::select! {
            biased;
            () = cancel.cancelled() => {
                interrupt().await;
                break Some(stopped());
            }
            event = next_event(conn, events, &thread) => event,
        };
        let Some(event) = event else {
            break Some(failed(CRASHED.to_string()));
        };
        match event {
            None => {}
            Some(Event::Delta(delta)) => {
                text.push_str(&delta);
                host.emit(ChatEvent::TextDelta { text: delta });
            }
            // Two messages in a row read as two paragraphs.
            Some(Event::MessageStarted) if !text.is_empty() => {
                text.push_str("\n\n");
                host.emit(ChatEvent::TextDelta {
                    text: "\n\n".to_string(),
                });
            }
            Some(Event::MessageStarted) => {}
            Some(Event::Usage(total)) => *usage = total,
            Some(Event::Error(message)) => error = Some(message),
            Some(Event::Refuse { id, method }) => conn.respond(&id, refusal(&method)).await,
            Some(Event::Completed(Ok(()))) => break None,
            Some(Event::Completed(Err(message))) => {
                break Some(failed(error.take().unwrap_or(message)))
            }
            Some(Event::ToolCall { id, call }) => {
                turn.push(
                    host,
                    Message::Assistant {
                        text: std::mem::take(text),
                        reasoning: String::new(),
                        tool_calls: vec![call.clone()],
                    },
                );
                if calls_run == MAX_TOOL_CALLS {
                    conn.respond(&id, Ok(tool_response(openai::NOT_RUN_LIMIT, false)))
                        .await;
                    turn.skip_calls(host, &[call], openai::NOT_RUN_LIMIT);
                    interrupt().await;
                    break Some((
                        TurnEnd::ToolLimit,
                        NoticeLevel::Info,
                        format!("Stopped after {MAX_TOOL_CALLS} tool calls in one turn. Send a message to continue."),
                    ));
                }
                let token = uuid::Uuid::new_v4().to_string();
                // Started before the event, so the result can't arrive first.
                let running = host.run_tool(&call, &token);
                host.emit(ChatEvent::ToolCall {
                    call: call.clone(),
                    token: token.clone(),
                });
                let output = tokio::select! {
                    biased;
                    () = cancel.cancelled() => Waited::Stopped,
                    // The call may wait at an approval card for long.
                    () = conn.ended.cancelled() => Waited::Ended,
                    output = running => Waited::Ran(output),
                };
                let output = match output {
                    Waited::Ran(output) => output,
                    Waited::Stopped => {
                        conn.respond(&id, Ok(tool_response(openai::NOT_RUN_STOPPED, false)))
                            .await;
                        turn.skip_calls(host, &[call], openai::NOT_RUN_STOPPED);
                        interrupt().await;
                        break Some(stopped());
                    }
                    Waited::Ended => {
                        turn.skip_calls(host, &[call], NOT_RUN_ENDED);
                        break Some(failed(CRASHED.to_string()));
                    }
                };
                calls_run += 1;
                conn.respond(&id, Ok(tool_response(&output.content, !output.is_error)))
                    .await;
                turn.push(
                    host,
                    Message::Tool {
                        call_id: call.id,
                        name: call.name,
                        content: output.content,
                        is_error: output.is_error,
                    },
                );
            }
        }
    };
    // The thread is ephemeral: the app server can forget it.
    conn.send("thread/unsubscribe", json!({ "threadId": thread }))
        .await;
    ending
}

/// Asks the chat's model for a short title for its first exchange, in one
/// turn without tools. Stop ends the title turn.
pub async fn title(
    session: &Session,
    chat: &Chat,
    cancel: &CancellationToken,
) -> Result<(String, Usage), String> {
    let connected = tokio::select! {
        biased;
        () = cancel.cancelled() => return Err(STOPPED.to_string()),
        connected = session.codex.connection() => connected,
    };
    let conn = connected.map_err(|e| e.message())?;
    let mut events = conn.listen();
    let result = async {
        let thread = thread_params(session, openai::TITLE_PROMPT, json!([]));
        let started = start(
            &conn,
            cancel,
            thread,
            Vec::new(),
            openai::title_exchange(chat),
        );
        let (thread, codex_turn) = started.await.unwrap_or(Err(STOPPED.to_string()))?;
        let mut text = String::new();
        let mut usage = Usage::default();
        loop {
            let event = tokio::select! {
                biased;
                () = cancel.cancelled() => {
                    end_thread(&conn, &thread, Some(&codex_turn)).await;
                    return Err(STOPPED.to_string());
                }
                event = next_event(&conn, &mut events, &thread) => event,
            };
            match event {
                None => return Err(CRASHED.to_string()),
                Some(Some(Event::Delta(delta))) => text.push_str(&delta),
                Some(Some(Event::Usage(total))) => usage = total,
                Some(Some(Event::Refuse { id, method })) => {
                    conn.respond(&id, refusal(&method)).await
                }
                Some(Some(Event::ToolCall { id, .. })) => {
                    conn.respond(&id, refusal("item/tool/call")).await
                }
                Some(Some(Event::Completed(done))) => {
                    end_thread(&conn, &thread, None).await;
                    done?;
                    let title = openai::clean_title(&text).ok_or("Codex sent no title.")?;
                    return Ok((title, usage));
                }
                Some(_) => {}
            }
        }
    }
    .await;
    conn.stop_listening();
    result
}
