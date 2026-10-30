// The chat agent's web tools: a Tavily search and a page fetch. Both run here
// so the Tavily key stays in Rust and pages load without the webview's CORS.

use crate::chat::{self, ChatState};
use reqwest::dns::{Addrs, Name, Resolve, Resolving};
use serde::Serialize;
use serde_json::{json, Value};
use std::fmt;
use std::net::{IpAddr, Ipv4Addr, SocketAddr, ToSocketAddrs};
use std::sync::{Arc, LazyLock};
use std::time::Duration;
use tauri::State;

pub const TAVILY_URL: &str = "https://api.tavily.com/search";
/// The most results a search returns.
pub const SEARCH_RESULTS: usize = 8;
const SNIPPET_LENGTH: usize = 500;
pub const FETCH_TIMEOUT: Duration = Duration::from_secs(20);
/// The most text a fetch returns, in bytes.
pub const TEXT_LIMIT: usize = 100 * 1024;
// The most a fetch downloads. HTML loses most of its size as text.
const BODY_LIMIT: usize = 4 * 1024 * 1024;

#[derive(Debug, PartialEq, Serialize)]
pub struct SearchResult {
    pub title: String,
    pub url: String,
    pub snippet: String,
}

#[derive(Debug, PartialEq, Serialize)]
pub struct Page {
    pub text: String,
    /// True when the text was cut at `TEXT_LIMIT`, or the download at
    /// `BODY_LIMIT`. A note at the end of the text says which.
    pub truncated: bool,
}

#[derive(Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum Code {
    /// No Tavily key is saved: only the user can add one.
    MissingKey,
    Failed,
}

#[derive(Debug, PartialEq, Serialize)]
pub struct WebError {
    pub code: Code,
    pub message: String,
}

fn failed(message: impl Into<String>) -> WebError {
    WebError {
        code: Code::Failed,
        message: message.into(),
    }
}

/// Searches the web through Tavily.
pub async fn search(
    client: &reqwest::Client,
    url: &str,
    key: Option<String>,
    query: &str,
) -> Result<Vec<SearchResult>, WebError> {
    let Some(key) = key else {
        return Err(WebError {
            code: Code::MissingKey,
            message: "No Tavily key is saved. The user must add a Tavily key in the chat's model menu before web_search can run.".to_string(),
        });
    };
    if query.trim().is_empty() {
        return Err(failed("Enter text to search for."));
    }
    let redact = |text: String| text.replace(&key, "[key]");
    let response = client
        .post(url)
        .bearer_auth(&key)
        .header(reqwest::header::CONTENT_TYPE, "application/json")
        .body(json!({ "query": query, "max_results": SEARCH_RESULTS }).to_string())
        .timeout(FETCH_TIMEOUT)
        .send()
        .await
        .map_err(|e| failed(redact(format!("Couldn't reach Tavily: {e}"))))?;
    let status = response.status();
    let body = response
        .text()
        .await
        .map_err(|e| failed(redact(format!("Couldn't read Tavily's answer: {e}"))))?;
    let code = status.as_u16();
    if code == 401 || code == 403 {
        return Err(failed(format!(
            "Tavily refused the key (HTTP {code}). The user can replace it in the model menu."
        )));
    }
    if !status.is_success() {
        let detail = serde_json::from_str::<Value>(&body)
            .ok()
            .and_then(|v| v["detail"]["error"].as_str().map(str::to_string))
            .unwrap_or_else(|| body.chars().take(300).collect());
        return Err(failed(redact(format!(
            "Tavily returned HTTP {code}: {}",
            detail.trim()
        ))));
    }
    let value: Value = serde_json::from_str(&body)
        .map_err(|_| failed("Tavily sent an answer that isn't JSON."))?;
    Ok(value["results"]
        .as_array()
        .into_iter()
        .flatten()
        .take(SEARCH_RESULTS)
        .map(|r| SearchResult {
            title: r["title"].as_str().unwrap_or("").to_string(),
            url: r["url"].as_str().unwrap_or("").to_string(),
            snippet: r["content"]
                .as_str()
                .unwrap_or("")
                .chars()
                .take(SNIPPET_LENGTH)
                .collect(),
        })
        .collect())
}

/// Whether an address is on the public internet. Fetches refuse the others,
/// so a page or a prompt can't make the app reach this computer or its
/// network.
pub fn is_public(ip: IpAddr) -> bool {
    match ip {
        IpAddr::V4(v4) => {
            let [a, b, ..] = v4.octets();
            // 0.0.0.0/8 is "this network"; 100.64.0.0/10 is shared by carriers.
            let this_network = a == 0;
            let shared = a == 100 && (b & 0xc0) == 64;
            !(v4.is_loopback()
                || v4.is_private()
                || v4.is_link_local()
                || this_network
                || shared
                || v4.is_broadcast()
                || v4.is_multicast())
        }
        IpAddr::V6(v6) => {
            if let Some(v4) = v6.to_ipv4_mapped() {
                return is_public(v4.into());
            }
            // fec0::/10, the deprecated site-local range, is still routed
            // inside some networks.
            let site_local = (v6.segments()[0] & 0xffc0) == 0xfec0;
            if v6.is_loopback()
                || v6.is_unspecified()
                || v6.is_unique_local()
                || v6.is_unicast_link_local()
                || site_local
                || v6.is_multicast()
            {
                return false;
            }
            // Addresses that carry an IPv4 address: IPv4-compatible, NAT64
            // and 6to4. They count as that IPv4 address.
            let v4 = |hi: u16, lo: u16| Ipv4Addr::from((u32::from(hi) << 16) | u32::from(lo));
            let embedded = match v6.segments() {
                [0, 0, 0, 0, 0, 0, hi, lo] => Some(v4(hi, lo)),
                [0x64, 0xff9b, 0, 0, 0, 0, hi, lo] => Some(v4(hi, lo)),
                [0x2002, hi, lo, ..] => Some(v4(hi, lo)),
                _ => None,
            };
            embedded.is_none_or(|v4| is_public(v4.into()))
        }
    }
}

// Why a fetch did not connect. It is found again in reqwest's error chain.
#[derive(Debug)]
struct Refused(String);

impl fmt::Display for Refused {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.0)
    }
}

impl std::error::Error for Refused {}

fn refused(host: &str, ip: IpAddr) -> Refused {
    Refused(format!(
        "{host} is at {ip}, which is on this computer or a private network. Only public web pages can be fetched."
    ))
}

// The resolver of fetches: it refuses a name with an address that isn't
// allowed, so the connection goes only to an address that was checked.
struct CheckedDns {
    allowed: fn(IpAddr) -> bool,
    // Fixed addresses for some names, for tests.
    hosts: Vec<(String, IpAddr)>,
}

impl Resolve for CheckedDns {
    fn resolve(&self, name: Name) -> Resolving {
        let allowed = self.allowed;
        let host = name.as_str().to_string();
        let fixed: Vec<IpAddr> = self
            .hosts
            .iter()
            .filter(|(h, _)| *h == host)
            .map(|(_, ip)| *ip)
            .collect();
        Box::pin(async move {
            let addrs: Vec<SocketAddr> = if fixed.is_empty() {
                let lookup = host.clone();
                tauri::async_runtime::spawn_blocking(move || {
                    (lookup.as_str(), 0)
                        .to_socket_addrs()
                        .map(Iterator::collect)
                })
                .await??
            } else {
                fixed.into_iter().map(|ip| SocketAddr::new(ip, 0)).collect()
            };
            if let Some(bad) = addrs.iter().find(|a| !allowed(a.ip())) {
                return Err(refused(&host, bad.ip()).into());
            }
            Ok(Box::new(addrs.into_iter()) as Addrs)
        })
    }
}

// An address written in the URL, which skips the resolver.
fn literal_ip(url: &reqwest::Url) -> Option<IpAddr> {
    // An IPv6 host is in brackets. The URL parser already wrote any IPv4
    // form, such as 127.1, out in full.
    let host = url.host_str()?;
    host.trim_start_matches('[')
        .trim_end_matches(']')
        .parse()
        .ok()
}

fn check_literal(url: &reqwest::Url, allowed: fn(IpAddr) -> bool) -> Result<(), Refused> {
    match literal_ip(url) {
        Some(ip) if !allowed(ip) => Err(refused(url.host_str().unwrap_or(""), ip)),
        _ => Ok(()),
    }
}

/// Loads pages, connecting only to addresses that `allowed` accepts. It
/// checks the first URL and every redirect.
pub struct Fetcher {
    client: reqwest::Client,
    allowed: fn(IpAddr) -> bool,
}

impl Fetcher {
    pub fn new(allowed: fn(IpAddr) -> bool, hosts: &[(&str, IpAddr)]) -> Self {
        let dns = CheckedDns {
            allowed,
            hosts: hosts.iter().map(|(h, ip)| (h.to_string(), *ip)).collect(),
        };
        let redirects = reqwest::redirect::Policy::custom(move |attempt| {
            if attempt.previous().len() >= 10 {
                return attempt.error("The page redirected more than 10 times.");
            }
            match check_literal(attempt.url(), allowed) {
                Ok(()) => attempt.follow(),
                Err(e) => attempt.error(e),
            }
        });
        let client = reqwest::Client::builder()
            .user_agent(concat!("ror-desktop/", env!("CARGO_PKG_VERSION")))
            // A proxy would connect for us, to an address we never checked.
            .no_proxy()
            .dns_resolver(Arc::new(dns))
            .redirect(redirects)
            .build()
            .unwrap_or_default();
        Fetcher { client, allowed }
    }
}

static PUBLIC: LazyLock<Fetcher> = LazyLock::new(|| Fetcher::new(is_public, &[]));

/// Gets an http or https page as readable text.
pub async fn fetch(fetcher: &Fetcher, url: &str, timeout: Duration) -> Result<Page, WebError> {
    let parsed = reqwest::Url::parse(url.trim())
        .map_err(|_| failed("That isn't a URL. Use an http or https URL."))?;
    if !matches!(parsed.scheme(), "http" | "https") {
        return Err(failed("Only http and https URLs can be fetched."));
    }
    check_literal(&parsed, fetcher.allowed).map_err(|e| failed(e.0))?;
    let send_error = |e: reqwest::Error| {
        let mut source: Option<&dyn std::error::Error> = Some(&e);
        while let Some(error) = source {
            if let Some(refused) = error.downcast_ref::<Refused>() {
                return failed(refused.0.clone());
            }
            source = error.source();
        }
        if e.is_timeout() {
            failed(format!(
                "The page took longer than {} seconds to load.",
                timeout.as_secs_f32()
            ))
        } else {
            failed(format!("Couldn't load the page: {e}"))
        }
    };
    // The timeout covers the whole download, redirects and body included.
    let mut response = fetcher
        .client
        .get(parsed)
        .timeout(timeout)
        .send()
        .await
        .map_err(send_error)?;
    let status = response.status();
    if !status.is_success() {
        return Err(failed(format!(
            "The site returned HTTP {}.",
            status.as_u16()
        )));
    }
    let kind = response
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("")
        .to_ascii_lowercase();
    let html = kind.is_empty() || kind.contains("html");
    if !html && !kind.starts_with("text/") && !kind.contains("json") && !kind.contains("xml") {
        return Err(failed(format!("The page isn't text ({kind}).")));
    }
    let mut body = Vec::new();
    let mut downloaded_all = true;
    while let Some(chunk) = response.chunk().await.map_err(send_error)? {
        body.extend_from_slice(&chunk);
        if body.len() > BODY_LIMIT {
            body.truncate(BODY_LIMIT);
            downloaded_all = false;
            break;
        }
    }
    let raw = String::from_utf8_lossy(&body);
    let text = if html {
        html_to_text(&raw)
    } else {
        raw.into_owned()
    };
    Ok(cut(text, downloaded_all))
}

fn cut(mut text: String, downloaded_all: bool) -> Page {
    let cut_text = text.len() > TEXT_LIMIT;
    if cut_text {
        let mut end = TEXT_LIMIT;
        while !text.is_char_boundary(end) {
            end -= 1;
        }
        text.truncate(end);
        text.push_str("\n\n[The page was cut at 100 KB.]");
    }
    if !downloaded_all {
        text.push_str("\n\n[The page is longer than 4 MB. Only its first 4 MB were read.]");
    }
    Page {
        text,
        truncated: cut_text || !downloaded_all,
    }
}

// Tags whose content is not text.
const SKIPPED: &[&str] = &["script", "style", "noscript", "template", "svg", "head"];
// Tags that start a new line.
const BLOCKS: &[&str] = &[
    "p",
    "div",
    "br",
    "li",
    "tr",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "section",
    "article",
    "header",
    "footer",
    "nav",
    "main",
    "ul",
    "ol",
    "table",
    "blockquote",
    "pre",
    "hr",
    "dt",
    "dd",
    "figcaption",
    "title",
];

/// Turns HTML into plain text: drops tags, scripts and styles, keeps line
/// breaks at block tags, and decodes the common entities.
pub fn html_to_text(html: &str) -> String {
    // ASCII lowercasing keeps every byte offset.
    let lower = html.to_ascii_lowercase();
    let mut out = String::new();
    let mut i = 0;
    let mut text_start = 0;
    while i < html.len() {
        // A tag starts with "<" and a letter, "/", "!" or "?". Any other "<"
        // is text.
        let Some(at) = html[i..].find('<').map(|n| i + n) else {
            break;
        };
        let starts_tag = html[at + 1..]
            .chars()
            .next()
            .is_some_and(|c| c.is_ascii_alphabetic() || matches!(c, '/' | '!' | '?'));
        if !starts_tag {
            i = at + 1;
            continue;
        }
        out.push_str(&decode_entities(&html[text_start..at]));
        i = at;
        if lower[i..].starts_with("<!--") {
            i = lower[i..].find("-->").map_or(html.len(), |n| i + n + 3);
            text_start = i;
            continue;
        }
        let Some(close) = tag_end(html, i) else {
            text_start = html.len();
            break;
        };
        let tag = &lower[i + 1..close];
        let closing = tag.starts_with('/');
        let name: String = tag
            .trim_start_matches('/')
            .chars()
            .take_while(|c| c.is_ascii_alphanumeric())
            .collect();
        i = close + 1;
        if !closing && SKIPPED.contains(&name.as_str()) && !tag.ends_with('/') {
            let end_tag = format!("</{name}");
            i = lower[i..]
                .find(&end_tag)
                .and_then(|n| lower[i + n..].find('>').map(|m| i + n + m + 1))
                .unwrap_or(html.len());
            text_start = i;
            continue;
        }
        text_start = i;
        if BLOCKS.contains(&name.as_str()) {
            out.push('\n');
            if name == "li" && !closing {
                out.push_str("- ");
            }
        }
    }
    out.push_str(&decode_entities(&html[text_start.min(html.len())..]));
    // One space between words, and no blank lines.
    out.lines()
        .map(|line| line.split_whitespace().collect::<Vec<_>>().join(" "))
        .filter(|line| !line.is_empty() && line != "-")
        .collect::<Vec<_>>()
        .join("\n")
}

// The ">" that ends the tag starting at `start`. A ">" inside a quoted
// attribute value doesn't.
fn tag_end(html: &str, start: usize) -> Option<usize> {
    let mut quote = None;
    let mut after_equals = false;
    for (n, c) in html[start..].char_indices() {
        match quote {
            Some(q) if c == q => quote = None,
            Some(_) => {}
            None if c == '>' => return Some(start + n),
            None if after_equals && (c == '"' || c == '\'') => quote = Some(c),
            None => {}
        }
        if quote.is_none() && !c.is_whitespace() {
            after_equals = c == '=';
        }
    }
    None
}

// The longest entity this decodes, such as "#x10FFFF", without "&" and ";".
const ENTITY_LENGTH: usize = 9;

fn decode_entities(text: &str) -> String {
    if !text.contains('&') {
        return text.to_string();
    }
    let mut out = String::new();
    let mut rest = text;
    while let Some(at) = rest.find('&') {
        out.push_str(&rest[..at]);
        rest = &rest[at..];
        // Looks for ";" only as far as the longest entity, so the work stays
        // linear in the text.
        let near = &rest.as_bytes()[..rest.len().min(ENTITY_LENGTH + 2)];
        let decoded = near.iter().position(|&b| b == b';').and_then(|end| {
            let name = &rest[1..end];
            let c = match name {
                "amp" => Some('&'),
                "lt" => Some('<'),
                "gt" => Some('>'),
                "quot" => Some('"'),
                "apos" => Some('\''),
                "nbsp" => Some(' '),
                _ => name
                    .strip_prefix("#x")
                    .or_else(|| name.strip_prefix("#X"))
                    .and_then(|h| u32::from_str_radix(h, 16).ok())
                    .or_else(|| name.strip_prefix('#').and_then(|d| d.parse().ok()))
                    .and_then(char::from_u32),
            }?;
            Some((c, end + 1))
        });
        match decoded {
            Some((c, len)) => {
                out.push(c);
                rest = &rest[len..];
            }
            None => {
                out.push('&');
                rest = &rest[1..];
            }
        }
    }
    out.push_str(rest);
    out
}

#[tauri::command]
pub async fn web_search(
    state: State<'_, ChatState>,
    query: String,
) -> Result<Vec<SearchResult>, WebError> {
    let key = chat::key("tavily").await.map_err(failed)?;
    search(state.client(), TAVILY_URL, key, &query).await
}

#[tauri::command]
pub async fn web_fetch(url: String) -> Result<Page, WebError> {
    fetch(&PUBLIC, &url, FETCH_TIMEOUT).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::{BufRead, BufReader, Read, Write};
    use std::net::TcpListener;
    use std::sync::{Arc, Mutex};

    struct Answer {
        status: u16,
        content_type: &'static str,
        body: String,
        delay: Duration,
        location: String,
    }

    fn ok(content_type: &'static str, body: impl Into<String>) -> Answer {
        Answer {
            status: 200,
            content_type,
            body: body.into(),
            delay: Duration::ZERO,
            location: String::new(),
        }
    }

    fn redirect(to: impl Into<String>) -> Answer {
        Answer {
            status: 302,
            location: to.into(),
            ..ok("text/plain", "")
        }
    }

    struct Seen {
        authorization: String,
        body: String,
    }

    // A fake HTTP server on 127.0.0.1 that gives every request `answer`.
    fn serve(answer: Answer) -> (String, Arc<Mutex<Vec<Seen>>>) {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let url = format!("http://{}", listener.local_addr().unwrap());
        let seen = Arc::new(Mutex::new(Vec::new()));
        let requests = seen.clone();
        std::thread::spawn(move || {
            for stream in listener.incoming() {
                let mut stream = stream.unwrap();
                let mut reader = BufReader::new(stream.try_clone().unwrap());
                let (mut length, mut authorization) = (0, String::new());
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
                        _ => {}
                    }
                }
                let mut body = vec![0; length];
                reader.read_exact(&mut body).unwrap();
                requests.lock().unwrap().push(Seen {
                    authorization,
                    body: String::from_utf8(body).unwrap(),
                });
                std::thread::sleep(answer.delay);
                let _ = stream.write_all(
                    format!(
                        "HTTP/1.1 {} X\r\nContent-Type: {}\r\n{}Content-Length: {}\r\nConnection: close\r\n\r\n{}",
                        answer.status,
                        answer.content_type,
                        if answer.location.is_empty() {
                            String::new()
                        } else {
                            format!("Location: {}\r\n", answer.location)
                        },
                        answer.body.len(),
                        answer.body
                    )
                    .as_bytes(),
                );
            }
        });
        (url, seen)
    }

    fn client() -> reqwest::Client {
        chat::http_client()
    }

    // Fetches from anywhere, so tests can use the fake server on 127.0.0.1.
    fn open() -> Fetcher {
        Fetcher::new(|_| true, &[])
    }

    #[tokio::test]
    async fn search_returns_title_url_and_snippet_for_at_most_eight_results() {
        let results: Vec<Value> = (0..10)
            .map(|n| json!({ "title": format!("Ogre {n}"), "url": format!("https://x.y/{n}"), "content": "Big.", "score": 0.5 }))
            .collect();
        let (url, seen) = serve(ok(
            "application/json",
            json!({ "query": "ogres", "results": results }).to_string(),
        ));

        let found = search(&client(), &url, Some("tvly-key".into()), "ogres")
            .await
            .unwrap();
        assert_eq!(found.len(), SEARCH_RESULTS);
        assert_eq!(
            found[0],
            SearchResult {
                title: "Ogre 0".into(),
                url: "https://x.y/0".into(),
                snippet: "Big.".into(),
            }
        );
        let seen = seen.lock().unwrap();
        assert_eq!(seen[0].authorization, "Bearer tvly-key");
        let body: Value = serde_json::from_str(&seen[0].body).unwrap();
        assert_eq!(body["query"], "ogres");
        assert_eq!(body["max_results"], SEARCH_RESULTS);
    }

    #[tokio::test]
    async fn search_without_a_key_asks_the_user_for_one_and_sends_nothing() {
        let (url, seen) = serve(ok("application/json", "{}"));
        let error = search(&client(), &url, None, "ogres").await.unwrap_err();
        assert_eq!(error.code, Code::MissingKey);
        assert!(
            error.message.contains("must add a Tavily key"),
            "{}",
            error.message
        );
        assert!(seen.lock().unwrap().is_empty());
    }

    #[tokio::test]
    async fn search_errors_name_the_status_and_hide_the_key() {
        let (url, _) = serve(Answer {
            status: 500,
            content_type: "application/json",
            body: json!({ "detail": { "error": "down, key tvly-key" } }).to_string(),
            ..ok("", "")
        });
        let error = search(&client(), &url, Some("tvly-key".into()), "ogres")
            .await
            .unwrap_err();
        assert_eq!(error.message, "Tavily returned HTTP 500: down, key [key]");
    }

    #[tokio::test]
    async fn fetch_turns_html_into_text() {
        let (url, _) = serve(ok(
            "text/html; charset=utf-8",
            "<html><head><title>T</title><style>p{}</style></head><body><script>x()</script>\
             <h1>Ogres</h1><p>Hill  ogres &amp; <b>giants</b>&#33;</p><ul><li>One</li><li>Two</li></ul></body></html>",
        ));
        let page = fetch(&open(), &format!("{url}/page"), FETCH_TIMEOUT)
            .await
            .unwrap();
        assert_eq!(page.text, "Ogres\nHill ogres & giants!\n- One\n- Two");
        assert!(!page.truncated);
    }

    #[tokio::test]
    async fn fetch_cuts_text_at_100_kb_and_says_so() {
        let (url, _) = serve(ok("text/plain", "é".repeat(TEXT_LIMIT)));
        let page = fetch(&open(), &url, FETCH_TIMEOUT).await.unwrap();
        assert!(page.truncated);
        let (text, note) = page.text.split_once("\n\n").unwrap();
        assert_eq!(text.len(), TEXT_LIMIT);
        assert_eq!(note, "[The page was cut at 100 KB.]");

        let (url, _) = serve(ok("text/plain", "a".repeat(TEXT_LIMIT)));
        let page = fetch(&open(), &url, FETCH_TIMEOUT).await.unwrap();
        assert!(!page.truncated);
        assert_eq!(page.text.len(), TEXT_LIMIT);
    }

    #[tokio::test]
    async fn fetch_gives_up_after_the_timeout() {
        assert_eq!(FETCH_TIMEOUT, Duration::from_secs(20));
        let (url, _) = serve(Answer {
            delay: Duration::from_secs(3),
            ..ok("text/plain", "late")
        });
        let started = std::time::Instant::now();
        let error = fetch(&open(), &url, Duration::from_millis(300))
            .await
            .unwrap_err();
        assert!(started.elapsed() < Duration::from_secs(2));
        assert_eq!(
            error.message,
            "The page took longer than 0.3 seconds to load."
        );
    }

    #[tokio::test]
    async fn fetch_refuses_urls_that_are_not_http() {
        for url in [
            "file:///etc/passwd",
            "ftp://x.y/a",
            "javascript:alert(1)",
            "notes/a.md",
        ] {
            let error = fetch(&open(), url, FETCH_TIMEOUT).await.unwrap_err();
            assert!(error.message.contains("http"), "{url}: {}", error.message);
        }
    }

    #[tokio::test]
    async fn fetch_refuses_pages_that_are_not_text_and_reports_http_errors() {
        let (url, _) = serve(ok("image/png", "PNG"));
        let error = fetch(&open(), &url, FETCH_TIMEOUT).await.unwrap_err();
        assert_eq!(error.message, "The page isn't text (image/png).");

        let (url, _) = serve(Answer {
            status: 404,
            ..ok("text/html", "missing")
        });
        let error = fetch(&open(), &url, FETCH_TIMEOUT).await.unwrap_err();
        assert_eq!(error.message, "The site returned HTTP 404.");
    }

    #[test]
    fn only_public_addresses_are_allowed() {
        for ip in [
            "127.0.0.1",
            "127.8.9.10",
            "10.1.2.3",
            "172.16.0.1",
            "192.168.1.1",
            "169.254.169.254",
            "0.0.0.0",
            "::1",
            "::",
            "fc00::1",
            "fd12:3456::1",
            "fe80::1",
            "::ffff:127.0.0.1",
            "::ffff:10.0.0.1",
            "::ffff:169.254.169.254",
            "::ffff:0.0.0.0",
            "0.1.2.3",
            "100.64.0.1",
            "100.127.255.254",
            "255.255.255.255",
            "224.0.0.1",
            "239.1.2.3",
            "ff02::1",
            "::127.0.0.1",
            "::10.0.0.1",
            "64:ff9b::7f00:1",
            "64:ff9b::a00:1",
            "2002:7f00:1::",
            "2002:c0a8:101::1",
            "febf:ffff::1",
            "fec0::1",
            "feff:ffff::1",
            "ff00::1",
        ] {
            assert!(!is_public(ip.parse().unwrap()), "{ip}");
        }
        for ip in [
            "8.8.8.8",
            "93.184.215.14",
            "100.63.255.255",
            "100.128.0.1",
            "::8.8.8.8",
            "64:ff9b::808:808",
            "2002:808:808::1",
            "fe7f:ffff::1",
            "2606:4700::1111",
            "::ffff:8.8.8.8",
        ] {
            assert!(is_public(ip.parse().unwrap()), "{ip}");
        }
    }

    #[tokio::test]
    async fn fetch_refuses_private_addresses_before_connecting() {
        let (url, seen) = serve(ok("text/plain", "inside"));
        let port = url.rsplit(':').next().unwrap();
        let fetcher = Fetcher::new(is_public, &[("inside.test", "10.0.0.7".parse().unwrap())]);
        for (url, host, ip) in [
            (url.clone(), "127.0.0.1", "127.0.0.1"),
            (
                format!("http://[::ffff:127.0.0.1]:{port}/"),
                "[::ffff:7f00:1]",
                "::ffff:127.0.0.1",
            ),
            (
                format!("http://inside.test:{port}/"),
                "inside.test",
                "10.0.0.7",
            ),
            // Resolved by the system: localhost is always loopback.
            (format!("http://localhost:{port}/"), "localhost", ""),
        ] {
            let error = fetch(&fetcher, &url, FETCH_TIMEOUT).await.unwrap_err();
            assert!(
                error.message.starts_with(&format!("{host} is at {ip}")),
                "{url}: {}",
                error.message
            );
            assert!(
                error
                    .message
                    .ends_with("Only public web pages can be fetched."),
                "{url}: {}",
                error.message
            );
        }
        assert!(seen.lock().unwrap().is_empty());
    }

    #[tokio::test]
    async fn fetch_checks_every_redirect_hop() {
        // 127.0.0.1 stands in for a public site; nothing else is allowed.
        let fetcher = Fetcher::new(
            |ip| ip == IpAddr::from([127, 0, 0, 1]),
            &[
                ("public.test", "127.0.0.1".parse().unwrap()),
                ("inside.test", "10.0.0.7".parse().unwrap()),
            ],
        );
        let (page, _) = serve(ok("text/plain", "Ogres."));
        let port = page.rsplit(':').next().unwrap().to_string();

        // A redirect through a name that is allowed is followed.
        let (url, _) = serve(redirect(format!("http://public.test:{port}/")));
        let found = fetch(&fetcher, &url, FETCH_TIMEOUT).await.unwrap();
        assert_eq!(found.text, "Ogres.");

        for (to, start) in [
            (
                format!("http://inside.test:{port}/"),
                "inside.test is at 10.0.0.7",
            ),
            (
                format!("http://127.0.0.2:{port}/"),
                "127.0.0.2 is at 127.0.0.2",
            ),
            (format!("http://[::1]:{port}/"), "[::1] is at ::1"),
        ] {
            let (url, _) = serve(redirect(to.clone()));
            let error = fetch(&fetcher, &url, FETCH_TIMEOUT).await.unwrap_err();
            assert!(error.message.starts_with(start), "{to}: {}", error.message);
        }
    }

    #[tokio::test]
    async fn fetch_says_when_the_download_was_cut_at_4_mb() {
        let html = format!(
            "<script>{}</script><p>Never read.</p>",
            "x".repeat(BODY_LIMIT)
        );
        let (url, _) = serve(ok("text/html", html));
        let page = fetch(&open(), &url, FETCH_TIMEOUT).await.unwrap();
        assert!(page.truncated);
        assert_eq!(
            page.text,
            "\n\n[The page is longer than 4 MB. Only its first 4 MB were read.]"
        );

        // Text over 100 KB from a download over 4 MB gets both notes.
        let (url, _) = serve(ok("text/plain", "a".repeat(BODY_LIMIT + 1)));
        let page = fetch(&open(), &url, FETCH_TIMEOUT).await.unwrap();
        assert!(page.truncated);
        let notes: Vec<&str> = page.text.split("\n\n").skip(1).collect();
        assert_eq!(
            notes,
            [
                "[The page was cut at 100 KB.]",
                "[The page is longer than 4 MB. Only its first 4 MB were read.]"
            ]
        );

        // Exactly 4 MB is all of the page.
        let (url, _) = serve(ok("text/plain", "a".repeat(BODY_LIMIT)));
        let page = fetch(&open(), &url, FETCH_TIMEOUT).await.unwrap();
        assert!(page.truncated);
        assert!(page.text.ends_with("[The page was cut at 100 KB.]"));
        let (url, _) = serve(ok(
            "text/html",
            format!("<p>Hi</p><!--{}-->", "x".repeat(BODY_LIMIT - 16)),
        ));
        let page = fetch(&open(), &url, FETCH_TIMEOUT).await.unwrap();
        assert_eq!(
            page,
            Page {
                text: "Hi".into(),
                truncated: false
            }
        );
    }

    #[test]
    fn html_text_keeps_quoted_brackets_and_comparison_signs() {
        assert_eq!(
            html_to_text(r#"<p>Before <a title="2 > 1" href="/x">link</a> after</p>"#),
            "Before link after"
        );
        assert_eq!(
            html_to_text("<p>Result: 2 < 3 and 5 > 4</p>"),
            "Result: 2 < 3 and 5 > 4"
        );
        assert_eq!(
            html_to_text("<p class='a>b'>x &lt;y&gt; &amp;&#x41;&#66; a<1 <!x> b</p>"),
            "x <y> &AB a<1 b"
        );
    }

    #[test]
    fn decoding_many_ampersands_takes_linear_time() {
        let text = "&".repeat(1_000_000);
        let decoded = within(Duration::from_secs(3), {
            let text = text.clone();
            move || html_to_text(&text)
        });
        assert_eq!(decoded, text);
    }

    // Runs `work` on its own thread and fails the test if it takes longer
    // than `limit`, so a slow regression fails instead of hanging.
    fn within<T: Send + 'static>(limit: Duration, work: impl FnOnce() -> T + Send + 'static) -> T {
        let (done, result) = std::sync::mpsc::channel();
        std::thread::spawn(move || {
            let _ = done.send(work());
        });
        result
            .recv_timeout(limit)
            .unwrap_or_else(|e| panic!("not done within {limit:?}: {e}"))
    }
}
