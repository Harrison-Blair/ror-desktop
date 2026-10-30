// Runs turns against a fake OpenAI-compatible server on 127.0.0.1.

use super::agent::{
    Backend, ChatEvent, ToolOutput, ToolSpec, Turn, TurnEnd, TurnHost, MAX_TOOL_CALLS,
};
use super::openai::Endpoint;
use super::store::{BackendId, Chat, Message, NoticeLevel, ToolCall, Usage};
use crate::config::CustomProvider;
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
    user_agent: String,
    body: Value,
}

struct FakeServer {
    url: String,
    requests: Arc<Mutex<Vec<Request>>>,
}

// Answers the nth request with `reply(n)`.
fn serve(reply: impl Fn(usize) -> Reply + Send + 'static) -> FakeServer {
    serve_requests(move |n, _| reply(n))
}

// Answers the nth request with `reply(n, request)`.
fn serve_requests(reply: impl Fn(usize, &Request) -> Reply + Send + 'static) -> FakeServer {
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let url = format!("http://{}/v1", listener.local_addr().unwrap());
    let requests = Arc::new(Mutex::new(Vec::new()));
    let seen = requests.clone();
    std::thread::spawn(move || {
        for (n, stream) in listener.incoming().enumerate() {
            let mut stream = stream.unwrap();
            let mut reader = BufReader::new(stream.try_clone().unwrap());
            let (mut length, mut authorization, mut session, mut user_agent) =
                (0, String::new(), String::new(), String::new());
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
                    "user-agent" => user_agent = value.trim().to_string(),
                    _ => {}
                }
            }
            let mut body = vec![0; length];
            reader.read_exact(&mut body).unwrap();
            let request = Request {
                authorization,
                session,
                user_agent,
                body: serde_json::from_slice(&body).unwrap_or(Value::Null),
            };
            let reply = reply(n, &request);
            seen.lock().unwrap().push(request);
            let response = match reply {
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
        label: "Fake".into(),
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
        label: "Fake".into(),
        api_key: KEY.into(),
        model: String::new(),
        session: None,
    };
    assert_eq!(
        super::openai::list_models(&endpoint, super::openai::MODELS_TIMEOUT)
            .await
            .unwrap(),
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

// Runs one turn on `endpoint` and returns the requests it made.
async fn one_turn(backend: BackendId, endpoint: Endpoint, server: &FakeServer) -> Chat {
    let mut chat = Chat::new(backend, &endpoint.model);
    let mut turn = Turn {
        chat: &mut chat,
        system: String::new(),
        tools: Vec::new(),
        cancel: CancellationToken::new(),
    };
    turn.push(&TestHost::default(), Message::User { text: "Hi".into() });
    let end = Backend::OpenAi(endpoint)
        .run_turn(&mut turn, &TestHost::default())
        .await;
    assert_eq!(end, TurnEnd::Done);
    assert_eq!(server.requests.lock().unwrap().len(), 1);
    chat
}

fn ollama(url: &str) -> CustomProvider {
    CustomProvider {
        name: "Ollama".into(),
        base_url: url.into(),
    }
}

#[tokio::test]
async fn the_custom_provider_gets_no_opencode_session_and_no_key_when_it_has_none() {
    let server = serve(|_| Reply::Stream(vec![text("Hello.")]));
    let endpoint = super::endpoint(
        &super::http_client(),
        BackendId::Custom,
        Some(ollama(&server.url)),
        None,
        "llama3",
        Some("chat-id".into()),
    )
    .unwrap();
    assert_eq!(endpoint.label, "Ollama");
    one_turn(BackendId::Custom, endpoint, &server).await;

    let requests = server.requests.lock().unwrap();
    assert_eq!(requests[0].session, "");
    assert_eq!(requests[0].authorization, "");
    assert!(requests[0].user_agent.starts_with("ror-desktop/"));
    assert_eq!(requests[0].body["model"], "llama3");
}

#[tokio::test]
async fn the_custom_provider_key_is_sent_when_saved() {
    let server = serve(|_| Reply::Stream(vec![text("Hello.")]));
    let endpoint = super::endpoint(
        &super::http_client(),
        BackendId::Custom,
        Some(ollama(&server.url)),
        Some(KEY.into()),
        "m",
        Some("chat-id".into()),
    )
    .unwrap();
    one_turn(BackendId::Custom, endpoint, &server).await;
    let requests = server.requests.lock().unwrap();
    assert_eq!(requests[0].authorization, format!("Bearer {KEY}"));
    assert_eq!(requests[0].session, "");
}

#[tokio::test]
async fn opencode_go_gets_its_session_header_and_the_user_agent() {
    let server = serve(|_| Reply::Stream(vec![text("Hello.")]));
    let mut endpoint = super::endpoint(
        &super::http_client(),
        BackendId::OpencodeGo,
        Some(ollama("http://unused")),
        Some(KEY.into()),
        "glm-5.3",
        Some("chat-id".into()),
    )
    .unwrap();
    assert_eq!(endpoint.base_url, super::openai::OPENCODE_GO_URL);
    endpoint.base_url = server.url.clone();
    one_turn(BackendId::OpencodeGo, endpoint, &server).await;
    let requests = server.requests.lock().unwrap();
    assert_eq!(requests[0].session, "chat-id");
    assert!(requests[0].user_agent.starts_with("ror-desktop/"));
}

#[test]
fn an_endpoint_needs_its_key_or_provider() {
    let client = super::http_client();
    let error = |backend, custom| {
        super::endpoint(&client, backend, custom, None, "m", None)
            .err()
            .unwrap()
    };
    assert_eq!(
        error(BackendId::OpencodeGo, Some(ollama("http://x"))),
        "Add an OpenCode Go key in the model menu."
    );
    assert_eq!(
        error(BackendId::Custom, None),
        "Add a custom provider in the model menu."
    );
}

#[test]
fn a_base_url_must_be_http_or_https() {
    assert_eq!(
        super::base_url(" http://localhost:11434/v1/ ").unwrap(),
        "http://localhost:11434/v1"
    );
    assert_eq!(
        super::base_url("https://api.example.com/v1").unwrap(),
        "https://api.example.com/v1"
    );
    for url in [
        "",
        "localhost:11434",
        "file:///etc",
        "ftp://x.y",
        "javascript:alert(1)",
        "http://",
    ] {
        assert_eq!(
            super::base_url(url),
            Err("Enter an http or https URL, such as http://localhost:11434/v1.".to_string()),
            "{url}"
        );
    }
}

#[test]
fn a_base_url_has_no_key_query_or_fragment() {
    for url in ["https://user:secret@host/v1", "https://user@host/v1"] {
        assert_eq!(
            super::base_url(url),
            Err("Put the key in the API key field, not in the URL.".to_string()),
            "{url}"
        );
    }
    for url in [
        "https://host/v1?foo=bar",
        "https://host/v1#top",
        "https://host/v1?",
    ] {
        assert_eq!(
            super::base_url(url),
            Err(
                "Enter the base URL without a ? or # part, such as http://localhost:11434/v1."
                    .to_string()
            ),
            "{url}"
        );
    }
}

// Runs `work` on its own thread and fails the test if it takes longer than
// `limit`, so a hang fails instead of stalling the test run.
fn within<T: Send + 'static>(
    limit: std::time::Duration,
    work: impl FnOnce() -> T + Send + 'static,
) -> T {
    let (done, result) = std::sync::mpsc::channel();
    std::thread::spawn(move || {
        let _ = done.send(work());
    });
    result
        .recv_timeout(limit)
        .unwrap_or_else(|e| panic!("not done within {limit:?}: {e}"))
}

#[test]
fn a_stalled_model_list_gives_up_after_the_timeout() {
    assert_eq!(
        super::openai::MODELS_TIMEOUT,
        std::time::Duration::from_secs(10)
    );
    // Takes connections and never answers.
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let url = format!("http://{}/v1", listener.local_addr().unwrap());
    std::thread::spawn(move || {
        let held: Vec<_> = listener.incoming().collect();
        drop(held);
    });
    let endpoint = super::endpoint(
        &super::http_client(),
        BackendId::Custom,
        Some(ollama(&url)),
        None,
        "",
        None,
    )
    .unwrap();
    let error = within(std::time::Duration::from_secs(2), move || {
        tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .unwrap()
            .block_on(super::openai::list_models(
                &endpoint,
                std::time::Duration::from_millis(300),
            ))
    })
    .unwrap_err();
    assert_eq!(
        error,
        "Ollama took longer than 0.3 seconds to list its models."
    );
}

// The custom provider's config and its keychain entry change together.
mod custom_provider {
    use super::super::{custom_key, remove_custom, save_custom, BETWEEN_STEPS, CUSTOM};
    use crate::config;
    use crate::secrets;
    use std::path::PathBuf;

    const A: &str = "http://a.test/v1";
    const B: &str = "http://b.test/v1";

    struct Setup {
        _temp: tempfile::TempDir,
        file: PathBuf,
    }

    // A config with no provider and a keychain with no custom key.
    fn setup() -> Setup {
        let temp = tempfile::tempdir().unwrap();
        let file = temp.path().join("config.json");
        secrets::remove("custom").unwrap();
        Setup { _temp: temp, file }
    }

    impl Setup {
        // The config can be read but no longer written.
        fn break_writes(&self) {
            std::fs::create_dir(self.file.with_extension("json.tmp")).unwrap();
        }

        fn provider_url(&self) -> Option<String> {
            config::load(&self.file).custom_provider.map(|p| p.base_url)
        }

        // The key a request to `url` gets.
        fn key_for(&self, url: &str) -> Option<String> {
            custom_key(secrets::get("custom").unwrap(), url)
        }
    }

    #[test]
    fn a_saved_key_is_sent_only_to_its_url() {
        let s = setup();
        save_custom(&s.file, "A", A, Some(" sk-a ".into())).unwrap();
        assert_eq!(s.provider_url().as_deref(), Some(A));
        assert_eq!(s.key_for(A).as_deref(), Some("sk-a"));
        assert_eq!(s.key_for(B), None);

        // Edit with an empty key keeps the key, now for the new URL.
        save_custom(&s.file, "B", B, None).unwrap();
        assert_eq!(s.key_for(B).as_deref(), Some("sk-a"));
        assert_eq!(s.key_for(A), None);
    }

    #[test]
    fn a_failed_save_puts_the_old_key_back() {
        let s = setup();
        save_custom(&s.file, "A", A, Some("sk-a".into())).unwrap();
        s.break_writes();

        assert!(save_custom(&s.file, "B", B, Some("sk-b".into()))
            .unwrap_err()
            .starts_with("Couldn't save the provider:"));
        assert_eq!(s.provider_url().as_deref(), Some(A));
        assert_eq!(s.key_for(A).as_deref(), Some("sk-a"));
    }

    #[test]
    fn when_the_key_cannot_go_back_the_new_key_is_not_sent_to_the_old_url() {
        let s = setup();
        save_custom(&s.file, "A", A, Some("sk-a".into())).unwrap();
        s.break_writes();
        // The new key saves; putting the old one back fails.
        secrets::fail("set", 1);

        assert!(save_custom(&s.file, "B", B, Some("sk-b".into())).is_err());
        assert_eq!(s.provider_url().as_deref(), Some(A));
        assert_eq!(s.key_for(A), None);
    }

    #[test]
    fn a_failed_first_save_leaves_no_key() {
        let s = setup();
        s.break_writes();
        assert!(save_custom(&s.file, "A", A, Some("sk-a".into())).is_err());
        assert_eq!(s.provider_url(), None);
        assert_eq!(secrets::get("custom").unwrap(), None);
    }

    #[test]
    fn a_key_left_by_a_failed_first_save_is_reported_and_cleared_later() {
        let s = setup();
        s.break_writes();
        // Taking the new key back out fails too.
        secrets::fail("remove", 0);
        let error = save_custom(&s.file, "A", A, Some("sk-a".into())).unwrap_err();
        assert!(
            error.contains("Its key also couldn't be put back")
                && error.ends_with("Save the provider again, or remove it to delete the key."),
            "{error}"
        );
        assert_eq!(s.provider_url(), None);
        assert_eq!(s.key_for(A).as_deref(), Some("sk-a"));
        std::fs::remove_dir(s.file.with_extension("json.tmp")).unwrap();

        // Remove deletes it, with no provider saved.
        remove_custom(&s.file).unwrap();
        assert_eq!(secrets::get("custom").unwrap(), None);

        // So does the next save without a key.
        s.break_writes();
        secrets::fail("remove", 0);
        save_custom(&s.file, "A", A, Some("sk-a".into())).unwrap_err();
        std::fs::remove_dir(s.file.with_extension("json.tmp")).unwrap();
        save_custom(&s.file, "A", A, None).unwrap();
        assert_eq!(secrets::get("custom").unwrap(), None);
    }

    // True while another save or remove would have to wait.
    fn locked() -> bool {
        matches!(CUSTOM.try_lock(), Err(std::sync::TryLockError::WouldBlock))
    }

    #[test]
    fn save_and_remove_hold_the_lock_across_both_steps() {
        let s = setup();
        let held = std::rc::Rc::new(std::cell::Cell::new(None));
        let seen = held.clone();
        BETWEEN_STEPS.set(Some(Box::new(move || seen.set(Some(locked())))));
        save_custom(&s.file, "A", A, Some("sk-a".into())).unwrap();
        assert_eq!(held.take(), Some(true));
        remove_custom(&s.file).unwrap();
        assert_eq!(held.take(), Some(true));
        BETWEEN_STEPS.set(None);
    }

    #[test]
    fn a_remove_during_a_save_waits_for_it() {
        let s = setup();
        save_custom(&s.file, "A", A, Some("sk-a".into())).unwrap();
        let file = s.file.clone();
        let remover = std::rc::Rc::new(std::cell::RefCell::new(None));
        let started = remover.clone();
        // While the save is between its steps, a remove starts on another
        // thread that shares this test's keychain.
        BETWEEN_STEPS.set(Some(Box::new(move || {
            let file = file.clone();
            let name = std::thread::current().name().unwrap().to_string();
            let handle = std::thread::Builder::new()
                .name(name)
                .spawn(move || remove_custom(&file))
                .unwrap();
            std::thread::sleep(std::time::Duration::from_millis(200));
            // The remove hasn't touched the new key.
            assert_eq!(
                custom_key(secrets::get("custom").unwrap(), B).as_deref(),
                Some("sk-b")
            );
            *started.borrow_mut() = Some(handle);
        })));
        save_custom(&s.file, "B", B, Some("sk-b".into())).unwrap();
        BETWEEN_STEPS.set(None);
        let handle = remover.borrow_mut().take().unwrap();
        handle.join().unwrap().unwrap();

        // The remove ran after the save: nothing is left.
        assert_eq!(s.provider_url(), None);
        assert_eq!(secrets::get("custom").unwrap(), None);
    }

    #[test]
    fn a_new_provider_without_a_key_drops_a_key_left_from_before() {
        let s = setup();
        secrets::set("custom", &format!(r#"{{"baseUrl":"{A}","key":"sk-old"}}"#)).unwrap();
        save_custom(&s.file, "A", A, None).unwrap();
        assert_eq!(secrets::get("custom").unwrap(), None);
    }

    #[test]
    fn a_failed_key_save_changes_nothing() {
        let s = setup();
        save_custom(&s.file, "A", A, Some("sk-a".into())).unwrap();
        secrets::fail("set", 0);
        assert!(save_custom(&s.file, "B", B, Some("sk-b".into())).is_err());
        assert_eq!(s.provider_url().as_deref(), Some(A));
        assert_eq!(s.key_for(A).as_deref(), Some("sk-a"));
    }

    #[test]
    fn remove_takes_the_key_first_and_keeps_the_provider_when_that_fails() {
        let s = setup();
        save_custom(&s.file, "A", A, Some("sk-a".into())).unwrap();
        secrets::fail("remove", 0);
        assert!(remove_custom(&s.file).is_err());
        assert_eq!(s.provider_url().as_deref(), Some(A));
        assert_eq!(s.key_for(A).as_deref(), Some("sk-a"));

        // The config can't change: the key is gone, the provider stays.
        s.break_writes();
        assert!(remove_custom(&s.file)
            .unwrap_err()
            .ends_with("Its key was removed."));
        assert_eq!(s.provider_url().as_deref(), Some(A));
        assert_eq!(secrets::get("custom").unwrap(), None);

        std::fs::remove_dir(s.file.with_extension("json.tmp")).unwrap();
        remove_custom(&s.file).unwrap();
        assert_eq!(s.provider_url(), None);
    }
}

fn fake_backend(server: &FakeServer, chat: &Chat) -> Backend {
    Backend::OpenAi(Endpoint {
        client: reqwest::Client::new(),
        base_url: server.url.clone(),
        label: "Fake".into(),
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
async fn a_custom_provider_chat_is_titled_without_an_opencode_session() {
    let server = serve(|n| match n {
        0 => Reply::Stream(vec![text("The ogres wait.")]),
        _ => title_reply("Ogre ambush"),
    });
    let host = TestHost::default();
    let mut chat = Chat::new(BackendId::Custom, "llama3");
    // The endpoint `chat_send` builds for a custom provider chat.
    let backend = Backend::OpenAi(
        super::endpoint(
            &super::http_client(),
            BackendId::Custom,
            Some(ollama(&server.url)),
            Some(KEY.into()),
            "llama3",
            Some(chat.id.clone()),
        )
        .unwrap(),
    );
    chat.push(Message::User {
        text: "Plan an ambush".into(),
    });
    let mut turn = Turn {
        chat: &mut chat,
        system: String::new(),
        tools: Vec::new(),
        cancel: CancellationToken::new(),
    };

    super::agent::answer(&backend, &mut turn, &host).await;

    assert_eq!(chat.title, "Ogre ambush");
    let requests = server.requests.lock().unwrap();
    assert_eq!(requests.len(), 2);
    assert_eq!(requests[1].body["stream"], false);
    assert_eq!(requests[1].body["model"], "llama3");
    assert_eq!(requests[1].session, "");
    assert_eq!(requests[1].authorization, format!("Bearer {KEY}"));
}

#[tokio::test]
async fn a_keyless_custom_provider_chat_is_titled_without_an_authorization_header() {
    // Like a local server that refuses any key it wasn't set up with.
    let server = serve_requests(|n, request| {
        if !request.authorization.is_empty() {
            Reply::Status(401, r#"{"error":{"message":"bad key"}}"#.into())
        } else if n == 0 {
            Reply::Stream(vec![text("The ogres wait.")])
        } else {
            title_reply("Ogre ambush")
        }
    });
    let host = TestHost::default();
    let mut chat = Chat::new(BackendId::Custom, "llama3");
    let backend = Backend::OpenAi(
        super::endpoint(
            &super::http_client(),
            BackendId::Custom,
            Some(ollama(&server.url)),
            None,
            "llama3",
            Some(chat.id.clone()),
        )
        .unwrap(),
    );
    chat.push(Message::User {
        text: "Plan an ambush".into(),
    });
    let mut turn = Turn {
        chat: &mut chat,
        system: String::new(),
        tools: Vec::new(),
        cancel: CancellationToken::new(),
    };

    assert_eq!(
        super::agent::answer(&backend, &mut turn, &host).await,
        TurnEnd::Done
    );

    assert_eq!(server.requests.lock().unwrap().len(), 2);
    assert_eq!(chat.title, "Ogre ambush");
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
