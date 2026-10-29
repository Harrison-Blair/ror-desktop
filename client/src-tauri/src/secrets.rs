// API keys live in the OS keychain, one entry per provider. They never go to
// the webview: commands report only whether a key is saved.

use keyring::{Entry, Error};

const SERVICE: &str = "ror-desktop";

/// The providers that can hold a key.
pub const PROVIDERS: &[&str] = &["opencode-go"];

fn entry(provider: &str) -> Result<Entry, String> {
    if !PROVIDERS.contains(&provider) {
        return Err(format!("Unknown key provider {provider}."));
    }
    Entry::new(SERVICE, provider).map_err(|e| unavailable(&e))
}

fn unavailable(e: &Error) -> String {
    format!("Couldn't use the system keychain: {e}.")
}

/// The saved key, or None when no key is set.
pub fn get(provider: &str) -> Result<Option<String>, String> {
    match entry(provider)?.get_password() {
        Ok(key) => Ok(Some(key)),
        Err(Error::NoEntry) => Ok(None),
        Err(e) => Err(unavailable(&e)),
    }
}

pub fn set(provider: &str, key: &str) -> Result<(), String> {
    let key = key.trim();
    if key.is_empty() {
        return Err("Enter a key.".to_string());
    }
    entry(provider)?
        .set_password(key)
        .map_err(|e| unavailable(&e))
}

#[cfg(test)]
mod tests {
    use super::*;

    // The keychain itself is not available in CI, so only the checks before
    // it are tested here.
    #[test]
    fn unknown_providers_are_refused() {
        assert_eq!(
            get("other").unwrap_err(),
            "Unknown key provider other.".to_string()
        );
        assert_eq!(
            set("other", "k").unwrap_err(),
            "Unknown key provider other.".to_string()
        );
    }

    #[test]
    fn an_empty_key_is_refused() {
        assert_eq!(set("opencode-go", "  ").unwrap_err(), "Enter a key.");
    }
}
