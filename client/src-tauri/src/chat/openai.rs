// A backend for OpenAI-compatible chat completions APIs, such as OpenCode Go.
// It streams each reply and runs the model's tool calls between requests.

use super::agent::{ChatEvent, Turn, TurnEnd, TurnHost, MAX_TOOL_CALLS, STOPPED};
use super::store::{Chat, Message, NoticeLevel, ToolCall, Usage};
use serde_json::{json, Value};
use std::time::Duration;

pub const OPENCODE_GO_URL: &str = "https://opencode.ai/zen/go/v1";
pub const OPENCODE_GO_LABEL: &str = "OpenCode Go";
/// How long a model list may take. After it, the menu offers a typed model id.
pub const MODELS_TIMEOUT: Duration = Duration::from_secs(10);

/// Where requests go. Holds the API key, so it is never serialized.
pub struct Endpoint {
    pub client: reqwest::Client,
    pub base_url: String,
    pub label: String,
    /// Empty when the provider needs no key.
    pub api_key: String,
    pub model: String,
    /// Sent as `x-opencode-session`, so OpenCode Go can route and cache each
    /// conversation. Set for OpenCode Go only.
    pub session: Option<String>,
}

impl Endpoint {
    fn url(&self, path: &str) -> String {
        format!("{}/{path}", self.base_url.trim_end_matches('/'))
    }

    // Sends the key only when there is one: some providers need none.
    fn authorize(&self, request: reqwest::RequestBuilder) -> reqwest::RequestBuilder {
        if self.api_key.is_empty() {
            request
        } else {
            request.bearer_auth(&self.api_key)
        }
    }

    // Keeps the key out of error text, even if a provider echoes it back.
    // Success payloads are not redacted: the provider already holds the key,
    // so its echo of the key is outside the threat model.
    fn redact(&self, text: &str) -> String {
        if self.api_key.is_empty() {
            return text.to_string();
        }
        text.replace(&self.api_key, "[key]")
    }

    fn http_error(&self, status: reqwest::StatusCode, body: &str) -> String {
        let label = &self.label;
        let code = status.as_u16();
        let text = match code {
            401 | 403 => {
                format!("{label} refused the key (HTTP {code}). Check the key in Settings.")
            }
            429 => format!("{label} is rate limiting requests (HTTP 429). Try again later."),
            _ => {
                let detail = serde_json::from_str::<Value>(body)
                    .ok()
                    .and_then(|v| v["error"]["message"].as_str().map(str::to_string))
                    .unwrap_or_else(|| body.chars().take(300).collect());
                format!("{label} returned HTTP {code}: {}", detail.trim())
            }
        };
        self.redact(&text)
    }

    // When the provider can't be reached, the first line says so plainly and
    // the second holds the technical detail. The chat recognises this first
    // line and shows the detail muted, so keep the two in step.
    fn send_error(&self, e: &reqwest::Error) -> String {
        if !e.is_connect() && !e.is_timeout() {
            return self.redact(&format!("Couldn't reach {}: {e}", self.label));
        }
        let mut detail = e.to_string();
        let mut source = std::error::Error::source(e);
        while let Some(cause) = source {
            detail.push_str(&format!(": {cause}"));
            source = cause.source();
        }
        self.redact(&format!("Could not reach {}.\n{detail}", self.label))
    }
}

/// The ids of the models the endpoint offers.
pub async fn list_models(endpoint: &Endpoint, timeout: Duration) -> Result<Vec<String>, String> {
    let error = |e: reqwest::Error| {
        if e.is_timeout() {
            format!(
                "{} took longer than {} seconds to list its models.",
                endpoint.label,
                timeout.as_secs_f32()
            )
        } else {
            endpoint.send_error(&e)
        }
    };
    let response = endpoint
        .authorize(endpoint.client.get(endpoint.url("models")))
        .timeout(timeout)
        .send()
        .await
        .map_err(error)?;
    let status = response.status();
    let body = response.text().await.map_err(error)?;
    if !status.is_success() {
        return Err(endpoint.http_error(status, &body));
    }
    let value: Value = serde_json::from_str(&body)
        .map_err(|_| format!("{} sent a model list that isn't JSON.", endpoint.label))?;
    Ok(value["data"]
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(|model| model["id"].as_str().map(str::to_string))
        .collect())
}

fn request_messages(system: &str, messages: &[Message]) -> Vec<Value> {
    let mut out = vec![json!({ "role": "system", "content": system })];
    for message in messages {
        out.push(match message {
            Message::User { text } => json!({ "role": "user", "content": text }),
            Message::Assistant {
                text,
                reasoning,
                tool_calls,
            } => {
                let mut value = json!({ "role": "assistant", "content": text });
                if !tool_calls.is_empty() {
                    value["tool_calls"] = tool_calls
                        .iter()
                        .map(|call| {
                            json!({
                                "id": call.id,
                                "type": "function",
                                "function": { "name": call.name, "arguments": call.arguments },
                            })
                        })
                        .collect();
                }
                if !reasoning.is_empty() {
                    value["reasoning_content"] = json!(reasoning);
                }
                value
            }
            Message::Tool {
                call_id, content, ..
            } => json!({ "role": "tool", "tool_call_id": call_id, "content": content }),
            Message::Notice { .. } => continue,
        });
    }
    out
}

fn request_body(endpoint: &Endpoint, turn: &Turn) -> Value {
    let mut body = json!({
        "model": endpoint.model,
        "messages": request_messages(&turn.system, &turn.chat.messages),
        "stream": true,
        "stream_options": { "include_usage": true },
    });
    if !turn.tools.is_empty() {
        body["tools"] = turn
            .tools
            .iter()
            .map(|tool| {
                json!({
                    "type": "function",
                    "function": {
                        "name": tool.name,
                        "description": tool.description,
                        "parameters": tool.input_schema,
                    },
                })
            })
            .collect();
    }
    body
}

/// One streamed reply. Filled as chunks arrive, so a stopped reply keeps
/// what came before Stop.
#[derive(Default)]
struct Reply {
    text: String,
    reasoning: String,
    calls: Vec<ToolCall>,
    input_tokens: u64,
    output_tokens: u64,
}

impl Reply {
    // Applies one `data:` payload. Returns an error the provider sent
    // inside the stream.
    fn apply(&mut self, data: &Value, host: &impl TurnHost) -> Result<(), String> {
        if let Some(message) = data["error"]["message"].as_str() {
            return Err(message.to_string());
        }
        if let Some(usage) = data.get("usage").filter(|u| u.is_object()) {
            self.input_tokens = usage["prompt_tokens"].as_u64().unwrap_or(0);
            self.output_tokens = usage["completion_tokens"].as_u64().unwrap_or(0);
        }
        let delta = &data["choices"][0]["delta"];
        if let Some(text) = delta["content"].as_str().filter(|t| !t.is_empty()) {
            self.text.push_str(text);
            host.emit(ChatEvent::TextDelta {
                text: text.to_string(),
            });
        }
        if let Some(text) = delta["reasoning_content"].as_str() {
            self.reasoning.push_str(text);
        }
        for part in delta["tool_calls"].as_array().into_iter().flatten() {
            let index = part["index"].as_u64().unwrap_or(0) as usize;
            while self.calls.len() <= index {
                self.calls.push(ToolCall {
                    id: String::new(),
                    name: String::new(),
                    arguments: String::new(),
                });
            }
            let call = &mut self.calls[index];
            if let Some(id) = part["id"].as_str() {
                call.id.push_str(id);
            }
            if let Some(name) = part["function"]["name"].as_str() {
                call.name.push_str(name);
            }
            if let Some(arguments) = part["function"]["arguments"].as_str() {
                call.arguments.push_str(arguments);
            }
        }
        Ok(())
    }

    fn finish_calls(&mut self) {
        for (i, call) in self.calls.iter_mut().enumerate() {
            if call.id.is_empty() {
                call.id = format!("call_{i}");
            }
            if call.arguments.trim().is_empty() {
                call.arguments = "{}".to_string();
            }
        }
    }
}

async fn stream_reply(
    endpoint: &Endpoint,
    body: &Value,
    reply: &mut Reply,
    host: &impl TurnHost,
) -> Result<(), String> {
    let mut request = endpoint.authorize(endpoint.client.post(endpoint.url("chat/completions")));
    if let Some(session) = &endpoint.session {
        request = request.header("x-opencode-session", session);
    }
    let mut response = request
        .header(reqwest::header::CONTENT_TYPE, "application/json")
        .body(body.to_string())
        .send()
        .await
        .map_err(|e| endpoint.send_error(&e))?;
    let status = response.status();
    if !status.is_success() {
        let body = response.text().await.unwrap_or_default();
        return Err(endpoint.http_error(status, &body));
    }
    // Server-sent events: `data: JSON` lines, ended by `data: [DONE]`.
    let mut pending = Vec::new();
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|e| endpoint.send_error(&e))?
    {
        pending.extend_from_slice(&chunk);
        while let Some(end) = pending.iter().position(|&b| b == b'\n') {
            let line: Vec<u8> = pending.drain(..=end).collect();
            let line = String::from_utf8_lossy(&line);
            let Some(data) = line.trim().strip_prefix("data:") else {
                continue;
            };
            let data = data.trim();
            if data == "[DONE]" {
                return Ok(());
            }
            if data.is_empty() {
                continue;
            }
            let value = serde_json::from_str::<Value>(data)
                .map_err(|_| format!("{} sent a reply that can't be read.", endpoint.label))?;
            reply
                .apply(&value, host)
                .map_err(|e| endpoint.redact(&format!("{}: {e}", endpoint.label)))?;
        }
    }
    // The stream closed without `[DONE]`, so the reply may be missing parts.
    Err(format!(
        "{} ended the reply before it was complete.",
        endpoint.label
    ))
}

pub(super) const TITLE_PROMPT: &str = "Write a title of at most 6 words for this conversation. \
Reply with the title only, without quotes.";
const TITLE_WORDS: usize = 6;
const TITLE_LENGTH: usize = 60;
// Enough of each message to say what the chat is about.
const TITLE_CONTEXT: usize = 2000;

// The first line of the model's answer, without quotes or Markdown marks,
// cut to the word and length limits. Not redacted: the provider already holds
// the key, so its echo of the key is outside the threat model.
pub(super) fn clean_title(text: &str) -> Option<String> {
    let line = text.lines().map(str::trim).find(|l| !l.is_empty())?;
    let line = line
        .trim_start_matches(['#', '*', '_', ' '])
        .trim_matches(['"', '\'', '*', '_', '`', '“', '”', ' ']);
    let words = line.split_whitespace().take(TITLE_WORDS);
    let title: String = words.collect::<Vec<_>>().join(" ");
    let title: String = title.chars().take(TITLE_LENGTH).collect();
    let title = title.trim_end_matches(['.', ',', ':', ';', ' ']);
    (!title.is_empty()).then(|| title.to_string())
}

/// What the title request sends: the chat's first exchange.
pub(super) fn title_exchange(chat: &Chat) -> String {
    let cut = |text: Option<&String>| -> String {
        text.map(|t| t.chars().take(TITLE_CONTEXT).collect())
            .unwrap_or_default()
    };
    // The first question and the answer that just ended the turn.
    let user = cut(chat.messages.iter().find_map(|m| match m {
        Message::User { text } => Some(text),
        _ => None,
    }));
    let assistant = cut(chat.messages.iter().rev().find_map(|m| match m {
        Message::Assistant { text, .. } if !text.is_empty() => Some(text),
        _ => None,
    }));
    format!("User: {user}\n\nAssistant: {assistant}")
}

/// Asks the chat's model for a short title for its first exchange, in one
/// request without tools.
pub async fn title(endpoint: &Endpoint, chat: &Chat) -> Result<(String, Usage), String> {
    let body = json!({
        "model": endpoint.model,
        "messages": [
            { "role": "system", "content": TITLE_PROMPT },
            { "role": "user", "content": title_exchange(chat) },
        ],
        "stream": false,
    });
    let mut request = endpoint.authorize(endpoint.client.post(endpoint.url("chat/completions")));
    if let Some(session) = &endpoint.session {
        request = request.header("x-opencode-session", session);
    }
    let response = request
        .header(reqwest::header::CONTENT_TYPE, "application/json")
        .body(body.to_string())
        .send()
        .await
        .map_err(|e| endpoint.send_error(&e))?;
    let status = response.status();
    let text = response.text().await.map_err(|e| endpoint.send_error(&e))?;
    if !status.is_success() {
        return Err(endpoint.http_error(status, &text));
    }
    let value: Value = serde_json::from_str(&text)
        .map_err(|_| format!("{} sent a title that isn't JSON.", endpoint.label))?;
    let title = value["choices"][0]["message"]["content"]
        .as_str()
        .and_then(clean_title)
        .ok_or_else(|| format!("{} sent no title.", endpoint.label))?;
    let usage = Usage {
        input_tokens: value["usage"]["prompt_tokens"].as_u64().unwrap_or(0),
        output_tokens: value["usage"]["completion_tokens"].as_u64().unwrap_or(0),
    };
    Ok((title, usage))
}

pub(super) const NOT_RUN_STOPPED: &str = "Not run: the user stopped the turn.";
pub(super) const NOT_RUN_LIMIT: &str = "Not run: the turn reached its tool call limit.";

pub async fn run_turn(endpoint: &Endpoint, turn: &mut Turn<'_>, host: &impl TurnHost) -> TurnEnd {
    let mut calls_run = 0;
    loop {
        let body = request_body(endpoint, turn);
        let mut reply = Reply::default();
        let cancel = turn.cancel.clone();
        let result = tokio::select! {
            // Stop wins over a reply or result that is ready at the same time.
            biased;
            () = cancel.cancelled() => None,
            result = stream_reply(endpoint, &body, &mut reply, host) => Some(result),
        };

        if reply.input_tokens + reply.output_tokens > 0 {
            turn.chat.usage.input_tokens += reply.input_tokens;
            turn.chat.usage.output_tokens += reply.output_tokens;
            host.emit(ChatEvent::Usage {
                usage: turn.chat.usage,
            });
        }
        // A stopped or failed reply keeps its text but not its calls.
        let (calls, end) = match result {
            Some(Ok(())) => {
                reply.finish_calls();
                (std::mem::take(&mut reply.calls), None)
            }
            Some(Err(e)) => (Vec::new(), Some((TurnEnd::Failed, NoticeLevel::Error, e))),
            None => (
                Vec::new(),
                Some((TurnEnd::Stopped, NoticeLevel::Info, STOPPED.to_string())),
            ),
        };
        if !reply.text.is_empty() || !calls.is_empty() {
            turn.push(
                host,
                Message::Assistant {
                    text: reply.text,
                    reasoning: reply.reasoning,
                    tool_calls: calls.clone(),
                },
            );
        }
        if let Some((end, level, text)) = end {
            turn.notice(host, level, &text);
            return end;
        }
        if calls.is_empty() {
            return TurnEnd::Done;
        }

        for (i, call) in calls.iter().enumerate() {
            if calls_run == MAX_TOOL_CALLS {
                turn.skip_calls(host, &calls[i..], NOT_RUN_LIMIT);
                turn.notice(
                    host,
                    NoticeLevel::Info,
                    &format!("Stopped after {MAX_TOOL_CALLS} tool calls in one turn. Send a message to continue."),
                );
                return TurnEnd::ToolLimit;
            }
            // Stop may have come after the reply ended.
            if turn.cancel.is_cancelled() {
                turn.skip_calls(host, &calls[i..], NOT_RUN_STOPPED);
                turn.notice(host, NoticeLevel::Info, STOPPED);
                return TurnEnd::Stopped;
            }
            let token = uuid::Uuid::new_v4().to_string();
            // Started before the event, so the result can't arrive first.
            let running = host.run_tool(call, &token);
            host.emit(ChatEvent::ToolCall {
                call: call.clone(),
                token: token.clone(),
            });
            let output = tokio::select! {
                biased;
                () = turn.cancel.cancelled() => None,
                output = running => Some(output),
            };
            let Some(output) = output else {
                turn.skip_calls(host, &calls[i..], NOT_RUN_STOPPED);
                turn.notice(host, NoticeLevel::Info, STOPPED);
                return TurnEnd::Stopped;
            };
            calls_run += 1;
            turn.push(
                host,
                Message::Tool {
                    call_id: call.id.clone(),
                    name: call.name.clone(),
                    content: output.content,
                    is_error: output.is_error,
                },
            );
        }
    }
}
