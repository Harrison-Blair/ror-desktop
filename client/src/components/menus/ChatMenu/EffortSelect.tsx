import { useEffect, useState } from "react";
import {
  type BackendId,
  codexStatus,
  opencodeModelInfo,
} from "@/lib/chat/chatApi";
import { modelLabel } from "@/lib/chat/modelLabel";
import styles from "./ChatMenu.module.css";
import { type Choice, ChoiceMenu } from "./ChoiceMenu";

// The efforts a model offers, and the one a saved effort it lacks shows as.
type Levels = { choices: Choice<string | null>[]; fallback: string | null };

// Codex lists each model's efforts. OpenCode Go models take the efforts
// models.dev lists, after Default, which sends none.
const loadLevels = async (
  backend: BackendId,
  model: string,
): Promise<Levels | null> => {
  if (backend === "codex") {
    const status = await codexStatus();
    if (!("models" in status)) return null;
    const info = status.models.find((m) => m.name === model);
    if (!info || info.efforts.length === 0) return null;
    return {
      choices: info.efforts.map(({ effort }) => ({
        value: effort,
        name: effort,
      })),
      fallback: info.defaultEffort,
    };
  }
  const info = await opencodeModelInfo(model);
  if (!info || info.efforts.length === 0) return null;
  return {
    choices: [
      { value: null, name: "Default" },
      ...info.efforts.map((effort) => ({ value: effort, name: effort })),
    ],
    fallback: null,
  };
};

// The footer row with the reasoning effort of the model. Shows nothing until
// the model's efforts are known, or when it offers none.
export function EffortSelect({
  backend,
  model,
  effort,
  onChoose,
}: {
  backend: BackendId;
  model: string;
  // The saved effort. One the model doesn't offer shows as its default.
  effort: string | null;
  onChoose: (effort: string | null) => void;
}) {
  const [levels, setLevels] = useState<Levels | null>(null);

  useEffect(() => {
    let current = true;
    setLevels(null);
    loadLevels(backend, model).then(
      (next) => {
        if (current) setLevels(next);
      },
      // The model menu shows Codex errors. Without models.dev there is no
      // effort row.
      () => {},
    );
    return () => {
      current = false;
    };
  }, [backend, model]);

  if (!levels) return null;
  const value = levels.choices.some((c) => c.value === effort)
    ? effort
    : levels.fallback;
  return (
    <div className={styles.effortRow}>
      <div className={styles.effortSlot}>
        <ChoiceMenu
          label="Effort"
          heading={{ title: "Effort", label: modelLabel(backend, model) }}
          choices={levels.choices}
          value={value}
          onChoose={onChoose}
          variant="effort"
        />
      </div>
    </div>
  );
}
