import { Check } from "lucide-react";
import {
  type KeyboardEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import {
  type BackendId,
  type CodexStatus,
  type CustomProvider,
  codexStatus,
  getChatSettings,
  isKeySaved,
  type KeyProvider,
  listModels,
  removeCustomProvider,
  removeKey,
  saveCustomProvider,
  saveKey,
} from "@/lib/chat/chatApi";
import { errorMessage } from "@/lib/errorMessage";
import styles from "./SettingsMenu.module.css";

type Models =
  | { state: "loading" }
  | { state: "error"; message: string }
  | { state: "ready"; models: string[] };

type Keys = Record<KeyProvider, boolean | null>;

const NO_KEYS: Keys = { "opencode-go": null, tavily: null, custom: null };

// Each provider shows at most this many model ids.
const MODEL_CAP = 10;

// The providers that take a key and nothing else.
type KeyOnly = Exclude<KeyProvider, "custom">;

type Form = { name: string; baseUrl: string; key: string };

// The form shows the provider as it is now.
const formOf = (provider: CustomProvider | null): Form => ({
  name: provider?.name ?? "",
  baseUrl: provider?.baseUrl ?? "",
  key: "",
});

const onEnter =
  (act: () => void) => (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      act();
    }
  };

// A state as a word, with a check when it is good.
function State({ ok, children }: { ok?: boolean; children: ReactNode }) {
  return (
    <span className={ok ? `${styles.state} ${styles.ok}` : styles.state}>
      {ok && <Check size={14} strokeWidth={2} aria-hidden />}
      {children}
    </span>
  );
}

function ModelChips({ name, models }: { name: string; models: string[] }) {
  const more = models.length - MODEL_CAP;
  return (
    <div className={styles.models}>
      <ul className={styles.modelList} aria-label={`${name} models`}>
        {models.slice(0, MODEL_CAP).map((model) => (
          <li key={model} className={styles.model}>
            {model}
          </li>
        ))}
      </ul>
      {more > 0 && <span className={styles.caption}>… and {more} more</span>}
    </div>
  );
}

// The provider keys and the custom provider. Keys stay in the system
// keychain: this page only saves and removes them.
export function ProvidersSettings({
  onProviderRemoved,
}: {
  onProviderRemoved: (backend: BackendId) => void;
}) {
  const id = useId();
  const [keys, setKeys] = useState<Keys>(NO_KEYS);
  const [custom, setCustom] = useState<CustomProvider | null>(null);
  const [goModels, setGoModels] = useState<Models | null>(null);
  const [customModels, setCustomModels] = useState<Models | null>(null);
  // null while Codex starts.
  const [codex, setCodex] = useState<CodexStatus | null>(null);
  // The saved key being replaced.
  const [replacing, setReplacing] = useState<KeyOnly | null>(null);
  const [drafts, setDrafts] = useState<Record<KeyOnly, string>>({
    "opencode-go": "",
    tavily: "",
  });
  const [form, setForm] = useState(formOf(null));
  // The form fields typed in since the form was last filled.
  const edited = useRef(new Set<keyof Form>());
  // Shown under the provider whose change failed.
  const [error, setError] = useState<{
    at: KeyProvider | "load";
    message: string;
  } | null>(null);
  // A key or provider change is running: Save and Remove wait for it.
  const [busy, setBusy] = useState(false);
  const running = useRef(false);

  const checkCodex = useCallback(() => {
    setCodex(null);
    return codexStatus().then(setCodex, (e) =>
      setCodex({ state: "error", message: errorMessage(e) }),
    );
  }, []);

  // Shows the provider in the form, but keeps the fields typed in since the
  // last fill.
  const fillForm = useCallback((provider: CustomProvider | null) => {
    const next = formOf(provider);
    setForm((typed) => {
      for (const field of edited.current) next[field] = typed[field];
      return next;
    });
  }, []);

  // Loads the keys and the provider, fills the form when asked, then lists
  // the models.
  const refresh = useCallback(
    async (fill: boolean) => {
      let saved: Keys;
      let provider: CustomProvider | null;
      try {
        const [go, tavily, customKey, settings] = await Promise.all([
          isKeySaved("opencode-go"),
          isKeySaved("tavily"),
          isKeySaved("custom"),
          getChatSettings(),
        ]);
        saved = { "opencode-go": go, tavily, custom: customKey };
        provider = settings.customProvider;
        setKeys(saved);
        setCustom(provider);
        setError(null);
      } catch (e) {
        setError({ at: "load", message: errorMessage(e) });
        return;
      }
      if (fill) fillForm(provider);
      const load = async (from: BackendId, set: (models: Models) => void) => {
        set({ state: "loading" });
        try {
          set({ state: "ready", models: await listModels(from) });
        } catch (e) {
          set({ state: "error", message: errorMessage(e) });
        }
      };
      if (!saved["opencode-go"]) setGoModels(null);
      if (!provider) setCustomModels(null);
      await Promise.all([
        saved["opencode-go"] && load("opencode-go", setGoModels),
        provider && load("custom", setCustomModels),
      ]);
    },
    [fillForm],
  );

  useEffect(() => {
    refresh(true);
    checkCodex();
  }, [refresh, checkCodex]);

  // Runs a change to the keys or the provider, then loads again. A failed
  // change may still have changed something, so it loads again too and
  // keeps its error and what was typed.
  const change = async (at: KeyProvider, act: () => Promise<unknown>) => {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    // The form is sent as it is now; only later typing outlives the fill.
    if (at === "custom") edited.current.clear();
    try {
      await act();
      if (at !== "custom") {
        setReplacing((open) => (open === at ? null : open));
        setDrafts((typed) => ({ ...typed, [at]: "" }));
      }
      await refresh(at === "custom");
    } catch (e) {
      const message = errorMessage(e);
      await refresh(false);
      setError({ at, message });
    } finally {
      running.current = false;
      setBusy(false);
    }
  };

  const removeProvider = () =>
    change("custom", async () => {
      await removeCustomProvider();
      onProviderRemoved("custom");
    });

  const edit = (field: keyof Form, value: string) => {
    edited.current.add(field);
    setForm((typed) => ({ ...typed, [field]: value }));
  };

  const saveForm = () =>
    change("custom", () =>
      saveCustomProvider(form.name, form.baseUrl, form.key || null),
    );

  const errorAt = (at: KeyProvider | "load") =>
    error?.at === at && <p className={styles.error}>{error.message}</p>;

  const keyState = (saved: boolean | null) =>
    saved === null ? null : saved ? (
      <State ok>Key saved</State>
    ) : (
      <State>No key</State>
    );

  const keyRow = (
    provider: KeyOnly,
    name: string,
    sub: string,
    models?: ReactNode,
  ) => {
    const saved = keys[provider];
    const save = () =>
      change(provider, () => saveKey(provider, drafts[provider]));
    return (
      <div className={styles.row}>
        <div className={styles.rowTop}>
          <div className={styles.name}>
            <span className={styles.title}>{name}</span>
            <span className={styles.sub}>{sub}</span>
          </div>
          {keyState(saved)}
          {saved && replacing !== provider && (
            <div className={styles.actions}>
              <button
                type="button"
                className={styles.textButton}
                aria-label={`Replace ${name} key`}
                onClick={() => {
                  setError(null);
                  setReplacing(provider);
                }}
              >
                Replace
              </button>
              <button
                type="button"
                className={styles.textButton}
                aria-label={`Remove ${name} key`}
                disabled={busy}
                onClick={() => change(provider, () => removeKey(provider))}
              >
                Remove
              </button>
            </div>
          )}
        </div>
        {(saved === false || replacing === provider) && (
          <div className={styles.keyLine}>
            <input
              aria-label={`${name} key`}
              className={`${styles.field} ${styles.mono}`}
              type="password"
              autoComplete="off"
              placeholder="Paste key"
              // biome-ignore lint/a11y/noAutofocus: the field opens on Replace
              autoFocus={replacing === provider}
              value={drafts[provider]}
              onChange={(event) =>
                setDrafts({ ...drafts, [provider]: event.target.value })
              }
              onKeyDown={onEnter(save)}
            />
            {replacing === provider && (
              <button
                type="button"
                className={styles.button}
                onClick={() => {
                  setReplacing(null);
                  setDrafts({ ...drafts, [provider]: "" });
                }}
              >
                Cancel
              </button>
            )}
            <button
              type="button"
              className={`${styles.button} ${styles.primary}`}
              aria-label={`Save ${name} key`}
              disabled={busy}
              onClick={save}
            >
              Save
            </button>
          </div>
        )}
        {models}
        {errorAt(provider)}
      </div>
    );
  };

  const modelsOf = (name: string, models: Models | null, quiet = false) =>
    models === null ? null : models.state === "loading" ? (
      <p className={styles.caption}>Loading models…</p>
    ) : models.state === "error" ? (
      quiet ? (
        <p className={styles.caption} title={models.message}>
          Could not list models from this provider.
        </p>
      ) : (
        <p className={styles.error}>{models.message}</p>
      )
    ) : models.models.length === 0 ? (
      <p className={styles.caption}>No models listed.</p>
    ) : (
      <ModelChips name={name} models={models.models} />
    );

  const codexModels =
    codex?.state === "ready" || codex?.state === "signedOut"
      ? codex.models
      : [];

  return (
    <div className={styles.settings}>
      <div className={styles.pageHead}>
        <h1 className={styles.h1}>Providers and keys</h1>
        <p className={styles.caption}>
          Keys are kept in the system keychain. The chat model menu lists the
          models of each provider you set up here.
        </p>
        {errorAt("load")}
      </div>

      <section className={styles.section} aria-labelledby={`${id}-built`}>
        <h2 className={styles.h2} id={`${id}-built`}>
          Built in
        </h2>
        <div className={styles.list}>
          {keyRow(
            "opencode-go",
            "OpenCode Go",
            "API key",
            modelsOf("OpenCode Go", goModels),
          )}
          <div className={styles.row}>
            <div className={styles.rowTop}>
              <div className={styles.name}>
                <span className={styles.title}>Codex</span>
                <span className={styles.sub}>
                  Signs in with <span className={styles.code}>codex login</span>{" "}
                  in a terminal
                </span>
              </div>
              {codex === null ? (
                <State>Checking…</State>
              ) : codex.state === "ready" ? (
                <State ok>Signed in</State>
              ) : codex.state === "signedOut" ? (
                <State>Not signed in</State>
              ) : codex.state === "notInstalled" ? (
                <State>Not installed</State>
              ) : (
                <State>Error</State>
              )}
              <div className={styles.actions}>
                <button
                  type="button"
                  className={styles.textButton}
                  disabled={codex === null}
                  onClick={checkCodex}
                >
                  Check again
                </button>
              </div>
            </div>
            {codex?.state === "notInstalled" && (
              <p className={styles.caption}>
                Install the Codex CLI, then run codex login.
              </p>
            )}
            {codex?.state === "signedOut" && (
              <p className={styles.caption}>
                Run codex login in a terminal to use these models.
              </p>
            )}
            {codex?.state === "error" && (
              <p className={styles.error}>{codex.message}</p>
            )}
            {codexModels.length > 0 && (
              <ModelChips name="Codex" models={codexModels} />
            )}
          </div>
        </div>
      </section>

      <section className={styles.section} aria-labelledby={`${id}-custom`}>
        <h2 className={styles.h2} id={`${id}-custom`}>
          Custom provider
        </h2>
        <div className={styles.list}>
          <div className={styles.row}>
            <div className={styles.rowTop}>
              <div className={styles.name}>
                <span className={styles.title}>
                  {custom?.name ?? "New provider"}
                </span>
                <span className={styles.sub}>
                  OpenAI-compatible. The model list comes from GET /models.
                </span>
              </div>
              {keys.custom !== null &&
                (!custom ? (
                  <State>{keys.custom ? "Key only" : "Not set up"}</State>
                ) : (
                  keyState(keys.custom)
                ))}
            </div>
            <div className={styles.form}>
              <label className={styles.label} htmlFor={`${id}-name`}>
                Name
              </label>
              <input
                id={`${id}-name`}
                className={styles.field}
                value={form.name}
                onChange={(event) => edit("name", event.target.value)}
                onKeyDown={onEnter(saveForm)}
              />
              <label className={styles.label} htmlFor={`${id}-url`}>
                Base URL
              </label>
              <input
                id={`${id}-url`}
                className={`${styles.field} ${styles.mono}`}
                placeholder="http://localhost:11434/v1"
                value={form.baseUrl}
                onChange={(event) => edit("baseUrl", event.target.value)}
                onKeyDown={onEnter(saveForm)}
              />
              <label className={styles.label} htmlFor={`${id}-key`}>
                API key (optional)
              </label>
              <input
                id={`${id}-key`}
                className={`${styles.field} ${styles.mono}`}
                type="password"
                autoComplete="off"
                placeholder={
                  custom && keys.custom
                    ? "Leave empty to keep the saved key"
                    : "Leave empty if not needed"
                }
                value={form.key}
                onChange={(event) => edit("key", event.target.value)}
                onKeyDown={onEnter(saveForm)}
              />
            </div>
            {custom && modelsOf(custom.name, customModels, true)}
            <div className={styles.formFoot}>
              {custom ? (
                <button
                  type="button"
                  className={styles.textButton}
                  aria-label="Remove custom provider"
                  disabled={busy}
                  onClick={removeProvider}
                >
                  Remove provider
                </button>
              ) : (
                // A key left by a failed save, with no provider.
                keys.custom && (
                  <button
                    type="button"
                    className={styles.textButton}
                    aria-label="Remove custom provider key"
                    disabled={busy}
                    onClick={removeProvider}
                  >
                    Remove key
                  </button>
                )
              )}
              <button
                type="button"
                className={`${styles.button} ${styles.primary}`}
                aria-label="Save custom provider"
                disabled={busy}
                onClick={saveForm}
              >
                Save
              </button>
            </div>
            {errorAt("custom")}
          </div>
        </div>
      </section>

      <section className={styles.section} aria-labelledby={`${id}-search`}>
        <h2 className={styles.h2} id={`${id}-search`}>
          Web search
        </h2>
        <div className={styles.list}>
          {keyRow("tavily", "Tavily", "Lets the chat search the web")}
        </div>
      </section>
    </div>
  );
}
