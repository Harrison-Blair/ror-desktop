import { Check } from "lucide-react";
import {
  type KeyboardEvent,
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
import styles from "./ChatMenu.module.css";

const errorMessage = (e: unknown) =>
  typeof e === "object" && e !== null && "message" in e
    ? String(e.message)
    : String(e);

type Models =
  | { state: "loading" }
  | { state: "noKey" }
  | { state: "error"; message: string }
  | { state: "ready"; models: string[] };

type Keys = Record<KeyProvider, boolean | null>;

const NO_KEYS: Keys = { "opencode-go": null, tavily: null, custom: null };

// Enter in a field acts on the menu, never on the composer's form.
const onEnter =
  (act: () => void) => (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      act();
    }
  };

// Lists the models live from each provider, and takes the provider keys.
export function ModelMenu({
  model,
  backend,
  lockedTo,
  onChoose,
  onProviderRemoved,
  onClose,
}: {
  model: string | null;
  backend: BackendId;
  // The backend the open chat is on: the others can't be chosen.
  lockedTo: BackendId | null;
  onChoose: (backend: BackendId, model: string) => void;
  onProviderRemoved: (backend: BackendId) => void;
  onClose: () => void;
}) {
  const id = useId();
  const menu = useRef<HTMLDivElement>(null);
  const [keys, setKeys] = useState<Keys>(NO_KEYS);
  const [custom, setCustom] = useState<CustomProvider | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [goModels, setGoModels] = useState<Models>({ state: "loading" });
  const [customModels, setCustomModels] = useState<Models>({
    state: "loading",
  });
  // null while Codex starts.
  const [codex, setCodex] = useState<CodexStatus | null>(null);
  // The provider whose key field is open, or the custom provider's form.
  const [adding, setAdding] = useState<KeyProvider | "form" | null>(null);
  const [key, setKey] = useState("");
  const [form, setForm] = useState({ name: "", baseUrl: "", key: "" });
  const [modelId, setModelId] = useState("");
  // A key or provider change is running: Save and Remove wait for it.
  const [busy, setBusy] = useState(false);
  const running = useRef(false);

  const refresh = useCallback(async () => {
    setGoModels({ state: "loading" });
    const codexLoaded = codexStatus().then(setCodex, (e) =>
      setCodex({ state: "error", message: errorMessage(e) }),
    );
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
      setError(errorMessage(e));
      setGoModels({ state: "noKey" });
      return;
    }
    const load = async (
      from: BackendId,
      set: (models: Models) => void,
    ): Promise<void> => {
      set({ state: "loading" });
      try {
        set({ state: "ready", models: await listModels(from) });
      } catch (e) {
        set({ state: "error", message: errorMessage(e) });
      }
    };
    await Promise.all([
      saved["opencode-go"]
        ? load("opencode-go", setGoModels)
        : setGoModels({ state: "noKey" }),
      provider && load("custom", setCustomModels),
      codexLoaded,
    ]);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    const closeOutside = (event: PointerEvent) => {
      const target = event.target as Node;
      // The model button toggles the menu itself.
      const button = menu.current?.parentElement?.querySelector("button");
      if (!menu.current?.contains(target) && !button?.contains(target)) {
        onClose();
      }
    };
    document.addEventListener("pointerdown", closeOutside);
    return () => document.removeEventListener("pointerdown", closeOutside);
  }, [onClose]);

  // Runs a change to the keys or the provider, then lists again. A failed
  // change may still have changed something, so it lists again too and
  // keeps its error.
  const change = async (act: () => Promise<unknown>) => {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    try {
      await act();
      setAdding(null);
      setKey("");
      await refresh();
    } catch (e) {
      const message = errorMessage(e);
      await refresh();
      setError(message);
    } finally {
      running.current = false;
      setBusy(false);
    }
  };

  const removeProvider = () =>
    change(async () => {
      await removeCustomProvider();
      onProviderRemoved("custom");
    });

  const open = (what: KeyProvider | "form") => {
    setError(null);
    setKey("");
    if (what === "form") {
      setForm({
        name: custom?.name ?? "",
        baseUrl: custom?.baseUrl ?? "",
        key: "",
      });
    }
    setAdding(what);
  };

  const label = (from: BackendId) =>
    from === "opencode-go"
      ? "OpenCode Go"
      : from === "codex"
        ? "Codex"
        : (custom?.name ?? "Custom");

  // `unavailable`: the models show but can't be chosen.
  const group = (from: BackendId, models: Models, unavailable = false) => {
    const locked = lockedTo !== null && lockedTo !== from;
    const list = models.state === "ready" ? models.models : [];
    const typeId =
      from === "custom" && models.state !== "loading" && list.length === 0;
    return (
      <>
        {models.state === "loading" && (
          <p className={styles.menuNote}>Loading models…</p>
        )}
        {models.state === "noKey" && (
          <p className={styles.menuNote}>Add a key below to list the models.</p>
        )}
        {models.state === "error" &&
          (from === "custom" ? (
            <p className={styles.menuNote} title={models.message}>
              Could not list models from this provider.
            </p>
          ) : (
            <p className={styles.menuError}>{models.message}</p>
          ))}
        {list.length > 0 && (
          <ul className={styles.modelList} aria-label={label(from)}>
            {list.map((name) => {
              const chosen = name === model && from === backend;
              return (
                <li key={name}>
                  <button
                    type="button"
                    className={styles.modelItem}
                    aria-pressed={chosen}
                    disabled={locked || unavailable}
                    onClick={() => onChoose(from, name)}
                  >
                    <span className={styles.modelCheck}>
                      {chosen && (
                        <Check size={14} strokeWidth={1.75} aria-hidden />
                      )}
                    </span>
                    {name}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {typeId && !locked && (
          <div className={styles.keyRow}>
            <input
              aria-label="Model id"
              className={styles.keyField}
              placeholder="Type a model id"
              value={modelId}
              onChange={(event) => setModelId(event.target.value)}
              onKeyDown={onEnter(() => {
                if (modelId.trim()) onChoose("custom", modelId.trim());
              })}
            />
            <button
              type="button"
              className={styles.keySave}
              onClick={() => {
                if (modelId.trim()) onChoose("custom", modelId.trim());
              }}
            >
              Use
            </button>
          </div>
        )}
        {/* Only under models it locks. */}
        {locked && list.length > 0 && (
          <p className={styles.menuNote}>
            This chat uses {label(lockedTo)}. Start a new chat to use another
            provider.
          </p>
        )}
      </>
    );
  };

  const keyRow = (provider: KeyProvider, name: string) => {
    const saved = keys[provider];
    return (
      <>
        <div className={styles.providerRow}>
          <span className={styles.providerName}>{name}</span>
          <span className={styles.keyStatus}>
            {saved === null ? "" : saved ? "Saved" : "Not set"}
          </span>
          {saved === true && (
            <button
              type="button"
              className={styles.rowButton}
              aria-label={`Remove ${name} key`}
              disabled={busy}
              onClick={() => change(() => removeKey(provider))}
            >
              Remove
            </button>
          )}
          {saved === false && (
            <button
              type="button"
              className={styles.rowButton}
              aria-label={`Add ${name} key`}
              onClick={() => open(provider)}
            >
              Add
            </button>
          )}
        </div>
        {adding === provider && (
          <div className={styles.keyRow}>
            <input
              aria-label={`${name} key`}
              className={styles.keyField}
              type="password"
              autoComplete="off"
              placeholder="Paste key"
              // biome-ignore lint/a11y/noAutofocus: the field opens on Add
              autoFocus
              value={key}
              onChange={(event) => setKey(event.target.value)}
              onKeyDown={onEnter(() => change(() => saveKey(provider, key)))}
            />
            <button
              type="button"
              className={styles.keySave}
              disabled={busy}
              onClick={() => change(() => saveKey(provider, key))}
            >
              Save
            </button>
          </div>
        )}
      </>
    );
  };

  const saveForm = () =>
    change(() => saveCustomProvider(form.name, form.baseUrl, form.key || null));

  return (
    <div
      ref={menu}
      className={styles.modelMenu}
      role="dialog"
      aria-label="Models and keys"
      onKeyDown={(event) => {
        if (event.key === "Escape") onClose();
      }}
    >
      <h3 className={styles.heading}>OpenCode Go</h3>
      {group("opencode-go", goModels)}
      {custom && (
        <>
          <div className={styles.groupHeading}>
            <h3 className={styles.heading}>{custom.name}</h3>
            <span className={styles.headingLabel}>Custom</span>
          </div>
          {group("custom", customModels)}
        </>
      )}
      <div className={styles.groupHeading}>
        <h3 className={styles.heading}>Codex</h3>
        <span className={styles.headingLabel}>
          {codex?.state === "ready"
            ? "Signed in"
            : codex?.state === "signedOut"
              ? "Run codex login"
              : codex?.state === "notInstalled"
                ? "Install Codex"
                : ""}
        </span>
      </div>
      {codex?.state === "notInstalled" && (
        <p className={styles.menuNote}>
          Install the Codex CLI, then run codex login.
        </p>
      )}
      {codex?.state === "signedOut" && (
        <p className={styles.menuNote}>
          Run codex login in a terminal to use these models.
        </p>
      )}
      {group(
        "codex",
        codex === null
          ? { state: "loading" }
          : codex.state === "error"
            ? codex
            : {
                state: "ready",
                models: codex.state === "notInstalled" ? [] : codex.models,
              },
        codex?.state !== "ready",
      )}
      <hr className={styles.separator} />
      <div className={styles.groupHeading}>
        <h3 className={styles.heading}>Providers and keys</h3>
        <span className={styles.headingLabel}>System keychain</span>
      </div>
      {/* Not a form: the menu sits inside the composer's form, and a nested
          form's submit would also send the draft. */}
      <div className={styles.keyForm}>
        {keyRow("opencode-go", "OpenCode Go")}
        {keyRow("tavily", "Tavily")}
        <div className={styles.providerRow}>
          <span className={styles.providerName}>
            {custom?.name ?? "Custom provider"}
          </span>
          <span className={styles.keyStatus}>
            {!custom
              ? keys.custom
                ? "Key only"
                : "Not set"
              : keys.custom
                ? "Saved"
                : "No key"}
          </span>
          {custom ? (
            <>
              <button
                type="button"
                className={styles.rowButton}
                aria-label="Edit custom provider"
                onClick={() => open("form")}
              >
                Edit
              </button>
              <button
                type="button"
                className={styles.rowButton}
                aria-label="Remove custom provider"
                disabled={busy}
                onClick={removeProvider}
              >
                Remove
              </button>
            </>
          ) : (
            <>
              {/* A key left by a failed save, with no provider. */}
              {keys.custom && (
                <button
                  type="button"
                  className={styles.rowButton}
                  aria-label="Remove custom provider key"
                  disabled={busy}
                  onClick={removeProvider}
                >
                  Remove
                </button>
              )}
              <button
                type="button"
                className={styles.rowButton}
                aria-label="Add custom provider"
                onClick={() => open("form")}
              >
                Add
              </button>
            </>
          )}
        </div>
        {adding === "form" && (
          <div className={styles.providerForm}>
            <label className={styles.formLabel} htmlFor={`${id}-name`}>
              Name
            </label>
            <input
              id={`${id}-name`}
              className={styles.textField}
              // biome-ignore lint/a11y/noAutofocus: the form opens on Add or Edit
              autoFocus
              value={form.name}
              onChange={(event) =>
                setForm({ ...form, name: event.target.value })
              }
              onKeyDown={onEnter(saveForm)}
            />
            <label className={styles.formLabel} htmlFor={`${id}-url`}>
              Base URL
            </label>
            <input
              id={`${id}-url`}
              className={styles.keyField}
              placeholder="http://localhost:11434/v1"
              value={form.baseUrl}
              onChange={(event) =>
                setForm({ ...form, baseUrl: event.target.value })
              }
              onKeyDown={onEnter(saveForm)}
            />
            <label className={styles.formLabel} htmlFor={`${id}-key`}>
              API key (optional)
            </label>
            <input
              id={`${id}-key`}
              className={styles.keyField}
              type="password"
              autoComplete="off"
              placeholder={
                custom && keys.custom
                  ? "Leave empty to keep the saved key"
                  : "Leave empty if not needed"
              }
              value={form.key}
              onChange={(event) =>
                setForm({ ...form, key: event.target.value })
              }
              onKeyDown={onEnter(saveForm)}
            />
            <p className={styles.formHint}>
              OpenAI-compatible. The model list comes from GET /models.
            </p>
            <div className={styles.formButtons}>
              <button
                type="button"
                className={styles.keySave}
                onClick={() => setAdding(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className={styles.keySave}
                disabled={busy}
                onClick={saveForm}
              >
                Save
              </button>
            </div>
          </div>
        )}
        {error && <p className={styles.menuError}>{error}</p>}
      </div>
    </div>
  );
}
