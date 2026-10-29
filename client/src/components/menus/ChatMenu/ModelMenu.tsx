import { Check } from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import {
  isKeySaved,
  listModels,
  type ModelGroup,
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
  | { state: "ready"; groups: ModelGroup[] };

// Lists the models live from each provider, and takes the provider keys.
export function ModelMenu({
  model,
  onChoose,
  onClose,
}: {
  model: string | null;
  onChoose: (model: string) => void;
  onClose: () => void;
}) {
  const id = useId();
  const menu = useRef<HTMLDivElement>(null);
  const [saved, setSaved] = useState<boolean | null>(null);
  const [keyError, setKeyError] = useState<string | null>(null);
  const [key, setKey] = useState("");
  const [models, setModels] = useState<Models>({ state: "loading" });

  const refresh = useCallback(async () => {
    setModels({ state: "loading" });
    let hasKey: boolean;
    try {
      hasKey = await isKeySaved("opencode-go");
      setSaved(hasKey);
      setKeyError(null);
    } catch (e) {
      setKeyError(errorMessage(e));
      setModels({ state: "noKey" });
      return;
    }
    if (!hasKey) {
      setModels({ state: "noKey" });
      return;
    }
    try {
      setModels({ state: "ready", groups: await listModels() });
    } catch (e) {
      setModels({ state: "error", message: errorMessage(e) });
    }
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

  const submitKey = async () => {
    try {
      await saveKey("opencode-go", key);
      setKey("");
      await refresh();
    } catch (e) {
      setKeyError(errorMessage(e));
    }
  };

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
      {models.state === "loading" && (
        <p className={styles.menuNote}>Loading models…</p>
      )}
      {models.state === "noKey" && (
        <p className={styles.menuNote}>Save a key below to list the models.</p>
      )}
      {models.state === "error" && (
        <p className={styles.menuError}>{models.message}</p>
      )}
      {models.state === "ready" &&
        models.groups.map((group) => (
          <ul
            key={group.backend}
            className={styles.modelList}
            aria-label={group.label}
          >
            {group.models.map((name) => (
              <li key={name}>
                <button
                  type="button"
                  className={styles.modelItem}
                  aria-pressed={name === model}
                  onClick={() => onChoose(name)}
                >
                  <span className={styles.modelCheck}>
                    {name === model && (
                      <Check size={14} strokeWidth={1.75} aria-hidden />
                    )}
                  </span>
                  {name}
                </button>
              </li>
            ))}
          </ul>
        ))}
      <hr className={styles.separator} />
      <h3 className={styles.heading}>Keys</h3>
      {/* Not a form: the menu sits inside the composer's form, and a nested
          form's submit would also send the draft. */}
      <div className={styles.keyForm}>
        <div className={styles.keyRow}>
          <label htmlFor={`${id}-key`}>OpenCode Go</label>
          <span className={styles.keyStatus}>
            {saved === null ? "" : saved ? "Saved" : "Not set"}
          </span>
        </div>
        <div className={styles.keyRow}>
          <input
            id={`${id}-key`}
            aria-label="OpenCode Go key"
            className={styles.keyField}
            type="password"
            autoComplete="off"
            placeholder={saved ? "Replace key" : "Paste key"}
            value={key}
            onChange={(event) => setKey(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                submitKey();
              }
            }}
          />
          <button type="button" className={styles.keySave} onClick={submitKey}>
            Save
          </button>
        </div>
        {keyError && <p className={styles.menuError}>{keyError}</p>}
      </div>
    </div>
  );
}
