import { Check } from "lucide-react";
import {
  type KeyboardEvent,
  useCallback,
  useEffect,
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
  listModels,
} from "@/lib/chat/chatApi";
import { errorMessage } from "@/lib/errorMessage";
import styles from "./ChatMenu.module.css";

type Models =
  | { state: "loading" }
  | { state: "noKey" }
  | { state: "error"; message: string }
  | { state: "ready"; models: string[] };

// Enter in a field acts on the menu, never on the composer's form.
const onEnter =
  (act: () => void) => (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      act();
    }
  };

// Lists the models live from each provider. Keys and the custom provider
// are set up in Settings.
export function ModelMenu({
  model,
  backend,
  lockedTo,
  onChoose,
  onClose,
}: {
  model: string | null;
  backend: BackendId;
  // The backend the open chat is on: the others can't be chosen.
  lockedTo: BackendId | null;
  onChoose: (backend: BackendId, model: string) => void;
  onClose: () => void;
}) {
  const menu = useRef<HTMLDivElement>(null);
  // null until the key is checked.
  const [goKey, setGoKey] = useState<boolean | null>(null);
  const [custom, setCustom] = useState<CustomProvider | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [goModels, setGoModels] = useState<Models>({ state: "loading" });
  const [customModels, setCustomModels] = useState<Models>({
    state: "loading",
  });
  // null while Codex starts.
  const [codex, setCodex] = useState<CodexStatus | null>(null);
  const [modelId, setModelId] = useState("");

  const refresh = useCallback(async () => {
    setGoModels({ state: "loading" });
    const codexLoaded = codexStatus().then(setCodex, (e) =>
      setCodex({ state: "error", message: errorMessage(e) }),
    );
    let saved: boolean;
    let provider: CustomProvider | null;
    try {
      const [go, settings] = await Promise.all([
        isKeySaved("opencode-go"),
        getChatSettings(),
      ]);
      saved = go;
      provider = settings.customProvider;
      setGoKey(saved);
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
      saved
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
              className={styles.textField}
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

  return (
    <div
      ref={menu}
      className={styles.modelMenu}
      role="dialog"
      aria-label="Models"
      onKeyDown={(event) => {
        if (event.key === "Escape") onClose();
      }}
    >
      <div className={styles.groupHeading}>
        <h3 className={styles.heading}>OpenCode Go</h3>
        <span className={styles.headingLabel}>
          {goKey === null ? "" : goKey ? "Key saved" : "No key"}
        </span>
      </div>
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
      {error && <p className={styles.menuError}>{error}</p>}
    </div>
  );
}
