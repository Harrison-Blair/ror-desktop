// What every chat backend shares: the turn, its events, and how tools run.
//
// A backend runs one turn: it asks the model, streams the reply, and runs the
// model's tool calls through the host until the model answers. The host
// connects the turn to the app (the webview in the app, a fake in tests).

use super::openai;
use super::store::{Chat, Message, NoticeLevel, ToolCall, Usage};
use serde::{Deserialize, Serialize};
use std::future::Future;
use tokio_util::sync::CancellationToken;

/// The most tool calls one turn can run.
pub const MAX_TOOL_CALLS: usize = 25;

/// The notice at the end of a stopped turn.
pub const STOPPED: &str = "Stopped.";

/// A tool the model can call, as the webview's registry describes it.
#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolSpec {
    pub name: String,
    pub description: String,
    pub input_schema: serde_json::Value,
}

/// What a tool returned, or why it didn't run.
#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolOutput {
    pub content: String,
    pub is_error: bool,
}

/// Sent to the webview while a turn runs. Never carries a key.
#[derive(Clone, Debug, Serialize)]
#[serde(
    tag = "type",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum ChatEvent {
    /// Part of the assistant's text, as it streams.
    TextDelta {
        text: String,
    },
    /// A message added to the chat.
    Message {
        message: Message,
    },
    /// The model called a tool. The webview runs it and returns the result
    /// with `chat_tool_result` and `token`, which names this call in this
    /// turn only.
    ToolCall {
        call: ToolCall,
        token: String,
    },
    Usage {
        usage: Usage,
    },
    /// An error the user should see outside the thread.
    Toast {
        message: String,
    },
}

#[derive(Clone, Copy, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum TurnEnd {
    /// The model answered.
    Done,
    /// The user pressed Stop.
    Stopped,
    ToolLimit,
    Failed,
}

pub trait TurnHost {
    fn emit(&self, event: ChatEvent);
    fn save(&self, chat: &Chat);
    /// Waits for the result of `call`, which the webview returns with `token`.
    fn run_tool(&self, call: &ToolCall, token: &str) -> impl Future<Output = ToolOutput> + Send;
}

pub struct Turn<'a> {
    pub chat: &'a mut Chat,
    pub system: String,
    pub tools: Vec<ToolSpec>,
    pub cancel: CancellationToken,
}

impl Turn<'_> {
    /// Adds a message, tells the webview, and saves the chat.
    pub fn push(&mut self, host: &impl TurnHost, message: Message) {
        self.chat.push(message.clone());
        host.emit(ChatEvent::Message { message });
        host.save(self.chat);
    }

    pub fn notice(&mut self, host: &impl TurnHost, level: NoticeLevel, text: &str) {
        self.push(
            host,
            Message::Notice {
                level,
                text: text.to_string(),
            },
        );
    }

    /// Answers calls that will not run, so the next request has a result
    /// for every call.
    pub fn skip_calls(&mut self, host: &impl TurnHost, calls: &[ToolCall], reason: &str) {
        for call in calls {
            self.push(
                host,
                Message::Tool {
                    call_id: call.id.clone(),
                    name: call.name.clone(),
                    content: reason.to_string(),
                    is_error: true,
                },
            );
        }
    }
}

/// How a chat reaches its model. Wave 3 adds Codex here.
pub enum Backend {
    /// OpenCode Go or the custom provider: both speak the OpenAI API.
    OpenAi(openai::Endpoint),
}

impl Backend {
    pub async fn run_turn(&self, turn: &mut Turn<'_>, host: &impl TurnHost) -> TurnEnd {
        match self {
            Backend::OpenAi(endpoint) => openai::run_turn(endpoint, turn, host).await,
        }
    }

    /// A short title for the chat from its first exchange, and the tokens
    /// the request used. Uses no tools.
    pub async fn title(&self, chat: &Chat) -> Result<(String, Usage), String> {
        match self {
            Backend::OpenAi(endpoint) => openai::title(endpoint, chat).await,
        }
    }
}

// Whether a turn in the chat ended with the model's answer. A turn that
// failed or stopped ends with a notice, even when it saved some text.
fn has_answered_turn(chat: &Chat) -> bool {
    let messages = &chat.messages;
    messages.iter().enumerate().any(|(i, message)| {
        matches!(message, Message::Assistant { .. })
            && matches!(messages.get(i + 1), None | Some(Message::User { .. }))
    })
}

/// Runs the turn. When it is the chat's first turn that ends with an
/// answer, the chat is titled.
pub async fn answer(backend: &Backend, turn: &mut Turn<'_>, host: &impl TurnHost) -> TurnEnd {
    let answered = has_answered_turn(turn.chat);
    let end = backend.run_turn(turn, host).await;
    if end == TurnEnd::Done && !answered && has_answered_turn(turn.chat) {
        auto_title(backend, turn, host).await;
    }
    end
}

// A chat the user renamed keeps its name, and a failed request keeps the
// title it had.
async fn auto_title(backend: &Backend, turn: &mut Turn<'_>, host: &impl TurnHost) {
    if turn.chat.renamed {
        return;
    }
    let cancel = turn.cancel.clone();
    let result = tokio::select! {
        biased;
        () = cancel.cancelled() => return,
        result = backend.title(turn.chat) => result,
    };
    let Ok((title, usage)) = result else {
        return;
    };
    turn.chat.title = title;
    turn.chat.usage.input_tokens += usage.input_tokens;
    turn.chat.usage.output_tokens += usage.output_tokens;
    host.emit(ChatEvent::Usage {
        usage: turn.chat.usage,
    });
    host.save(turn.chat);
}
