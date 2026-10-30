// Runs Codex turns against a fake app server in the test process. The fake
// speaks the JSON-RPC shapes of `codex app-server` 0.166.0
// (`codex app-server generate-json-schema --experimental`).

use super::agent::{self, Backend, ChatEvent, ToolOutput, ToolSpec, Turn, TurnEnd, TurnHost};
use super::codex::{self, Codex, Launch, Pipes, Session, Status};
use super::codex_schema;
use super::openai;
use super::store::{BackendId, Chat, Message, NoticeLevel, ToolCall};
use serde_json::{json, Value};
use std::collections::VecDeque;
use std::future::Future;
use std::io;
use std::path::Path;
use std::pin::Pin;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};
use tokio::io::{
    AsyncBufReadExt, AsyncWriteExt, BufReader, DuplexStream, Lines, ReadHalf, WriteHalf,
};
use tokio_util::sync::CancellationToken;

const THREAD: &str = "01a18a4e-1a86-77b3-b77c-267121004cee";
const TURN: &str = "01a18a4e-1ace-7e03-9aae-2f3dcff39850";
const SYSTEM: &str = "You help with a campaign. The open note is Goblins.md.";

// The schema of the result of each request, by method.
fn result_schema(method: &str) -> &'static str {
    match method {
        "initialize" => "InitializeResponse",
        "account/read" => "v2/GetAccountResponse",
        "model/list" => "v2/ModelListResponse",
        "thread/start" => "v2/ThreadStartResponse",
        "thread/inject_items" => "v2/ThreadInjectItemsResponse",
        "turn/start" => "v2/TurnStartResponse",
        "item/commandExecution/requestApproval" => "CommandExecutionRequestApprovalResponse",
        "item/fileChange/requestApproval" => "FileChangeRequestApprovalResponse",
        "execCommandApproval" => "ExecCommandApprovalResponse",
        "applyPatchApproval" => "ApplyPatchApprovalResponse",
        "item/permissions/requestApproval" => "PermissionsRequestApprovalResponse",
        "item/tool/call" => "DynamicToolCallResponse",
        _ => panic!("no result schema for {method}"),
    }
}

// Messages that did not match the schema. The fake runs in its own task,
// where a panic alone would not fail the test.
type Mismatches = Arc<Mutex<Vec<String>>>;

// The answer to `thread/start`.
fn thread_started(request: &Value) -> Value {
    let cwd = request["params"]["cwd"].clone();
    json!({
        "approvalPolicy": "untrusted", "approvalsReviewer": "user", "cwd": cwd,
        "model": request["params"]["model"], "modelProvider": "openai",
        "sandbox": { "type": "readOnly" },
        "thread": {
            "cliVersion": "0.166.0", "createdAt": 1793323793, "cwd": cwd, "ephemeral": true,
            "id": THREAD, "modelProvider": "openai", "preview": "", "projectId": null,
            "sessionId": THREAD, "source": "appServer", "status": { "type": "idle" },
            "turns": [], "updatedAt": 1793323793,
        },
    })
}

fn turn_started() -> Value {
    json!({ "turn": { "id": TURN, "items": [], "status": "inProgress", "error": null } })
}

/// The app server's side of the pipes.
struct Peer {
    lines: Lines<BufReader<ReadHalf<DuplexStream>>>,
    out: WriteHalf<DuplexStream>,
    mismatches: Mismatches,
}

impl Peer {
    // Every message between the app and the fake must match the schema.
    fn check(&self, name: &str, message: &Value) {
        if let Err(e) = codex_schema::check(name, message) {
            let mismatch = format!("{name} does not match the schema: {e}\n{message}");
            self.mismatches.lock().unwrap().push(mismatch.clone());
            panic!("{mismatch}");
        }
    }

    // The next message from the app. None when the app closed the pipe.
    async fn next(&mut self) -> Option<Value> {
        let line = self.lines.next_line().await.ok()??;
        let message: Value = serde_json::from_str(&line).unwrap();
        match (message.get("method"), message.get("id")) {
            (Some(_), Some(_)) => self.check("ClientRequest", &message),
            (Some(_), None) => self.check("ClientNotification", &message),
            // A response: `ask` checks it.
            _ => {}
        }
        Some(message)
    }

    // The next message, which must be `method`.
    async fn expect(&mut self, method: &str) -> Value {
        let message = self.next().await.expect("the app closed the pipe");
        assert_eq!(message["method"], method, "got {message}");
        message
    }

    async fn write(&mut self, message: Value) {
        match (message.get("method"), message.get("id")) {
            (Some(_), Some(_)) => self.check("ServerRequest", &message),
            (Some(_), None) => self.check("ServerNotification", &message),
            // A response: `reply` checks it.
            _ => {}
        }
        let mut line = message.to_string();
        line.push('\n');
        self.out.write_all(line.as_bytes()).await.unwrap();
    }

    async fn reply(&mut self, request: &Value, result: Value) {
        self.check(result_schema(request["method"].as_str().unwrap()), &result);
        self.write(json!({ "id": request["id"], "result": result }))
            .await;
    }

    async fn notify(&mut self, method: &str, params: Value) {
        self.write(json!({ "method": method, "params": params }))
            .await;
    }

    // Sends a server request and returns the app's response to it.
    async fn ask(&mut self, id: u64, method: &str, params: Value) -> Value {
        self.write(json!({ "id": id, "method": method, "params": params }))
            .await;
        let response = self.next().await.expect("the app closed the pipe");
        assert_eq!(response["id"], id, "got {response}");
        assert!(response.get("method").is_none());
        self.check(result_schema(method), &response["result"]);
        response
    }

    async fn handshake(&mut self) {
        let initialize = self.expect("initialize").await;
        assert_eq!(initialize["params"]["clientInfo"]["name"], "ror-desktop");
        assert_eq!(
            initialize["params"]["capabilities"]["experimentalApi"],
            true
        );
        self.reply(
            &initialize,
            json!({ "userAgent": "ror-desktop/0.166.0", "codexHome": "/home/u/.codex",
                    "platformFamily": "unix", "platformOs": "linux" }),
        )
        .await;
        let initialized = self.expect("initialized").await;
        assert!(initialized.get("id").is_none());
    }

    async fn account(&mut self, signed_in: bool) {
        let read = self.expect("account/read").await;
        let account = if signed_in {
            json!({ "type": "chatgpt", "email": null, "planType": "plus", "workspaceName": null })
        } else {
            Value::Null
        };
        self.reply(
            &read,
            json!({ "account": account, "requiresOpenaiAuth": true, "workspaceRouting": null }),
        )
        .await;
    }

    // Answers the start of a turn. Returns thread/start, thread/inject_items
    // (when the chat has history) and turn/start.
    async fn begin(&mut self, history: bool) -> (Value, Option<Value>, Value) {
        self.account(true).await;
        let thread = self.expect("thread/start").await;
        self.reply(&thread, thread_started(&thread)).await;
        let inject = if history {
            let inject = self.expect("thread/inject_items").await;
            self.reply(&inject, json!({})).await;
            Some(inject)
        } else {
            None
        };
        let turn = self.expect("turn/start").await;
        self.reply(&turn, turn_started()).await;
        (thread, inject, turn)
    }

    async fn message_started(&mut self, id: &str) {
        self.notify(
            "item/started",
            json!({ "threadId": THREAD, "turnId": TURN, "startedAtMs": 0,
                    "item": { "type": "agentMessage", "id": id, "text": "", "phase": null } }),
        )
        .await;
    }

    async fn delta(&mut self, id: &str, text: &str) {
        self.notify(
            "item/agentMessage/delta",
            json!({ "threadId": THREAD, "turnId": TURN, "itemId": id, "delta": text }),
        )
        .await;
    }

    async fn usage(&mut self, input: u64, output: u64) {
        let breakdown = |input: u64, output: u64| {
            json!({ "totalTokens": input + output, "inputTokens": input, "cachedInputTokens": 0,
                    "cacheWriteInputTokens": 0, "outputTokens": output, "reasoningOutputTokens": 0 })
        };
        self.notify(
            "thread/tokenUsage/updated",
            json!({ "threadId": THREAD, "turnId": TURN, "tokenUsage": {
                "total": breakdown(input, output), "last": breakdown(1, 1), "modelContextWindow": 258400 } }),
        )
        .await;
    }

    async fn completed(&mut self, status: &str, error: Value) {
        self.notify(
            "turn/completed",
            json!({ "threadId": THREAD, "turn": {
                "id": TURN, "items": [], "status": status, "error": error } }),
        )
        .await;
    }

    async fn tool_call(&mut self, id: u64, call_id: &str) -> Value {
        self.ask(
            id,
            "item/tool/call",
            json!({ "threadId": THREAD, "turnId": TURN, "callId": call_id, "namespace": null,
                    "tool": "dice_roll", "arguments": { "notation": "1d20" } }),
        )
        .await
    }

    // Keeps the app server running after the script.
    async fn hold(self) {
        std::future::pending::<()>().await;
    }
}

type Script = Box<dyn FnOnce(Peer) -> Pin<Box<dyn Future<Output = ()> + Send>> + Send>;

#[derive(Default)]
struct Fake {
    // One script per launch, in order. With none left, Codex "isn't installed".
    scripts: Mutex<VecDeque<Script>>,
    launches: AtomicUsize,
    mismatches: Mismatches,
}

impl Drop for Fake {
    fn drop(&mut self) {
        if !std::thread::panicking() {
            assert_eq!(*self.mismatches.lock().unwrap(), Vec::<String>::new());
        }
    }
}

struct FakeLaunch(Arc<Fake>);

impl Launch for FakeLaunch {
    fn launch(&self, _cwd: &Path) -> io::Result<Pipes> {
        let script = self.0.scripts.lock().unwrap().pop_front();
        let script = script.ok_or_else(|| io::Error::from(io::ErrorKind::NotFound))?;
        self.0.launches.fetch_add(1, Ordering::SeqCst);
        let (app, server) = tokio::io::duplex(1 << 16);
        let (app_output, app_input) = tokio::io::split(app);
        let (server_input, server_output) = tokio::io::split(server);
        tokio::spawn(script(Peer {
            lines: BufReader::new(server_input).lines(),
            out: server_output,
            mismatches: self.0.mismatches.clone(),
        }));
        Ok(Pipes {
            input: Box::new(app_input),
            output: Box::new(app_output),
            child: None,
        })
    }
}

fn script<F, Fut>(f: F) -> Script
where
    F: FnOnce(Peer) -> Fut + Send + 'static,
    Fut: Future<Output = ()> + Send + 'static,
{
    Box::new(move |peer| Box::pin(f(peer)))
}

fn codex(scripts: Vec<Script>) -> (Arc<Codex>, Arc<Fake>) {
    let fake = Arc::new(Fake {
        scripts: Mutex::new(scripts.into()),
        launches: AtomicUsize::new(0),
        mismatches: Mismatches::default(),
    });
    let dir = std::env::temp_dir().join("ror-desktop-codex-tests");
    (
        Arc::new(Codex::new(Box::new(FakeLaunch(fake.clone())), dir)),
        fake,
    )
}

#[derive(Default)]
struct Host {
    events: Mutex<Vec<ChatEvent>>,
    // Each call the host ran, with the token it was given.
    runs: Mutex<Vec<(ToolCall, String)>>,
    saved: Mutex<Option<Chat>>,
    // When set, a tool call presses Stop and never finishes.
    stop_on_tool: Option<CancellationToken>,
    // A tool call that never finishes, like one at an approval card.
    tool_waits: bool,
}

impl TurnHost for Host {
    fn emit(&self, event: ChatEvent) {
        self.events.lock().unwrap().push(event);
    }

    fn save(&self, chat: &Chat) {
        *self.saved.lock().unwrap() = Some(chat.clone());
    }

    fn run_tool(&self, call: &ToolCall, token: &str) -> impl Future<Output = ToolOutput> + Send {
        self.runs
            .lock()
            .unwrap()
            .push((call.clone(), token.to_string()));
        let output = ToolOutput {
            content: format!("{} ran with {}", call.name, call.arguments),
            is_error: false,
        };
        let stop = self.stop_on_tool.clone();
        let waits = self.tool_waits;
        async move {
            if waits {
                std::future::pending::<()>().await;
            }
            if let Some(stop) = stop {
                stop.cancel();
                std::future::pending::<()>().await;
            }
            output
        }
    }
}

impl Host {
    fn streamed_text(&self) -> String {
        self.events
            .lock()
            .unwrap()
            .iter()
            .filter_map(|e| match e {
                ChatEvent::TextDelta { text } => Some(text.as_str()),
                _ => None,
            })
            .collect()
    }

    fn toasts(&self) -> Vec<String> {
        self.events
            .lock()
            .unwrap()
            .iter()
            .filter_map(|e| match e {
                ChatEvent::Toast { message } => Some(message.clone()),
                _ => None,
            })
            .collect()
    }
}

fn roll_tool() -> ToolSpec {
    ToolSpec {
        name: "dice_roll".into(),
        description: "Rolls dice.".into(),
        input_schema: json!({ "type": "object", "properties": { "notation": { "type": "string" } } }),
    }
}

fn new_chat(text: &str) -> Chat {
    let mut chat = Chat::new(BackendId::Codex, "gpt-5.6-terra");
    chat.push(Message::User { text: text.into() });
    chat
}

// A turn that waits on a fake that waits on it fails the test, not hangs it.
async fn within<T>(turn: impl Future<Output = T>) -> T {
    tokio::time::timeout(std::time::Duration::from_secs(5), turn)
        .await
        .expect("the turn did not end")
}

async fn run(
    codex: &Arc<Codex>,
    chat: &mut Chat,
    host: &Host,
    cancel: CancellationToken,
) -> TurnEnd {
    let backend = Backend::Codex(Session {
        codex: codex.clone(),
        model: "gpt-5.6-terra".into(),
    });
    let mut turn = Turn {
        chat,
        system: SYSTEM.into(),
        tools: vec![roll_tool()],
        cancel,
    };
    within(backend.run_turn(&mut turn, host)).await
}

fn assistant(text: &str, calls: Vec<ToolCall>) -> Message {
    Message::Assistant {
        text: text.into(),
        reasoning: String::new(),
        tool_calls: calls,
    }
}

fn roll_call(id: &str) -> ToolCall {
    ToolCall {
        id: id.into(),
        name: "dice_roll".into(),
        arguments: r#"{"notation":"1d20"}"#.into(),
    }
}

// Waits until the fake has recorded `count` messages: it records them after
// the turn may have ended.
async fn recorded(seen: &Arc<Mutex<Vec<Value>>>, count: usize) -> Vec<Value> {
    for _ in 0..200 {
        if seen.lock().unwrap().len() >= count {
            break;
        }
        tokio::time::sleep(std::time::Duration::from_millis(5)).await;
    }
    let seen = seen.lock().unwrap().clone();
    assert_eq!(seen.len(), count, "the fake recorded {seen:?}");
    seen
}

#[tokio::test]
async fn a_codex_turn_streams_text_into_the_chat_with_its_history_injected() {
    let seen = Arc::new(Mutex::new(Vec::new()));
    let record = seen.clone();
    let (codex, _) = codex(vec![script(move |mut peer| async move {
        peer.handshake().await;
        let (thread, inject, turn) = peer.begin(true).await;
        peer.message_started("m1").await;
        peer.delta("m1", "Three ").await;
        peer.delta("m1", "goblins.").await;
        peer.message_started("m2").await;
        peer.delta("m2", "Roll initiative.").await;
        peer.usage(120, 30).await;
        peer.usage(250, 45).await;
        peer.completed("completed", Value::Null).await;
        record
            .lock()
            .unwrap()
            .extend([thread, inject.unwrap(), turn]);
        peer.hold().await;
    })]);
    let mut chat = new_chat("Who is in the lair?");
    chat.push(assistant("A dragon.", vec![roll_call("call_0")]));
    chat.push(Message::Tool {
        call_id: "call_0".into(),
        name: "dice_roll".into(),
        content: "17".into(),
        is_error: false,
    });
    chat.push(Message::Notice {
        level: NoticeLevel::Info,
        text: "Stopped.".into(),
    });
    chat.push(Message::User {
        text: "And the goblins?".into(),
    });
    chat.usage.input_tokens = 1000;
    let host = Host::default();

    let end = run(&codex, &mut chat, &host, CancellationToken::new()).await;

    assert_eq!(end, TurnEnd::Done);
    assert_eq!(host.streamed_text(), "Three goblins.\n\nRoll initiative.");
    assert_eq!(
        chat.messages.last(),
        Some(&assistant("Three goblins.\n\nRoll initiative.", vec![]))
    );
    assert_eq!(host.saved.lock().unwrap().as_ref(), Some(&chat));
    // The last total of the thread is the turn's usage.
    assert_eq!(chat.usage.input_tokens, 1250);
    assert_eq!(chat.usage.output_tokens, 45);

    let seen = recorded(&seen, 3).await;
    let thread = &seen[0]["params"];
    assert_eq!(thread["model"], "gpt-5.6-terra");
    assert_eq!(thread["sandbox"], "read-only");
    assert_eq!(thread["approvalPolicy"], "untrusted");
    assert_eq!(thread["ephemeral"], true);
    assert_eq!(thread["baseInstructions"], SYSTEM);
    assert_eq!(
        thread["dynamicTools"],
        json!([{ "type": "function", "name": "dice_roll", "description": "Rolls dice.",
                 "inputSchema": { "type": "object", "properties": { "notation": { "type": "string" } } } }])
    );
    // Everything before the new message, without the notice.
    assert_eq!(
        seen[1]["params"],
        json!({ "threadId": THREAD, "items": [
            { "type": "message", "role": "user", "content": [{ "type": "input_text", "text": "Who is in the lair?" }] },
            { "type": "message", "role": "assistant", "content": [{ "type": "output_text", "text": "A dragon." }] },
            { "type": "function_call", "name": "dice_roll", "arguments": r#"{"notation":"1d20"}"#, "call_id": "call_0" },
            { "type": "function_call_output", "call_id": "call_0", "output": "17" },
        ] })
    );
    assert_eq!(
        seen[2]["params"],
        json!({ "threadId": THREAD, "input": [{ "type": "text", "text": "And the goblins?", "text_elements": [] }] })
    );
}

#[tokio::test]
async fn a_codex_tool_call_runs_through_the_host_and_its_result_goes_back() {
    let responses = Arc::new(Mutex::new(Vec::new()));
    let record = responses.clone();
    let (codex, _) = codex(vec![script(move |mut peer| async move {
        peer.handshake().await;
        peer.begin(false).await;
        peer.message_started("m1").await;
        peer.delta("m1", "Rolling.").await;
        let first = peer.tool_call(0, "exec-1").await;
        let second = peer.tool_call(1, "exec-2").await;
        peer.message_started("m2").await;
        peer.delta("m2", "You rolled 17.").await;
        peer.completed("completed", Value::Null).await;
        record.lock().unwrap().extend([first, second]);
        peer.hold().await;
    })]);
    let mut chat = new_chat("Roll a d20");
    let host = Host::default();

    let end = run(&codex, &mut chat, &host, CancellationToken::new()).await;

    assert_eq!(end, TurnEnd::Done);
    let runs = host.runs.lock().unwrap().clone();
    assert_eq!(
        runs.iter()
            .map(|(call, _)| call.clone())
            .collect::<Vec<_>>(),
        vec![roll_call("exec-1"), roll_call("exec-2")]
    );
    // Each call has its own token, and the event carries the token the
    // host waits on.
    let tokens: Vec<String> = host
        .events
        .lock()
        .unwrap()
        .iter()
        .filter_map(|e| match e {
            ChatEvent::ToolCall { token, .. } => Some(token.clone()),
            _ => None,
        })
        .collect();
    assert_eq!(
        tokens,
        runs.iter().map(|(_, t)| t.clone()).collect::<Vec<_>>()
    );
    assert_ne!(tokens[0], tokens[1]);
    let responses = recorded(&responses, 2).await;
    assert_eq!(
        responses[0]["result"],
        json!({ "contentItems": [{ "type": "inputText", "text": r#"dice_roll ran with {"notation":"1d20"}"# }],
                "success": true })
    );
    let result = |id: &str| Message::Tool {
        call_id: id.into(),
        name: "dice_roll".into(),
        content: r#"dice_roll ran with {"notation":"1d20"}"#.into(),
        is_error: false,
    };
    assert_eq!(
        chat.messages[1..],
        [
            assistant("Rolling.", vec![roll_call("exec-1")]),
            result("exec-1"),
            assistant("", vec![roll_call("exec-2")]),
            result("exec-2"),
            assistant("You rolled 17.", vec![]),
        ]
    );
}

#[tokio::test]
async fn stop_during_a_codex_tool_call_answers_the_call_and_interrupts_the_turn() {
    let seen = Arc::new(Mutex::new(Vec::new()));
    let record = seen.clone();
    let (codex, _) = codex(vec![script(move |mut peer| async move {
        peer.handshake().await;
        peer.begin(false).await;
        let answer = peer.tool_call(0, "exec-1").await;
        let interrupt = peer.expect("turn/interrupt").await;
        record.lock().unwrap().extend([answer, interrupt]);
        peer.hold().await;
    })]);
    let mut chat = new_chat("Roll a d20");
    let cancel = CancellationToken::new();
    let host = Host {
        stop_on_tool: Some(cancel.clone()),
        ..Host::default()
    };

    let end = run(&codex, &mut chat, &host, cancel).await;

    assert_eq!(end, TurnEnd::Stopped);
    let seen = recorded(&seen, 2).await;
    assert_eq!(seen[0]["result"]["success"], false);
    assert_eq!(
        seen[0]["result"]["contentItems"][0]["text"],
        openai::NOT_RUN_STOPPED
    );
    assert_eq!(
        seen[1]["params"],
        json!({ "threadId": THREAD, "turnId": TURN })
    );
    assert_eq!(
        chat.messages[1..],
        [
            assistant("", vec![roll_call("exec-1")]),
            Message::Tool {
                call_id: "exec-1".into(),
                name: "dice_roll".into(),
                content: openai::NOT_RUN_STOPPED.into(),
                is_error: true,
            },
            Message::Notice {
                level: NoticeLevel::Info,
                text: agent::STOPPED.into(),
            },
        ]
    );
}

#[tokio::test]
async fn a_codex_turn_stops_after_the_tool_call_limit() {
    let seen = Arc::new(Mutex::new(Vec::new()));
    let record = seen.clone();
    let (codex, _) = codex(vec![script(move |mut peer| async move {
        peer.handshake().await;
        peer.begin(false).await;
        for n in 0..=agent::MAX_TOOL_CALLS as u64 {
            let answer = peer.tool_call(n, &format!("exec-{n}")).await;
            record.lock().unwrap().push(answer);
        }
        let interrupt = peer.expect("turn/interrupt").await;
        record.lock().unwrap().push(interrupt);
        peer.hold().await;
    })]);
    let mut chat = new_chat("Roll forever");
    let host = Host::default();

    let end = run(&codex, &mut chat, &host, CancellationToken::new()).await;

    assert_eq!(end, TurnEnd::ToolLimit);
    assert_eq!(host.runs.lock().unwrap().len(), agent::MAX_TOOL_CALLS);
    let seen = recorded(&seen, agent::MAX_TOOL_CALLS + 2).await;
    assert!(seen[..agent::MAX_TOOL_CALLS]
        .iter()
        .all(|answer| answer["result"]["success"] == true));
    let refused = &seen[agent::MAX_TOOL_CALLS]["result"];
    assert_eq!(refused["success"], false);
    assert_eq!(refused["contentItems"][0]["text"], openai::NOT_RUN_LIMIT);
    assert_eq!(seen[agent::MAX_TOOL_CALLS + 1]["method"], "turn/interrupt");
    assert_eq!(
        chat.messages.last(),
        Some(&Message::Notice {
            level: NoticeLevel::Info,
            text: "Stopped after 25 tool calls in one turn. Send a message to continue.".into(),
        })
    );
}

#[tokio::test]
async fn codex_shell_and_file_edit_approvals_are_denied() {
    let seen = Arc::new(Mutex::new(Vec::new()));
    let record = seen.clone();
    let (codex, _) = codex(vec![script(move |mut peer| async move {
        peer.handshake().await;
        peer.begin(false).await;
        let at = json!({ "threadId": THREAD, "turnId": TURN, "itemId": "exec-1", "startedAtMs": 0,
                         "reason": null });
        let command = json!({ "threadId": THREAD, "turnId": TURN, "itemId": "exec-1",
                              "startedAtMs": 0, "reason": null, "command": "rm -rf ~/Notes",
                              "cwd": "/home/u" });
        // The legacy requests name the thread as a conversation.
        let exec = json!({ "conversationId": THREAD, "callId": "exec-2", "command": ["rm", "-rf", "Notes"],
                           "cwd": "/home/u", "parsedCmd": [], "reason": null });
        let patch = json!({ "conversationId": THREAD, "callId": "patch-1",
                            "fileChanges": { "/home/u/Notes/a.md": { "type": "add", "content": "hi" } },
                            "reason": null, "grantRoot": null });
        let permissions = json!({ "threadId": THREAD, "turnId": TURN, "itemId": "perm-1", "startedAtMs": 0,
                                  "cwd": "/home/u", "reason": null,
                                  "permissions": { "network": { "enabled": true }, "fileSystem": null } });
        let mut answers = vec![
            peer.ask(7, "item/commandExecution/requestApproval", command)
                .await,
            peer.ask(8, "item/fileChange/requestApproval", at.clone())
                .await,
            peer.ask(9, "execCommandApproval", exec).await,
            peer.ask(10, "applyPatchApproval", patch).await,
            peer.ask(11, "item/permissions/requestApproval", permissions)
                .await,
        ];
        // A request of another thread, such as a stopped one, is refused too.
        let other = json!({ "threadId": "old", "turnId": "old", "itemId": "x", "startedAtMs": 0 });
        answers.push(peer.ask(12, "item/fileChange/requestApproval", other).await);
        peer.delta("m1", "I can't write files here.").await;
        peer.completed("completed", Value::Null).await;
        record.lock().unwrap().extend(answers);
        peer.hold().await;
    })]);
    let mut chat = new_chat("Write hello.txt");
    let host = Host::default();

    let end = run(&codex, &mut chat, &host, CancellationToken::new()).await;

    assert_eq!(end, TurnEnd::Done);
    let seen = recorded(&seen, 6).await;
    let results: Vec<&Value> = seen.iter().map(|answer| &answer["result"]).collect();
    assert_eq!(results[0], &json!({ "decision": "decline" }));
    assert_eq!(results[1], &json!({ "decision": "decline" }));
    let denied = json!({ "decision": { "denied": { "rejection":
        "The app does not allow Codex to run commands or edit files." } } });
    assert_eq!(results[2], &denied);
    assert_eq!(results[3], &denied);
    assert_eq!(results[4], &json!({ "permissions": {}, "scope": "turn" }));
    assert_eq!(results[5], &json!({ "decision": "decline" }));
    assert!(host.runs.lock().unwrap().is_empty());
}

#[test]
fn codex_runs_with_its_own_shell_edit_and_web_tools_off() {
    let args = codex::launch_args().join(" ");
    assert!(args.starts_with("app-server "));
    for flag in [
        "--disable shell_tool",
        "--disable unified_exec",
        "--disable hooks",
        "-c web_search=\"disabled\"",
        "-c mcp_servers={}",
    ] {
        assert!(args.contains(flag), "missing {flag} in {args}");
    }
    // Dynamic tools need the code-mode host.
    assert!(!args.contains("code_mode_host"), "{args}");
}

#[tokio::test]
async fn a_codex_crash_fails_the_turn_and_the_next_turn_starts_codex_again() {
    let (codex, fake) = codex(vec![
        script(|mut peer| async move {
            peer.handshake().await;
            peer.begin(false).await;
            peer.delta("m1", "Half an ans").await;
            // The process ends: its pipes close.
        }),
        script(|mut peer| async move {
            peer.handshake().await;
            peer.begin(true).await;
            peer.delta("m1", "Here is the whole answer.").await;
            peer.completed("completed", Value::Null).await;
            peer.hold().await;
        }),
    ]);
    let mut chat = new_chat("Tell me about Varla");
    let host = Host::default();

    let end = run(&codex, &mut chat, &host, CancellationToken::new()).await;

    assert_eq!(end, TurnEnd::Failed);
    assert_eq!(fake.launches.load(Ordering::SeqCst), 1);
    assert_eq!(
        chat.messages[1..],
        [
            assistant("Half an ans", vec![]),
            Message::Notice {
                level: NoticeLevel::Error,
                text: "Codex stopped unexpectedly. Send a message to start it again.".into(),
            },
        ]
    );

    chat.push(Message::User {
        text: "Try again".into(),
    });
    let host = Host::default();
    let end = run(&codex, &mut chat, &host, CancellationToken::new()).await;

    assert_eq!(end, TurnEnd::Done);
    assert_eq!(fake.launches.load(Ordering::SeqCst), 2);
    assert_eq!(
        chat.messages.last(),
        Some(&assistant("Here is the whole answer.", vec![]))
    );
}

#[tokio::test]
async fn a_failed_codex_turn_shows_the_error_from_codex() {
    let (codex, _) = codex(vec![script(|mut peer| async move {
        peer.handshake().await;
        peer.begin(false).await;
        peer.notify(
            "error",
            json!({ "threadId": THREAD, "turnId": TURN, "willRetry": true,
                    "error": { "message": "Reconnecting… 1/5" } }),
        )
        .await;
        peer.completed(
            "failed",
            json!({ "message": "The model gpt-5.6-terra does not exist.", "codexErrorInfo": "modelNotFound",
                    "additionalDetails": null }),
        )
        .await;
        peer.hold().await;
    })]);
    let mut chat = new_chat("Hi");
    let host = Host::default();

    let end = run(&codex, &mut chat, &host, CancellationToken::new()).await;

    assert_eq!(end, TurnEnd::Failed);
    assert_eq!(
        chat.messages.last(),
        Some(&Message::Notice {
            level: NoticeLevel::Error,
            text: "The model gpt-5.6-terra does not exist.".into(),
        })
    );
}

#[tokio::test]
async fn a_signed_out_codex_turn_asks_for_codex_login_and_starts_no_thread() {
    let after = Arc::new(Mutex::new(Vec::new()));
    let record = after.clone();
    let (codex, _) = codex(vec![script(move |mut peer| async move {
        peer.handshake().await;
        peer.account(false).await;
        while let Some(message) = peer.next().await {
            record.lock().unwrap().push(message);
        }
    })]);
    let mut chat = new_chat("Hi");
    let host = Host::default();

    let end = run(&codex, &mut chat, &host, CancellationToken::new()).await;

    assert_eq!(end, TurnEnd::Failed);
    assert_eq!(host.toasts(), vec![codex::SIGNED_OUT.to_string()]);
    assert_eq!(
        chat.messages.last(),
        Some(&Message::Notice {
            level: NoticeLevel::Error,
            text: codex::SIGNED_OUT.into(),
        })
    );
    tokio::time::sleep(std::time::Duration::from_millis(100)).await;
    // No thread started.
    assert_eq!(*after.lock().unwrap(), Vec::<Value>::new());
}

#[tokio::test]
async fn a_codex_turn_without_codex_installed_says_to_install_it() {
    let (codex, _) = codex(vec![]);
    let mut chat = new_chat("Hi");
    let host = Host::default();

    let end = run(&codex, &mut chat, &host, CancellationToken::new()).await;

    assert_eq!(end, TurnEnd::Failed);
    assert_eq!(host.toasts(), vec![codex::NOT_INSTALLED.to_string()]);
    assert_eq!(
        chat.messages.last(),
        Some(&Message::Notice {
            level: NoticeLevel::Error,
            text: codex::NOT_INSTALLED.into(),
        })
    );
}

fn model(name: &str, hidden: bool) -> Value {
    json!({ "id": name, "model": name, "displayName": name, "description": "", "hidden": hidden,
            "isDefault": false, "defaultReasoningEffort": "medium",
            "supportedReasoningEfforts": [{ "reasoningEffort": "medium", "description": "Balanced" }] })
}

async fn answer_models(peer: &mut Peer) {
    let first = peer.expect("model/list").await;
    assert_eq!(first["params"]["cursor"], Value::Null);
    peer.reply(
        &first,
        json!({ "data": [model("gpt-6.1-sol", false), model("codex-auto-review", true)], "nextCursor": "2" }),
    )
    .await;
    let second = peer.expect("model/list").await;
    assert_eq!(second["params"]["cursor"], "2");
    peer.reply(
        &second,
        json!({ "data": [model("gpt-5.6-terra", false)], "nextCursor": null }),
    )
    .await;
}

#[tokio::test]
async fn codex_status_lists_the_visible_models_when_signed_in() {
    let (codex, fake) = codex(vec![script(|mut peer| async move {
        peer.handshake().await;
        peer.account(true).await;
        answer_models(&mut peer).await;
        // The second status reuses the running app server.
        peer.account(true).await;
        answer_models(&mut peer).await;
        peer.hold().await;
    })]);

    let status = codex.status().await;
    assert_eq!(
        status,
        Status::Ready {
            models: vec!["gpt-6.1-sol".into(), "gpt-5.6-terra".into()]
        }
    );
    assert_eq!(
        serde_json::to_value(&status).unwrap(),
        json!({ "state": "ready", "models": ["gpt-6.1-sol", "gpt-5.6-terra"] })
    );
    codex.status().await;
    assert_eq!(fake.launches.load(Ordering::SeqCst), 1);
}

#[tokio::test]
async fn codex_status_says_when_codex_is_signed_out_or_not_installed() {
    let (codex, _) = codex(vec![script(|mut peer| async move {
        peer.handshake().await;
        peer.account(false).await;
        answer_models(&mut peer).await;
        peer.hold().await;
    })]);
    let status = codex.status().await;
    assert_eq!(
        serde_json::to_value(&status).unwrap(),
        json!({ "state": "signedOut", "models": ["gpt-6.1-sol", "gpt-5.6-terra"] })
    );

    let (missing, _) = super::codex_tests::codex(vec![]);
    assert_eq!(
        serde_json::to_value(missing.status().await).unwrap(),
        json!({ "state": "notInstalled" })
    );
}

#[tokio::test]
async fn the_first_codex_reply_titles_the_chat_in_a_turn_without_tools() {
    let seen = Arc::new(Mutex::new(Vec::new()));
    let record = seen.clone();
    let (codex, _) = codex(vec![script(move |mut peer| async move {
        peer.handshake().await;
        peer.begin(false).await;
        peer.delta("m1", "Ambush them at the ford.").await;
        peer.usage(100, 10).await;
        peer.completed("completed", Value::Null).await;
        peer.expect("thread/unsubscribe").await;
        // The title: a new thread without tools, with the first exchange.
        let thread = peer.expect("thread/start").await;
        peer.reply(&thread, thread_started(&thread)).await;
        let turn = peer.expect("turn/start").await;
        peer.reply(&turn, turn_started()).await;
        peer.delta("m2", "\"Goblin Ambush at the Ford\"").await;
        peer.usage(40, 5).await;
        peer.completed("completed", Value::Null).await;
        record.lock().unwrap().extend([thread, turn]);
        peer.hold().await;
    })]);
    let mut chat = new_chat("How do I ambush goblins?");
    let host = Host::default();
    let backend = Backend::Codex(Session {
        codex: codex.clone(),
        model: "gpt-5.6-terra".into(),
    });
    let mut turn = Turn {
        chat: &mut chat,
        system: SYSTEM.into(),
        tools: vec![roll_tool()],
        cancel: CancellationToken::new(),
    };

    let end = within(agent::answer(&backend, &mut turn, &host)).await;

    assert_eq!(end, TurnEnd::Done);
    assert_eq!(chat.title, "Goblin Ambush at the Ford");
    assert_eq!(chat.usage.input_tokens, 140);
    assert_eq!(chat.usage.output_tokens, 15);
    assert_eq!(
        host.saved.lock().unwrap().as_ref().unwrap().title,
        chat.title
    );
    let seen = recorded(&seen, 2).await;
    assert_eq!(seen[0]["params"]["dynamicTools"], json!([]));
    assert_eq!(seen[0]["params"]["baseInstructions"], openai::TITLE_PROMPT);
    assert_eq!(seen[0]["params"]["model"], "gpt-5.6-terra");
    assert_eq!(
        seen[1]["params"]["input"][0]["text"],
        "User: How do I ambush goblins?\n\nAssistant: Ambush them at the ford."
    );
}

#[tokio::test]
async fn stop_before_codex_answers_turn_start_interrupts_the_turn_once_it_starts() {
    let seen = Arc::new(Mutex::new(Vec::new()));
    let record = seen.clone();
    let answered = Arc::new(AtomicUsize::new(0));
    let answer = answered.clone();
    let cancel = CancellationToken::new();
    let stop = cancel.clone();
    let (codex, _) = codex(vec![script(move |mut peer| async move {
        peer.handshake().await;
        peer.account(true).await;
        let thread = peer.expect("thread/start").await;
        peer.reply(&thread, thread_started(&thread)).await;
        let turn = peer.expect("turn/start").await;
        // Stop comes before Codex answers.
        stop.cancel();
        tokio::time::sleep(std::time::Duration::from_millis(50)).await;
        answer.fetch_add(1, Ordering::SeqCst);
        peer.reply(&turn, turn_started()).await;
        let interrupt = peer.expect("turn/interrupt").await;
        let unsubscribe = peer.expect("thread/unsubscribe").await;
        record.lock().unwrap().extend([interrupt, unsubscribe]);
        peer.hold().await;
    })]);
    let mut chat = new_chat("Hi");
    let host = Host::default();

    let end = run(&codex, &mut chat, &host, cancel).await;

    assert_eq!(end, TurnEnd::Stopped);
    // The turn ended without waiting for Codex.
    assert_eq!(answered.load(Ordering::SeqCst), 0);
    assert_eq!(
        chat.messages.last(),
        Some(&Message::Notice {
            level: NoticeLevel::Info,
            text: agent::STOPPED.into(),
        })
    );
    let seen = recorded(&seen, 2).await;
    assert_eq!(
        seen[0]["params"],
        json!({ "threadId": THREAD, "turnId": TURN })
    );
    assert_eq!(seen[1]["params"], json!({ "threadId": THREAD }));
}

#[tokio::test]
async fn stop_during_the_codex_title_ends_the_title_turn() {
    let seen = Arc::new(Mutex::new(Vec::new()));
    let record = seen.clone();
    let cancel = CancellationToken::new();
    let stop = cancel.clone();
    let (codex, _) = codex(vec![script(move |mut peer| async move {
        peer.handshake().await;
        peer.begin(false).await;
        peer.delta("m1", "Ambush them at the ford.").await;
        peer.usage(100, 10).await;
        peer.completed("completed", Value::Null).await;
        peer.expect("thread/unsubscribe").await;
        let thread = peer.expect("thread/start").await;
        peer.reply(&thread, thread_started(&thread)).await;
        let turn = peer.expect("turn/start").await;
        // Stop while the title turn starts.
        stop.cancel();
        tokio::time::sleep(std::time::Duration::from_millis(50)).await;
        peer.reply(&turn, turn_started()).await;
        let interrupt = peer.expect("turn/interrupt").await;
        let unsubscribe = peer.expect("thread/unsubscribe").await;
        record.lock().unwrap().extend([interrupt, unsubscribe]);
        peer.hold().await;
    })]);
    let mut chat = new_chat("How do I ambush goblins?");
    let untitled = chat.title.clone();
    let host = Host::default();
    let backend = Backend::Codex(Session {
        codex: codex.clone(),
        model: "gpt-5.6-terra".into(),
    });
    let mut turn = Turn {
        chat: &mut chat,
        system: SYSTEM.into(),
        tools: vec![roll_tool()],
        cancel,
    };

    let end = within(agent::answer(&backend, &mut turn, &host)).await;

    assert_eq!(end, TurnEnd::Done);
    assert_eq!(chat.title, untitled);
    assert_eq!(chat.usage.input_tokens, 100);
    let seen = recorded(&seen, 2).await;
    assert_eq!(
        seen[0]["params"],
        json!({ "threadId": THREAD, "turnId": TURN })
    );
    assert_eq!(seen[1]["params"], json!({ "threadId": THREAD }));
}

#[tokio::test]
async fn a_codex_crash_while_a_tool_call_waits_ends_the_turn() {
    let (codex, _) = codex(vec![script(|mut peer| async move {
        peer.handshake().await;
        peer.begin(false).await;
        peer.write(json!({ "id": 0, "method": "item/tool/call", "params": {
            "threadId": THREAD, "turnId": TURN, "callId": "exec-1", "namespace": null,
            "tool": "dice_roll", "arguments": { "notation": "1d20" } } }))
            .await;
        tokio::time::sleep(std::time::Duration::from_millis(50)).await;
        // The process ends while the call waits at its approval card.
    })]);
    let mut chat = new_chat("Roll a d20");
    let host = Host {
        tool_waits: true,
        ..Host::default()
    };

    let end = run(&codex, &mut chat, &host, CancellationToken::new()).await;

    assert_eq!(end, TurnEnd::Failed);
    assert_eq!(host.runs.lock().unwrap().len(), 1);
    assert_eq!(
        chat.messages[1..],
        [
            assistant("", vec![roll_call("exec-1")]),
            Message::Tool {
                call_id: "exec-1".into(),
                name: "dice_roll".into(),
                content: "Not run: the turn ended.".into(),
                is_error: true,
            },
            Message::Notice {
                level: NoticeLevel::Error,
                text: "Codex stopped unexpectedly. Send a message to start it again.".into(),
            },
        ]
    );
}

// An app server that reads `initialize`, answers it with `answer` when
// given, and records when its pipes close.
fn failing_start(closed: &Arc<Mutex<Vec<Value>>>, answer: Option<Value>) -> Script {
    let record = closed.clone();
    script(move |mut peer| async move {
        let initialize = peer.expect("initialize").await;
        if let Some(answer) = answer {
            peer.write(json!({ "id": initialize["id"], "error": answer }))
                .await;
        }
        while peer.next().await.is_some() {}
        record.lock().unwrap().push(json!("closed"));
    })
}

#[tokio::test(start_paused = true)]
async fn a_codex_start_that_fails_closes_the_app_server() {
    let closed = Arc::new(Mutex::new(Vec::new()));
    let (codex, fake) = codex(vec![
        failing_start(&closed, None),
        failing_start(
            &closed,
            Some(json!({ "code": -32600, "message": "Bad client." })),
        ),
        // Ends at once.
        script(|_| async {}),
    ]);

    assert_eq!(
        codex.status().await,
        Status::Error {
            message: "Couldn't start Codex: it did not answer.".into()
        }
    );
    recorded(&closed, 1).await;
    assert_eq!(
        codex.status().await,
        Status::Error {
            message: "Couldn't start Codex: Bad client.".into()
        }
    );
    recorded(&closed, 2).await;
    assert_eq!(
        codex.status().await,
        Status::Error {
            message: "Couldn't start Codex: Codex stopped unexpectedly. Send a message to start it again."
                .into()
        }
    );
    assert_eq!(fake.launches.load(Ordering::SeqCst), 3);
}

// Starts a real process that never answers.
#[cfg(target_os = "linux")]
struct Unresponsive(Arc<Mutex<Option<u32>>>);

#[cfg(target_os = "linux")]
impl Launch for Unresponsive {
    fn launch(&self, _cwd: &Path) -> io::Result<Pipes> {
        let mut child = tokio::process::Command::new("sleep")
            .arg("600")
            .stdin(std::process::Stdio::piped())
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::null())
            .kill_on_drop(true)
            .spawn()?;
        *self.0.lock().unwrap() = child.id();
        Ok(Pipes {
            input: Box::new(child.stdin.take().unwrap()),
            output: Box::new(child.stdout.take().unwrap()),
            child: Some(child),
        })
    }
}

#[cfg(target_os = "linux")]
#[tokio::test(start_paused = true)]
async fn an_unresponsive_codex_process_is_killed() {
    let pid = Arc::new(Mutex::new(None));
    let dir = std::env::temp_dir().join("ror-desktop-codex-tests");
    let codex = Codex::new(Box::new(Unresponsive(pid.clone())), dir);

    assert_eq!(
        codex.status().await,
        Status::Error {
            message: "Couldn't start Codex: it did not answer.".into()
        }
    );
    let pid = pid.lock().unwrap().unwrap();
    // Killed: gone, or a zombie until it is reaped.
    let killed = || match std::fs::read_to_string(format!("/proc/{pid}/stat")) {
        Err(_) => true,
        Ok(stat) => stat
            .rsplit(')')
            .next()
            .is_some_and(|rest| rest.trim_start().starts_with(['Z', 'X'])),
    };
    for _ in 0..100 {
        if killed() {
            break;
        }
        std::thread::sleep(std::time::Duration::from_millis(20));
    }
    assert!(killed(), "process {pid} still runs");
}

#[tokio::test]
async fn stop_while_codex_starts_ends_the_turn_and_closes_the_app_server() {
    let closed = Arc::new(Mutex::new(Vec::new()));
    let record = closed.clone();
    let cancel = CancellationToken::new();
    let stop = cancel.clone();
    let (codex, fake) = codex(vec![
        script(move |mut peer| async move {
            peer.expect("initialize").await;
            // Codex stalls, and the user presses Stop.
            stop.cancel();
            while peer.next().await.is_some() {}
            record.lock().unwrap().push(json!("closed"));
        }),
        script(|mut peer| async move {
            peer.handshake().await;
            peer.begin(true).await;
            peer.delta("m1", "Hello.").await;
            peer.completed("completed", Value::Null).await;
            peer.hold().await;
        }),
    ]);
    let mut chat = new_chat("Hi");
    let host = Host::default();

    // Well under the 20 s the start may take.
    let end = run(&codex, &mut chat, &host, cancel).await;

    assert_eq!(end, TurnEnd::Stopped);
    assert_eq!(
        chat.messages.last(),
        Some(&Message::Notice {
            level: NoticeLevel::Info,
            text: agent::STOPPED.into(),
        })
    );
    recorded(&closed, 1).await;

    chat.push(Message::User {
        text: "Hi again".into(),
    });
    let end = run(&codex, &mut chat, &host, CancellationToken::new()).await;
    assert_eq!(end, TurnEnd::Done);
    assert_eq!(fake.launches.load(Ordering::SeqCst), 2);
}

#[cfg(unix)]
#[test]
fn codex_is_found_only_in_absolute_path_folders() {
    let root = std::env::temp_dir().join(format!("ror-desktop-find-codex-{}", std::process::id()));
    let near = root.join("bin");
    let far = root.join("abs");
    for dir in [&near, &far] {
        std::fs::create_dir_all(dir).unwrap();
        std::fs::write(dir.join("codex"), "").unwrap();
    }
    // `near` as a relative PATH entry: from the test's folder it names a
    // Codex, but from the folder Codex runs in it would name another file.
    let cwd = std::env::current_dir().unwrap();
    let mut relative = std::path::PathBuf::new();
    for _ in 1..cwd.components().count() {
        relative.push("..");
    }
    relative.push(near.strip_prefix("/").unwrap());
    assert!(relative.join("codex").is_file());

    let found = codex::find_codex_in(
        &[relative.clone(), std::path::PathBuf::new(), far.clone()],
        &["codex"],
    );
    let none = codex::find_codex_in(&[relative, std::path::PathBuf::new()], &["codex"]);
    std::fs::remove_dir_all(&root).unwrap();

    assert_eq!(found, Some(far.join("codex")));
    assert_eq!(none, None);
}

// Codex takes `stalled` but never answers it, and the user presses Stop.
// After the deadline the app server is closed, and the next turn starts a
// new one.
async fn stop_with_a_start_codex_never_answers(stalled: &'static str) {
    let closed = Arc::new(Mutex::new(Vec::new()));
    let record = closed.clone();
    let cancel = CancellationToken::new();
    let stop = cancel.clone();
    let (codex, fake) = codex(vec![
        script(move |mut peer| async move {
            peer.handshake().await;
            peer.account(true).await;
            let thread = peer.expect("thread/start").await;
            if stalled != "thread/start" {
                peer.reply(&thread, thread_started(&thread)).await;
                peer.expect("turn/start").await;
            }
            stop.cancel();
            while peer.next().await.is_some() {}
            record.lock().unwrap().push(json!("closed"));
        }),
        script(|mut peer| async move {
            peer.handshake().await;
            peer.begin(true).await;
            peer.delta("m1", "Hello.").await;
            peer.completed("completed", Value::Null).await;
            peer.hold().await;
        }),
    ]);
    let mut chat = new_chat("Hi");
    let host = Host::default();

    let end = run(&codex, &mut chat, &host, cancel).await;

    assert_eq!(end, TurnEnd::Stopped);
    assert_eq!(
        chat.messages.last(),
        Some(&Message::Notice {
            level: NoticeLevel::Info,
            text: agent::STOPPED.into(),
        })
    );
    // Before the deadline the app server still runs.
    tokio::time::sleep(codex::STOPPED_START_TIMEOUT / 2).await;
    assert!(closed.lock().unwrap().is_empty());
    tokio::time::sleep(codex::STOPPED_START_TIMEOUT).await;
    recorded(&closed, 1).await;

    chat.push(Message::User {
        text: "Hi again".into(),
    });
    let end = run(&codex, &mut chat, &host, CancellationToken::new()).await;
    assert_eq!(end, TurnEnd::Done);
    assert_eq!(fake.launches.load(Ordering::SeqCst), 2);
}

#[tokio::test(start_paused = true)]
async fn stop_with_a_turn_start_codex_never_answers_closes_codex_after_the_deadline() {
    stop_with_a_start_codex_never_answers("turn/start").await;
}

#[tokio::test(start_paused = true)]
async fn stop_with_a_thread_start_codex_never_answers_closes_codex_after_the_deadline() {
    stop_with_a_start_codex_never_answers("thread/start").await;
}
