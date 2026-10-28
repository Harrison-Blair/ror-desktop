import type { PointerEvent } from "react";
import styles from "./ResizeHandle.module.css";

type ResizeHandleProps = {
  label: string;
  edge: "left" | "right";
  width: number;
  onResize: (width: number) => void;
  onReset: () => void;
};

export function ResizeHandle({
  label,
  edge,
  width,
  onResize,
  onReset,
}: ResizeHandleProps) {
  const startDrag = (event: PointerEvent<HTMLHRElement>) => {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const startX = event.clientX;
    const direction = edge === "right" ? 1 : -1;
    const move = (moveEvent: globalThis.PointerEvent) =>
      onResize(width + direction * (moveEvent.clientX - startX));
    const end = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
      document.body.style.userSelect = "";
    };
    document.body.style.userSelect = "none";
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
  };

  return (
    <hr
      aria-orientation="vertical"
      aria-label={label}
      className={`${styles.handle} ${styles[edge]}`}
      onPointerDown={startDrag}
      onDoubleClick={onReset}
    />
  );
}
