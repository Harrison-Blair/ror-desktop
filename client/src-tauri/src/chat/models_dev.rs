// Facts about the OpenCode Go models from models.dev: the context size and
// the reasoning efforts of each. Fetched once per app run and cached on
// disk, so a failed fetch falls back to the last list that came.

use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::Duration;
use tokio::sync::OnceCell;

pub const URL: &str = "https://models.dev/api.json";
/// How long the fetch may take. After it, the cache is used.
pub const TIMEOUT: Duration = Duration::from_secs(5);
const PROVIDER: &str = "opencode-go";

#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelInfo {
    /// The context size, in tokens.
    pub context: Option<u64>,
    /// The values the model takes for `reasoning_effort`, in order.
    pub efforts: Vec<String>,
}

/// The models by id.
pub type Models = HashMap<String, ModelInfo>;

/// The OpenCode Go models in a models.dev `api.json`.
pub fn parse(value: &Value) -> Option<Models> {
    let models = value[PROVIDER]["models"].as_object()?;
    Some(
        models
            .iter()
            .map(|(id, model)| {
                let efforts = model["reasoning_options"]
                    .as_array()
                    .into_iter()
                    .flatten()
                    .filter(|option| option["type"] == "effort")
                    .flat_map(|option| option["values"].as_array().into_iter().flatten())
                    .filter_map(|v| v.as_str().map(str::to_string))
                    .collect();
                let info = ModelInfo {
                    context: model["limit"]["context"].as_u64(),
                    efforts,
                };
                (id.clone(), info)
            })
            .collect(),
    )
}

async fn fetch(client: &reqwest::Client, url: &str) -> Result<Models, String> {
    let body = client
        .get(url)
        .timeout(TIMEOUT)
        .send()
        .await
        .and_then(reqwest::Response::error_for_status)
        .map_err(|e| e.to_string())?
        .text()
        .await
        .map_err(|e| e.to_string())?;
    let value: Value = serde_json::from_str(&body).map_err(|e| e.to_string())?;
    parse(&value).ok_or_else(|| format!("models.dev lists no {PROVIDER} provider."))
}

/// Fetches the models and caches them in `cache`. When the fetch fails, the
/// cache is read; when that fails too, no model is known.
pub async fn load(client: &reqwest::Client, url: &str, cache: &Path) -> Models {
    match fetch(client, url).await {
        Ok(models) => {
            // A cache that can't be written only costs the next offline start.
            if let Ok(text) = serde_json::to_vec(&models) {
                let _ = cache
                    .parent()
                    .map_or(Ok(()), fs::create_dir_all)
                    .and_then(|()| fs::write(cache, text));
            }
            models
        }
        Err(_) => fs::read(cache)
            .ok()
            .and_then(|text| serde_json::from_slice(&text).ok())
            .unwrap_or_default(),
    }
}

/// The models, loaded on first use.
pub struct ModelsDev {
    url: String,
    cache: PathBuf,
    models: OnceCell<Models>,
}

impl ModelsDev {
    pub fn new(url: &str, cache: PathBuf) -> Self {
        ModelsDev {
            url: url.to_string(),
            cache,
            models: OnceCell::new(),
        }
    }

    pub async fn model(&self, client: &reqwest::Client, id: &str) -> Option<ModelInfo> {
        self.models
            .get_or_init(|| load(client, &self.url, &self.cache))
            .await
            .get(id)
            .cloned()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use std::io::{BufRead, BufReader, Write};
    use std::net::TcpListener;

    // Answers every request with `status` and `body`.
    fn serve(status: u16, body: String) -> String {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let url = format!("http://{}/api.json", listener.local_addr().unwrap());
        std::thread::spawn(move || {
            for stream in listener.incoming() {
                let mut stream = stream.unwrap();
                let mut reader = BufReader::new(stream.try_clone().unwrap());
                loop {
                    let mut line = String::new();
                    reader.read_line(&mut line).unwrap();
                    if line.trim_end().is_empty() {
                        break;
                    }
                }
                let _ = stream.write_all(
                    format!(
                        "HTTP/1.1 {status} X\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
                        body.len()
                    )
                    .as_bytes(),
                );
            }
        });
        url
    }

    // A slice of the real api.json, as fetched on 2026-11-02.
    fn api() -> Value {
        json!({
            "openai": { "models": { "gpt-6": { "limit": { "context": 400000 } } } },
            "opencode-go": {
                "id": "opencode-go",
                "models": {
                    "glm-5.3": {
                        "id": "glm-5.3",
                        "reasoning": true,
                        "reasoning_options": [{ "type": "effort", "values": ["low", "high", "max"] }],
                        "limit": { "context": 1000000, "output": 131072 }
                    },
                    "qwen3.8-max": {
                        "reasoning_options": [
                            { "type": "toggle" },
                            { "type": "effort", "values": ["low", "medium", "xhigh"] },
                            { "type": "budget_tokens", "max": 262144 }
                        ],
                        "limit": { "context": 1000000 }
                    },
                    "mimo-v2.5": { "reasoning_options": [], "limit": { "context": 1000000 } },
                    "odd": {}
                }
            }
        })
    }

    #[test]
    fn reads_the_context_and_efforts_of_each_opencode_go_model() {
        let models = parse(&api()).unwrap();
        assert_eq!(models.len(), 4);
        assert_eq!(
            models["glm-5.3"],
            ModelInfo {
                context: Some(1_000_000),
                efforts: vec!["low".into(), "high".into(), "max".into()],
            }
        );
        assert_eq!(models["qwen3.8-max"].efforts, ["low", "medium", "xhigh"]);
        assert_eq!(models["mimo-v2.5"].efforts, Vec::<String>::new());
        assert_eq!(models["odd"], ModelInfo::default());
        assert!(!models.contains_key("gpt-6"));
    }

    #[tokio::test]
    async fn a_fetch_fills_the_cache_and_a_failed_fetch_reads_it() {
        let dir = tempfile::tempdir().unwrap();
        let cache = dir.path().join("data").join("models-dev.json");
        let client = reqwest::Client::new();

        let good = serve(200, api().to_string());
        let fetched = load(&client, &good, &cache).await;
        assert_eq!(fetched["glm-5.3"].context, Some(1_000_000));
        assert!(cache.is_file());

        let down = serve(500, "down".into());
        assert_eq!(load(&client, &down, &cache).await, fetched);
    }

    #[tokio::test]
    async fn with_no_fetch_and_no_cache_no_model_is_known() {
        let dir = tempfile::tempdir().unwrap();
        let cache = dir.path().join("models-dev.json");
        let down = serve(500, "down".into());
        let models = ModelsDev::new(&down, cache);
        assert_eq!(models.model(&reqwest::Client::new(), "glm-5.3").await, None);
    }

    #[tokio::test]
    async fn fetches_once_per_run() {
        let dir = tempfile::tempdir().unwrap();
        let cache = dir.path().join("models-dev.json");
        let client = reqwest::Client::new();
        let good = serve(200, api().to_string());
        let models = ModelsDev::new(&good, cache.clone());
        assert!(models.model(&client, "glm-5.3").await.is_some());
        // A later list in the cache is not read again in this run.
        std::fs::write(&cache, "{}").unwrap();
        assert!(models.model(&client, "glm-5.3").await.is_some());
    }
}
