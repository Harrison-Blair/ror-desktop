import { useEffect, useState } from "react";
import { type CodexModel, codexStatus } from "@/lib/chat/chatApi";
import styles from "./ChatMenu.module.css";

// The reasoning effort of a Codex model. Shows nothing until Codex lists the
// model, or when the model offers no efforts.
export function EffortSelect({
  model,
  effort,
  onChoose,
}: {
  model: string;
  // The saved effort. One the model doesn't offer shows as its default.
  effort: string | null;
  onChoose: (effort: string) => void;
}) {
  const [info, setInfo] = useState<CodexModel | null>(null);

  useEffect(() => {
    let current = true;
    setInfo(null);
    codexStatus().then(
      (status) => {
        if (!current || !("models" in status)) return;
        setInfo(status.models.find((m) => m.name === model) ?? null);
      },
      // The model menu shows Codex errors.
      () => {},
    );
    return () => {
      current = false;
    };
  }, [model]);

  if (!info || info.efforts.length === 0) return null;
  const value = info.efforts.some((e) => e.effort === effort)
    ? (effort as string)
    : info.defaultEffort;
  return (
    <select
      className={styles.effort}
      aria-label="Effort"
      title={info.efforts.find((e) => e.effort === value)?.description}
      value={value}
      onChange={(event) => onChoose(event.target.value)}
    >
      {info.efforts.map(({ effort, description }) => (
        <option key={effort} value={effort} title={description}>
          {effort}
        </option>
      ))}
    </select>
  );
}
