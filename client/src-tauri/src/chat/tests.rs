// Runs turns against a fake OpenAI-compatible server on 127.0.0.1.

use super::agent::{
    Backend, ChatEvent, ToolOutput, ToolSpec, Turn, TurnEnd, TurnHost, MAX_TOOL_CALLS,
};
use super::openai::Endpoint;
use super::store::{BackendId, Chat, Message, NoticeLevel, ToolCall, Usage};
use serde_json::{json, Value};
use std::io::{BufRead, BufReader, Read, Write};
use std::net::TcpListener;
use std::sync::{Arc, Mutex};
use tokio_util::sync::CancellationToken;

const KEY: &str = "sk-test-secret-key";

enum Reply {
    // The `data:` payloads of an event stream, then `data: [DONE]`.
    Stream(Vec<Value>),
    // An event stream body exactly as written.
    RawStream(String),
    Status(u16, String),
}

struct Request {
    authorization: String,
    session: String,
    body: Value,
}

struct FakeServer {
    url: String,
    requests: Arc<Mutex<Vec<Request>>>,
}

// Answers the nth request with `reply(n)`.
fn serve(reply: impl Fn(usize) -> Reply + Send + 'static) -> FakeServer {
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let url = format!("http://{}/v1", listener.local_addr().unwrap());
    let requests = Arc::new(Mutex::new(Vec::new()));
    let seen = requests.clone();
    std::thread::spawn(move || {
        for (n, stream) in listener.incoming().enumerate() {
            let mut stream = stream.unwrap();
            let mut reader = BufReader::new(stream.try_clone().unwrap());
            let (mut length, mut authorization, mut session) = (0, String::new(), String::new());
            loop {
                let mut line = String::new();
                reader.read_line(&mut line).unwrap();
                let line = line.trim_end();
                if line.is_empty() {
                    break;
                }
                let (name, value) = line.split_once(':').unwrap_or((line, ""));
                match name.to_ascii_lowercase().as_str() {
                    "content-length" => length = value.trim().parse().unwrap(),
                    "authorization" => authorization = value.trim().to_string(),
                    "x-opencode-session" => session = value.trim().to_string(),
                    _ => {}
                }
            }
            let mut body = vec![0; length];
            reader.read_exact(&mut body).unwrap();
            seen.lock().unwrap().push(Request {
                authorization,
                session,
                body: serde_json::from_slice(&body).unwrap_or(Value::Null),
            });
            let response = match reply(n) {
                Reply::Stream(events) => {
                    let mut text = String::from(
                        "HTTP/1.1 200 OK\r\nContent-Type: text/event-stream\r\nConnection: close\r\n\r\n",
                    );
                    for event in events {
                        text.push_str(&format!("data: {event}\n\n"));
                    }
                    text.push_str("data: [DONE]\n\n");
                    text
                }
                Reply::RawStream(body) => format!(
                    "HTTP/1.1 200 OK\r\nContent-Type: text/event-stream\r\nConnection: close\r\n\r\n{body}"
                ),
                Reply::Status(code, body) => format!(
                    "HTTP/1.1 {code} Error\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
                    body.len()
                ),
            };
            let _ = stream.write_all(response.as_bytes());
        }
    });
    FakeServer { url, requests }
}

fn text(text: &str) -> Value {
    json!({ "choices": [{ "index": 0, "delta": { "content": text } }] })
}

fn call_start(index: usize, id: &str, name: &str) -> Value {
    json!({ "choices": [{ "index": 0, "delta": { "tool_calls": [
        { "index": index, "id": id, "type": "function", "function": { "name": name, "arguments": "" } }
    ] } }] })
}

fn call_arguments(index: usize, arguments: &str) -> Value {
    json!({ "choices": [{ "index": 0, "delta": { "tool_calls": [
        { "index": index, "function": { "arguments": arguments } }
    ] } }] })
}

fn usage(input: u64, output: u64) -> Value {
    json!({ "choices": [], "usage": { "prompt_tokens": input, "completion_tokens": output } })
}

#[derive(Default)]
struct TestHost {
    events: Mutex<Vec<ChatEvent>>,
    tool_runs: Mutex<Vec<ToolCall>>,
    saved: Mutex<Option<Chat>>,
    // When set, a tool call presses Stop and never finishes.
    stop_on_tool: Option<CancellationToken>,
    // When set, Stop is pressed as the reply with tool calls is added.
    stop_after_reply: Option<CancellationToken>,
}

impl TurnHost for TestHost {
    fn emit(&self, event: ChatEvent) {
        if let (
            Some(stop),
            ChatEvent::Message {
                message: Message::Assistant { tool_calls, .. },
            },
        ) = (&self.stop_after_reply, &event)
        {
            if !tool_calls.is_empty() {
                stop.cancel();
            }
        }
        self.events.lock().unwrap().push(event);
    }

    fn save(&self, chat: &Chat) {
        *self.saved.lock().unwrap() = Some(chat.clone());
    }

    fn run_tool(
        &self,
        call: &ToolCall,
        _token: &str,
    ) -> impl std::future::Future<Output = ToolOutput> + Send {
        self.tool_runs.lock().unwrap().push(call.clone());
        let output = ToolOutput {
            content: format!("{} ran with {}", call.name, call.arguments),
            is_error: false,
        };
        let stop = self.stop_on_tool.clone();
        async move {
            if let Some(stop) = stop {
                stop.cancel();
                std::future::pending::<()>().await;
            }
            output
        }
    }
}

impl TestHost {
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

    fn tool_call_events(&self) -> Vec<ToolCall> {
        self.events
            .lock()
            .unwrap()
            .iter()
            .filter_map(|e| match e {
                ChatEvent::ToolCall { call, .. } => Some(call.clone()),
                _ => None,
            })
            .collect()
    }

    fn events_json(&self) -> String {
        serde_json::to_string(&*self.events.lock().unwrap()).unwrap()
    }
}

fn roll_tool() -> ToolSpec {
    ToolSpec {
        name: "dice_roll".into(),
        description: "Rolls dice.".into(),
        input_schema: json!({ "type": "object", "properties": { "notation": { "type": "string" } } }),
    }
}

async fn run(server: &FakeServer, host: &TestHost, cancel: CancellationToken) -> (Chat, TurnEnd) {
    let mut chat = Chat::new(BackendId::OpencodeGo, "fake-model");
    let backend = Backend::OpenAi(Endpoint {
        client: reqwest::Client::new(),
        base_url: server.url.clone(),
        label: "Fake",
        api_key: KEY.into(),
        model: "fake-model".into(),
        session: Some(chat.id.clone()),
    });
    chat.push(Message::User {
        text: "Roll a d20".into(),
    });
    let mut turn = Turn {
        chat: &mut chat,
        system: "You help with a campaign.".into(),
        tools: vec![roll_tool()],
        cancel,
    };
    let end = backend.run_turn(&mut turn, host).await;
    (chat, end)
}

#[tokio::test]
async fn a_turn_streams_text_runs_a_tool_and_sends_the_result_back() {
    let server = serve(|n| {
        Reply::Stream(match n {
            0 => vec![
                text("Rolling "),
                text("now."),
                call_start(0, "call_1", "dice_roll"),
                call_arguments(0, "{\"notation\":"),
                call_arguments(0, "\"1d20\"}"),
                usage(100, 20),
            ],
            _ => vec![text("You rolled 17."), usage(130, 5)],
        })
    });
    let host = TestHost::default();
    let (chat, end) = run(&server, &host, CancellationToken::new()).await;

    assert_eq!(end, TurnEnd::Done);
    assert_eq!(host.streamed_text(), "Rolling now.You rolled 17.");
    let call = ToolCall {
        id: "call_1".into(),
        name: "dice_roll".into(),
        arguments: r#"{"notation":"1d20"}"#.into(),
    };
    assert_eq!(host.tool_call_events(), vec![call.clone()]);
    assert_eq!(*host.tool_runs.lock().unwrap(), vec![call.clone()]);

    let requests = server.requests.lock().unwrap();
    assert_eq!(requests.len(), 2);
    let first = &requests[0].body;
    assert_eq!(requests[0].authorization, format!("Bearer {KEY}"));
    assert_eq!(requests[0].session, chat.id);
    assert_eq!(requests[1].session, chat.id);
    assert_eq!(first["model"], "fake-model");
    assert_eq!(first["stream"], true);
    assert_eq!(first["stream_options"], json!({ "include_usage": true }));
    assert_eq!(first["tools"][0]["function"]["name"], "dice_roll");
    assert_eq!(
        first["messages"],
        json!([
            { "role": "system", "content": "You help with a campaign." },
            { "role": "user", "content": "Roll a d20" },
        ])
    );
    let second = requests[1].body["messages"].as_array().unwrap();
    assert_eq!(
        second[2..],
        [
            json!({ "role": "assistant", "content": "Rolling now.", "tool_calls": [
                { "id": "call_1", "type": "function", "function": { "name": "dice_roll", "arguments": "{\"notation\":\"1d20\"}" } }
            ] }),
            json!({ "role": "tool", "tool_call_id": "call_1", "content": "dice_roll ran with {\"notation\":\"1d20\"}" }),
        ]
    );

    assert_eq!(
        chat.messages[1..],
        [
            Message::Assistant {
                text: "Rolling now.".into(),
                reasoning: String::new(),
                tool_calls: vec![call],
            },
            Message::Tool {
                call_id: "call_1".into(),
                name: "dice_roll".into(),
                content: "dice_roll ran with {\"notation\":\"1d20\"}".into(),
                is_error: false,
            },
            Message::Assistant {
                text: "You rolled 17.".into(),
                reasoning: String::new(),
                tool_calls: vec![],
            },
        ]
    );
    assert_eq!(
        chat.usage,
        Usage {
            input_tokens: 230,
            output_tokens: 25
        }
    );
    assert_eq!(host.saved.lock().unwrap().as_ref(), Some(&chat));
    assert!(!host.events_json().contains(KEY));
}

#[tokio::test]
async fn a_turn_stops_after_the_tool_call_limit() {
    // The model asks for a tool on every reply.
    let server = serve(|n| {
        Reply::Stream(vec![
            call_start(0, &format!("call_{n}"), "dice_roll"),
            call_arguments(0, "{}"),
        ])
    });
    let host = TestHost::default();
    let (chat, end) = run(&server, &host, CancellationToken::new()).await;

    assert_eq!(end, TurnEnd::ToolLimit);
    assert_eq!(host.tool_runs.lock().unwrap().len(), MAX_TOOL_CALLS);
    assert_eq!(host.tool_call_events().len(), MAX_TOOL_CALLS);
    // One request per call run, and the one whose call was refused.
    assert_eq!(server.requests.lock().unwrap().len(), MAX_TOOL_CALLS + 1);
    let n = chat.messages.len();
    assert_eq!(
        chat.messages[n - 2],
        Message::Tool {
            call_id: format!("call_{MAX_TOOL_CALLS}"),
            name: "dice_roll".into(),
            content: "Not run: the turn reached its tool call limit.".into(),
            is_error: true,
        }
    );
    assert_eq!(
        chat.messages[n - 1],
        Message::Notice {
            level: NoticeLevel::Info,
            text: "Stopped after 25 tool calls in one turn. Send a message to continue.".into(),
        }
    );
}

#[tokio::test]
async fn stop_while_a_tool_runs_ends_the_turn_and_answers_the_call() {
    let server = serve(|_| {
        Reply::Stream(vec![
            call_start(0, "call_a", "dice_roll"),
            call_start(1, "call_b", "dice_roll"),
        ])
    });
    let cancel = CancellationToken::new();
    let host = TestHost {
        stop_on_tool: Some(cancel.clone()),
        ..TestHost::default()
    };
    let (chat, end) = run(&server, &host, cancel).await;

    assert_eq!(end, TurnEnd::Stopped);
    assert_eq!(server.requests.lock().unwrap().len(), 1);
    let results: Vec<_> = chat
        .messages
        .iter()
        .filter_map(|m| match m {
            Message::Tool {
                call_id, content, ..
            } => Some((call_id.as_str(), content.as_str())),
            _ => None,
        })
        .collect();
    assert_eq!(
        results,
        [
            ("call_a", "Not run: the user stopped the turn."),
            ("call_b", "Not run: the user stopped the turn."),
        ]
    );
    assert_eq!(
        chat.messages.last(),
        Some(&Message::Notice {
            level: NoticeLevel::Info,
            text: "Stopped.".into()
        })
    );
}

#[tokio::test]
async fn provider_errors_end_the_turn_with_an_error_line_and_no_key() {
    let cases = [
        (
            401,
            format!(r#"{{"error":{{"message":"bad key {KEY}"}}}}"#),
            "Fake refused the key (HTTP 401). Check the key in the model menu.",
        ),
        (
            429,
            "{}".to_string(),
            "Fake is rate limiting requests (HTTP 429). Try again later.",
        ),
        (
            500,
            format!(r#"{{"error":{{"message":"model down, key {KEY}"}}}}"#),
            "Fake returned HTTP 500: model down, key [key]",
        ),
    ];
    for (code, body, expected) in cases {
        let server = serve(move |_| Reply::Status(code, body.clone()));
        let host = TestHost::default();
        let (chat, end) = run(&server, &host, CancellationToken::new()).await;

        assert_eq!(end, TurnEnd::Failed, "{code}");
        assert_eq!(
            chat.messages.last(),
            Some(&Message::Notice {
                level: NoticeLevel::Error,
                text: expected.into()
            }),
            "{code}"
        );
        assert!(!host.events_json().contains(KEY), "{code}");
    }
}

#[tokio::test]
async fn an_error_inside_the_stream_keeps_the_text_so_far() {
    let server = serve(|_| {
        Reply::Stream(vec![
            text("Partial"),
            json!({ "error": { "message": "overloaded" } }),
        ])
    });
    let host = TestHost::default();
    let (chat, end) = run(&server, &host, CancellationToken::new()).await;

    assert_eq!(end, TurnEnd::Failed);
    assert_eq!(
        chat.messages[1..],
        [
            Message::Assistant {
                text: "Partial".into(),
                reasoning: String::new(),
                tool_calls: vec![],
            },
            Message::Notice {
                level: NoticeLevel::Error,
                text: "Fake: overloaded".into()
            },
        ]
    );
}

#[tokio::test]
async fn models_are_listed_from_the_models_endpoint() {
    let server = serve(|_| {
        Reply::Status(
            200,
            r#"{"data":[{"id":"glm-5.3"},{"id":"kimi-k3"}]}"#.to_string(),
        )
    });
    let endpoint = Endpoint {
        client: reqwest::Client::new(),
        base_url: server.url.clone(),
        label: "Fake",
        api_key: KEY.into(),
        model: String::new(),
        session: None,
    };
    assert_eq!(
        super::openai::list_models(&endpoint).await.unwrap(),
        vec!["glm-5.3", "kimi-k3"]
    );
    assert_eq!(
        server.requests.lock().unwrap()[0].authorization,
        format!("Bearer {KEY}")
    );
}

#[tokio::test]
async fn each_tool_call_event_has_its_own_token() {
    let server = serve(|n| {
        Reply::Stream(match n {
            0 => vec![
                call_start(0, "call_1", "dice_roll"),
                call_start(1, "call_1", "dice_roll"),
            ],
            _ => vec![text("Done.")],
        })
    });
    let host = TestHost::default();
    run(&server, &host, CancellationToken::new()).await;

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
    assert_eq!(tokens.len(), 2);
    assert_ne!(tokens[0], tokens[1]);
}

#[tokio::test]
async fn stop_after_the_reply_starts_no_tool_call() {
    let server = serve(|_| {
        Reply::Stream(vec![
            call_start(0, "call_a", "dice_roll"),
            call_start(1, "call_b", "dice_roll"),
        ])
    });
    let cancel = CancellationToken::new();
    let host = TestHost {
        stop_after_reply: Some(cancel.clone()),
        ..TestHost::default()
    };
    let (chat, end) = run(&server, &host, cancel).await;

    assert_eq!(end, TurnEnd::Stopped);
    assert!(host.tool_runs.lock().unwrap().is_empty());
    assert!(host.tool_call_events().is_empty());
    assert_eq!(
        chat.messages.last(),
        Some(&Message::Notice {
            level: NoticeLevel::Info,
            text: "Stopped.".into()
        })
    );
}

fn reply_with_partial_text_then(rest: &str) -> String {
    format!("data: {}\n\n{rest}", text("Partial"))
}

#[tokio::test]
async fn a_malformed_event_ends_the_turn_with_an_error_and_keeps_the_text() {
    let server = serve(|_| {
        Reply::RawStream(reply_with_partial_text_then(
            "data: {\"choices\":\n\ndata: [DONE]\n\n",
        ))
    });
    let host = TestHost::default();
    let (chat, end) = run(&server, &host, CancellationToken::new()).await;

    assert_eq!(end, TurnEnd::Failed);
    assert_eq!(
        chat.messages[1..],
        [
            Message::Assistant {
                text: "Partial".into(),
                reasoning: String::new(),
                tool_calls: vec![],
            },
            Message::Notice {
                level: NoticeLevel::Error,
                text: "Fake sent a reply that can't be read.".into()
            },
        ]
    );
}

#[tokio::test]
async fn a_reply_cut_off_before_done_ends_with_an_error_and_keeps_the_text() {
    // The connection closes in the middle of a tool call.
    let server = serve(|_| {
        Reply::RawStream(reply_with_partial_text_then(&format!(
            "data: {}\n\n",
            call_start(0, "call_a", "dice_roll")
        )))
    });
    let host = TestHost::default();
    let (chat, end) = run(&server, &host, CancellationToken::new()).await;

    assert_eq!(end, TurnEnd::Failed);
    assert!(host.tool_runs.lock().unwrap().is_empty());
    assert_eq!(
        chat.messages[1..],
        [
            Message::Assistant {
                text: "Partial".into(),
                reasoning: String::new(),
                tool_calls: vec![],
            },
            Message::Notice {
                level: NoticeLevel::Error,
                text: "Fake ended the reply before it was complete.".into()
            },
        ]
    );
}

fn output(content: &str) -> ToolOutput {
    ToolOutput {
        content: content.into(),
        is_error: false,
    }
}

#[test]
fn a_result_reaches_only_the_call_with_its_token() {
    let state = super::ChatState::new();
    state.begin_turn("turn-1").unwrap();
    let mut waiting = state.wait_for_tool("turn-1", "token-1");

    // The model's call id is not enough.
    assert!(!state.deliver("call_1", output("wrong")));
    assert!(waiting.try_recv().is_err());
    assert!(state.deliver("token-1", output("right")));
    assert_eq!(waiting.try_recv().unwrap().content, "right");
}

#[test]
fn a_result_from_a_stopped_turn_is_dropped() {
    let state = super::ChatState::new();
    state.begin_turn("old").unwrap();
    let _old_call = state.wait_for_tool("old", "old-token");
    state.stop("old");
    state.end_turn("old");

    state.begin_turn("new").unwrap();
    let mut waiting = state.wait_for_tool("new", "new-token");
    // The old turn's handler finishes late.
    assert!(!state.deliver("old-token", output("late")));
    assert!(waiting.try_recv().is_err());
    assert!(state.deliver("new-token", output("new")));
    assert_eq!(waiting.try_recv().unwrap().content, "new");
}

#[test]
fn an_ended_turn_leaves_the_next_turn_alone() {
    let state = super::ChatState::new();
    state.begin_turn("old").unwrap();
    state.end_turn("old");
    state.begin_turn("new").unwrap();
    let mut waiting = state.wait_for_tool("new", "new-token");

    // A late cleanup of the old turn, as a guard dropping after the next
    // turn began.
    state.end_turn("old");
    assert_eq!(
        state.begin_turn("third").unwrap_err(),
        "A reply is already running."
    );
    assert!(state.deliver("new-token", output("new")));
    assert_eq!(waiting.try_recv().unwrap().content, "new");
}

#[test]
fn a_tool_wait_for_a_turn_that_ended_never_resolves() {
    let state = super::ChatState::new();
    state.begin_turn("old").unwrap();
    state.end_turn("old");
    let mut waiting = state.wait_for_tool("old", "token");
    assert!(!state.deliver("token", output("late")));
    assert!(matches!(
        waiting.try_recv(),
        Err(tokio::sync::oneshot::error::TryRecvError::Closed)
    ));
}

#[test]
fn stop_before_send_stops_the_turn_as_it_begins() {
    let state = super::ChatState::new();
    state.stop("turn-1");
    let cancel = state.begin_turn("turn-1").unwrap();
    assert!(cancel.is_cancelled());
    state.end_turn("turn-1");

    // The early Stop is used up: the next turn runs.
    assert!(!state.begin_turn("turn-2").unwrap().is_cancelled());
}

#[test]
fn stop_during_the_turn_stops_it() {
    let state = super::ChatState::new();
    let cancel = state.begin_turn("turn-1").unwrap();
    assert!(!cancel.is_cancelled());
    state.stop("turn-1");
    assert!(cancel.is_cancelled());
}

#[test]
fn a_stale_stop_leaves_a_newer_turn_running() {
    let state = super::ChatState::new();
    state.begin_turn("old").unwrap();
    state.end_turn("old");
    let cancel = state.begin_turn("new").unwrap();

    // Stop for the old turn arrives late.
    state.stop("old");
    assert!(!cancel.is_cancelled());
    state.end_turn("new");
    assert!(!state.begin_turn("old-again").unwrap().is_cancelled());
}

#[test]
fn only_the_latest_early_stop_is_kept() {
    let state = super::ChatState::new();
    state.stop("turn-1");
    state.stop("turn-2");
    assert!(!state.begin_turn("turn-1").unwrap().is_cancelled());
    state.end_turn("turn-1");
    assert!(state.begin_turn("turn-2").unwrap().is_cancelled());
}

#[tokio::test]
async fn a_turn_stopped_before_it_begins_sends_no_request() {
    let server = serve(|_| Reply::Stream(vec![text("Should not be sent.")]));
    let cancel = CancellationToken::new();
    cancel.cancel();
    let host = TestHost::default();
    let (chat, end) = run(&server, &host, cancel).await;

    assert_eq!(end, TurnEnd::Stopped);
    assert!(server.requests.lock().unwrap().is_empty());
    assert_eq!(
        chat.messages.last(),
        Some(&Message::Notice {
            level: NoticeLevel::Info,
            text: "Stopped.".into()
        })
    );
}

fn fake_backend(server: &FakeServer, chat: &Chat) -> Backend {
    Backend::OpenAi(Endpoint {
        client: reqwest::Client::new(),
        base_url: server.url.clone(),
        label: "Fake",
        api_key: KEY.into(),
        model: "fake-model".into(),
        session: Some(chat.id.clone()),
    })
}

// Sends `text` in `chat` the way `chat_send` does: the turn, then the title.
async fn answer(server: &FakeServer, host: &TestHost, chat: &mut Chat, text: &str) -> TurnEnd {
    let backend = fake_backend(server, chat);
    chat.push(Message::User { text: text.into() });
    let mut turn = Turn {
        chat,
        system: "You help with a campaign.".into(),
        tools: vec![roll_tool()],
        cancel: CancellationToken::new(),
    };
    super::agent::answer(&backend, &mut turn, host).await
}

fn title_reply(title: &str) -> Reply {
    Reply::Status(
        200,
        json!({
            "choices": [{ "index": 0, "message": { "role": "assistant", "content": title } }],
            "usage": { "prompt_tokens": 40, "completion_tokens": 5 },
        })
        .to_string(),
    )
}

#[tokio::test]
async fn the_first_reply_titles_the_chat_once() {
    // Requests: turn 1, its title, turn 2.
    let server = serve(|n| match n {
        1 => title_reply("\"Ambush at the ogre camp tonight, with traps.\""),
        _ => Reply::Stream(vec![text("The ogres wait."), usage(100, 20)]),
    });
    let host = TestHost::default();
    let mut chat = Chat::new(BackendId::OpencodeGo, "fake-model");

    let end = answer(&server, &host, &mut chat, "Plan an ambush\nat the camp").await;

    assert_eq!(end, TurnEnd::Done);
    assert_eq!(chat.title, "Ambush at the ogre camp tonight");
    assert_eq!(
        host.saved.lock().unwrap().as_ref().unwrap().title,
        chat.title
    );
    assert_eq!(
        chat.usage,
        Usage {
            input_tokens: 140,
            output_tokens: 25
        }
    );
    {
        let requests = server.requests.lock().unwrap();
        assert_eq!(requests.len(), 2);
        let body = &requests[1].body;
        assert_eq!(body["model"], "fake-model");
        assert_eq!(body["stream"], false);
        assert!(body.get("tools").is_none());
        let asked = body["messages"][1]["content"].as_str().unwrap();
        assert!(asked.contains("Plan an ambush"), "{asked}");
        assert!(asked.contains("The ogres wait."), "{asked}");
        assert_eq!(requests[1].authorization, format!("Bearer {KEY}"));
    }

    answer(&server, &host, &mut chat, "And the traps?").await;
    assert_eq!(server.requests.lock().unwrap().len(), 3);
    assert_eq!(chat.title, "Ambush at the ogre camp tonight");
}

#[tokio::test]
async fn a_renamed_chat_is_not_titled() {
    let server = serve(|n| match n {
        0 => Reply::Stream(vec![text("The ogres wait.")]),
        _ => title_reply("Ogre ambush"),
    });
    let host = TestHost::default();
    let mut chat = Chat::new(BackendId::OpencodeGo, "fake-model");
    chat.title = "My ambush".into();
    chat.renamed = true;

    answer(&server, &host, &mut chat, "Plan an ambush").await;

    assert_eq!(server.requests.lock().unwrap().len(), 1);
    assert_eq!(chat.title, "My ambush");
}

#[tokio::test]
async fn a_failed_title_request_keeps_the_first_line_title() {
    for title in [
        Reply::Status(500, r#"{"error":{"message":"down"}}"#.into()),
        title_reply("  "),
    ] {
        let title = std::sync::Mutex::new(Some(title));
        let server = serve(move |n| match n {
            0 => Reply::Stream(vec![text("The ogres wait.")]),
            _ => title.lock().unwrap().take().unwrap(),
        });
        let host = TestHost::default();
        let mut chat = Chat::new(BackendId::OpencodeGo, "fake-model");

        let end = answer(&server, &host, &mut chat, "Plan an ambush\nat the camp").await;

        assert_eq!(end, TurnEnd::Done);
        assert_eq!(server.requests.lock().unwrap().len(), 2);
        assert_eq!(chat.title, "Plan an ambush");
        assert!(!host.events_json().contains("down"));
    }
}

#[tokio::test]
async fn a_turn_without_a_reply_is_not_titled_and_the_next_reply_is() {
    // Turn 1 fails, turn 2 answers, then its title.
    let server = serve(|n| match n {
        0 => Reply::Status(500, r#"{"error":{"message":"down"}}"#.into()),
        1 => Reply::Stream(vec![text("The ogres wait.")]),
        _ => title_reply("Ogre ambush"),
    });
    let host = TestHost::default();
    let mut chat = Chat::new(BackendId::OpencodeGo, "fake-model");

    assert_eq!(
        answer(&server, &host, &mut chat, "Plan an ambush").await,
        TurnEnd::Failed
    );
    assert_eq!(server.requests.lock().unwrap().len(), 1);
    answer(&server, &host, &mut chat, "Try again").await;
    assert_eq!(server.requests.lock().unwrap().len(), 3);
    assert_eq!(chat.title, "Ogre ambush");
}

#[tokio::test]
async fn a_partial_failed_first_reply_still_lets_the_next_reply_title_the_chat() {
    // Requests: turn 1 is cut off after some text, turn 2 answers, its
    // title, then turn 3.
    let server = serve(|n| match n {
        0 => Reply::RawStream(reply_with_partial_text_then("")),
        1 => Reply::Stream(vec![text("The ogres wait.")]),
        2 => title_reply("Ogre ambush"),
        _ => Reply::Stream(vec![text("They charge.")]),
    });
    let host = TestHost::default();
    let mut chat = Chat::new(BackendId::OpencodeGo, "fake-model");

    let end = answer(&server, &host, &mut chat, "Plan an ambush").await;
    assert_eq!(end, TurnEnd::Failed);
    assert!(chat
        .messages
        .iter()
        .any(|m| matches!(m, Message::Assistant { text, .. } if text == "Partial")));
    assert_eq!(server.requests.lock().unwrap().len(), 1);

    answer(&server, &host, &mut chat, "Try again").await;
    assert_eq!(server.requests.lock().unwrap().len(), 3);
    assert_eq!(chat.title, "Ogre ambush");
    let asked = server.requests.lock().unwrap()[2].body["messages"][1]["content"]
        .as_str()
        .unwrap()
        .to_string();
    assert!(asked.contains("The ogres wait."), "{asked}");

    answer(&server, &host, &mut chat, "And then?").await;
    assert_eq!(server.requests.lock().unwrap().len(), 4);
}
