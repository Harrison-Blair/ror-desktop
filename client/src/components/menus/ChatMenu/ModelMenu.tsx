import { Check } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  type BackendId,
  type CodexStatus,
  codexStatus,
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

// Lists the models live from each provider. Keys are set up in Settings.
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
  const [error, setError] = useState<string | null>(null);
  const [goModels, setGoModels] = useState<Models>({ state: "loading" });
  // null while Codex starts.
  const [codex, setCodex] = useState<CodexStatus | null>(null);

  const refresh = useCallback(async () => {
    setGoModels({ state: "loading" });
    const codexLoaded = codexStatus().then(setCodex, (e) =>
      setCodex({ state: "error", message: errorMessage(e) }),
    );
    let saved: boolean;
    try {
      saved = await isKeySaved("opencode-go");
      setGoKey(saved);
      setError(null);
    } catch (e) {
      setError(errorMessage(e));
      setGoModels({ state: "noKey" });
      return;
    }
    const loadGo = async () => {
      try {
        setGoModels({
          state: "ready",
          models: await listModels("opencode-go"),
        });
      } catch (e) {
        setGoModels({ state: "error", message: errorMessage(e) });
      }
    };
    await Promise.all([
      saved ? loadGo() : setGoModels({ state: "noKey" }),
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
    from === "opencode-go" ? "OpenCode Go" : "Codex";

  // `unavailable`: the models show but can't be chosen.
  const group = (from: BackendId, models: Models, unavailable = false) => {
    const locked = lockedTo !== null && lockedTo !== from;
    const list = models.state === "ready" ? models.models : [];
    return (
      <>
        {models.state === "loading" && (
          <p className={styles.menuNote}>Loading models…</p>
        )}
        {models.state === "error" && (
          <p className={styles.menuError}>{models.message}</p>
        )}
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
