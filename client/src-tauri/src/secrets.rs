// API keys live in the OS keychain, one entry per provider. They never go to
// the webview: commands report only whether a key is saved.

use keyring::{Entry, Error};

const SERVICE: &str = "ror-desktop";

/// The providers that can hold a key.
pub const PROVIDERS: &[&str] = &["opencode-go", "tavily"];

fn entry(provider: &str) -> Result<Entry, String> {
    if !PROVIDERS.contains(&provider) {
        return Err(format!("Unknown key provider {provider}."));
    }
    new_entry(provider).map_err(|e| unavailable(&e))
}

#[cfg(not(test))]
fn new_entry(provider: &str) -> keyring::Result<Entry> {
    Entry::new(SERVICE, provider)
}

// Tests use keyring's in-memory store: CI has no keychain. Each test thread
// gets its own entries, as tests run at the same time.
#[cfg(test)]
fn new_entry(provider: &str) -> keyring::Result<Entry> {
    static STORE: std::sync::Once = std::sync::Once::new();
    STORE.call_once(|| keyring_core::set_default_store(keyring_core::mock::Store::new().unwrap()));
    let thread = std::thread::current();
    let service = format!("{SERVICE}-{}", thread.name().unwrap_or("test"));
    Ok(Entry {
        inner: keyring_core::Entry::new(&service, provider)?,
    })
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

/// Deletes the saved key. Removing a key that isn't saved does nothing.
pub fn remove(provider: &str) -> Result<(), String> {
    match entry(provider)?.delete_credential() {
        Ok(()) | Err(Error::NoEntry) => Ok(()),
        Err(e) => Err(unavailable(&e)),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn unknown_providers_are_refused() {
        for result in [get("other").map(|_| ()), set("other", "k"), remove("other")] {
            assert_eq!(result.unwrap_err(), "Unknown key provider other.");
        }
    }

    #[test]
    fn an_empty_key_is_refused() {
        assert_eq!(set("opencode-go", "  ").unwrap_err(), "Enter a key.");
    }

    // Each test uses its own provider: the store is shared by the tests.
    #[test]
    fn remove_deletes_a_saved_key_and_leaves_the_others() {
        set("tavily", " tvly-1 ").unwrap();
        set("opencode-go", "sk-go").unwrap();
        assert_eq!(get("tavily").unwrap().as_deref(), Some("tvly-1"));

        remove("tavily").unwrap();
        assert_eq!(get("tavily").unwrap(), None);
        assert_eq!(get("opencode-go").unwrap().as_deref(), Some("sk-go"));
        // Removing again is not an error.
        remove("tavily").unwrap();
    }
}
