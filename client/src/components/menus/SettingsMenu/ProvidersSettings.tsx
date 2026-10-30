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
  type CodexStatus,
  codexStatus,
  isKeySaved,
  type KeyProvider,
  listModels,
  removeKey,
  saveKey,
} from "@/lib/chat/chatApi";
import { errorMessage } from "@/lib/errorMessage";
import { runningChange, startChange } from "./changeGuard";
import styles from "./SettingsMenu.module.css";

type Models =
  | { state: "loading" }
  | { state: "error"; message: string }
  | { state: "ready"; models: string[] };

type Keys = Record<KeyProvider, boolean | null>;

const NO_KEYS: Keys = { "opencode-go": null, tavily: null };

// Each provider shows at most this many model ids.
const MODEL_CAP = 10;

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

// The provider keys. Keys stay in the key file: this page only saves
// and removes them.
export function ProvidersSettings() {
  const id = useId();
  const [keys, setKeys] = useState<Keys>(NO_KEYS);
  const [goModels, setGoModels] = useState<Models | null>(null);
  // null while Codex starts.
  const [codex, setCodex] = useState<CodexStatus | null>(null);
  // The saved key being replaced.
  const [replacing, setReplacing] = useState<KeyProvider | null>(null);
  const [drafts, setDrafts] = useState<Record<KeyProvider, string>>({
    "opencode-go": "",
    tavily: "",
  });
  // Shown under the provider whose change failed.
  const [error, setError] = useState<{
    at: KeyProvider | "load";
    message: string;
  } | null>(null);
  // A key change is running, maybe from a page left earlier:
  // Save and Remove wait for it.
  const [busy, setBusy] = useState(() => runningChange() !== null);
  // The first load has ended: until then nothing can be saved, so no change
  // overlaps it.
  const [loaded, setLoaded] = useState(false);
  // Counts the loads: only the latest one shows its model lists, which can
  // still be loading when a change starts.
  const loads = useRef(0);
  // The key drafts as last rendered, for a save that ends later.
  const typedKeys = useRef(drafts);
  typedKeys.current = drafts;

  const checkCodex = useCallback(() => {
    setCodex(null);
    return codexStatus().then(setCodex, (e) =>
      setCodex({ state: "error", message: errorMessage(e) }),
    );
  }, []);

  // Loads the keys, then lists the models. A newer load wins: an older one
  // then shows nothing.
  const refresh = useCallback(async () => {
    const load = ++loads.current;
    const latest = () => load === loads.current;
    let saved: Keys;
    try {
      const [go, tavily] = await Promise.all([
        isKeySaved("opencode-go"),
        isKeySaved("tavily"),
      ]);
      if (!latest()) return;
      saved = { "opencode-go": go, tavily };
      setKeys(saved);
      setError(null);
    } catch (e) {
      if (latest()) {
        setError({ at: "load", message: errorMessage(e) });
        setLoaded(true);
      }
      return;
    }
    setLoaded(true);
    if (!saved["opencode-go"]) {
      setGoModels(null);
      return;
    }
    setGoModels({ state: "loading" });
    try {
      const models = await listModels("opencode-go");
      if (latest()) setGoModels({ state: "ready", models });
    } catch (e) {
      if (latest()) setGoModels({ state: "error", message: errorMessage(e) });
    }
  }, []);

  useEffect(() => {
    // Loads what a change still running leaves, once it ends.
    const pending = runningChange();
    if (pending) {
      pending.then(() => {
        setBusy(false);
        refresh();
      });
    } else {
      refresh();
    }
    checkCodex();
  }, [refresh, checkCodex]);

  // Runs a change to the keys, then loads again. A failed change may still
  // have changed something, so it loads again too and keeps its error and
  // what was typed.
  const change = async (
    at: KeyProvider,
    act: () => Promise<unknown>,
    sent?: string,
  ) => {
    if (!loaded) return;
    const run = startChange(async () => {
      try {
        await act();
        // A removal sends no key.
        if (sent === undefined || typedKeys.current[at] === sent) {
          setReplacing((open) => (open === at ? null : open));
          setDrafts((typed) => ({ ...typed, [at]: "" }));
        } else {
          // A key typed during the save stays open to be saved.
          setReplacing(at);
        }
        await refresh();
      } catch (e) {
        const message = errorMessage(e);
        await refresh();
        setError({ at, message });
      }
    });
    if (!run) return;
    setBusy(true);
    await run;
    setBusy(false);
  };

  const errorAt = (at: KeyProvider | "load") =>
    error?.at === at && <p className={styles.error}>{error.message}</p>;

  const keyState = (saved: boolean | null) =>
    saved === null ? null : saved ? (
      <State ok>Key saved</State>
    ) : (
      <State>No key</State>
    );

  const keyRow = (
    provider: KeyProvider,
    name: string,
    sub: string,
    models?: ReactNode,
  ) => {
    const saved = keys[provider];
    const save = () =>
      change(
        provider,
        () => saveKey(provider, drafts[provider]),
        drafts[provider],
      );
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
                disabled={busy}
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

  const modelsOf = (name: string, models: Models | null) =>
    models === null ? null : models.state === "loading" ? (
      <p className={styles.caption}>Loading models…</p>
    ) : models.state === "error" ? (
      <p className={styles.error}>{models.message}</p>
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
          Keys are kept in a file in the app config folder. The chat model menu
          lists the models of each provider you set up here.
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
