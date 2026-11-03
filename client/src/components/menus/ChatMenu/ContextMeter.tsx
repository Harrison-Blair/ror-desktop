import { useEffect, useId, useRef, useState } from "react";
import type { Context, Usage } from "@/lib/chat/chatApi";
import styles from "./ChatMenu.module.css";
import { breakdown, contextFill, fillLevel, formatTokens } from "./contextFill";

// The ring's circumference: radius 7 in a 20 by 20 box.
const RING = 2 * Math.PI * 7;
// How long the card stays after the pointer leaves, so it can reach the card.
const LEAVE_DELAY_MS = 150;

function Ring({ percent }: { percent: number | null }) {
  if (percent === null) {
    return (
      <svg width="16" height="16" viewBox="0 0 20 20" aria-hidden>
        <circle className={styles.ringUnknown} cx="10" cy="10" r="7" />
      </svg>
    );
  }
  const filled = (RING * Math.min(percent, 100)) / 100;
  return (
    <svg
      className={styles.ringSvg}
      width="16"
      height="16"
      viewBox="0 0 20 20"
      aria-hidden
    >
      <circle className={styles.ringTrack} cx="10" cy="10" r="7" />
      {filled > 0 && (
        <circle
          className={styles.ringFill}
          cx="10"
          cy="10"
          r="7"
          strokeDasharray={`${filled} ${RING}`}
        />
      )}
    </svg>
  );
}

// The doughnut that shows how full the context is. Hover or focus shows the
// breakdown card; a click pins it until Esc or a click outside.
export function ContextMeter({
  context,
  usage,
}: {
  context: Context | null;
  // What the whole chat spent.
  usage: Usage;
}) {
  const id = useId();
  const slot = useRef<HTMLDivElement>(null);
  const leaving = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [pinned, setPinned] = useState(false);
  const open = hovered || focused || pinned;

  const fill = contextFill(context);
  const percent =
    fill.kind === "known" ? fill.percent : fill.kind === "new" ? 0 : null;
  const level = percent === null ? "unknown" : fillLevel(percent);
  const percentText = percent === null ? "?%" : `${percent}%`;

  useEffect(() => () => clearTimeout(leaving.current), []);

  useEffect(() => {
    if (!pinned) return;
    const closeOutside = (event: PointerEvent) => {
      if (!slot.current?.contains(event.target as Node)) setPinned(false);
    };
    document.addEventListener("pointerdown", closeOutside);
    return () => document.removeEventListener("pointerdown", closeOutside);
  }, [pinned]);

  const enter = () => {
    clearTimeout(leaving.current);
    setHovered(true);
  };
  const leave = () => {
    leaving.current = setTimeout(() => setHovered(false), LEAVE_DELAY_MS);
  };

  const parts = context && breakdown(context);
  const rows: [string, string][] = parts
    ? [
        ["System prompt", `≈ ${formatTokens(parts.system)}`],
        ["Tools", `≈ ${formatTokens(parts.tools)}`],
        ["Conversation", `≈ ${formatTokens(parts.conversation)}`],
        ["Tool activity", `≈ ${formatTokens(parts.toolActivity)}`],
        ["Other", `≈ ${formatTokens(parts.other)}`],
        ...(parts.free === null
          ? []
          : [["Free", formatTokens(parts.free)] as [string, string]]),
      ]
    : [];

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: hover only keeps the card open; the button is the control
    <div
      ref={slot}
      className={styles.contextSlot}
      onMouseEnter={enter}
      onMouseLeave={leave}
      onKeyDown={(event) => {
        if (event.key === "Escape" && open) {
          event.stopPropagation();
          setPinned(false);
          setHovered(false);
          setFocused(false);
        }
      }}
    >
      <button
        type="button"
        className={styles.context}
        data-level={level}
        aria-label={
          percent === null ? "Context unknown" : `Context ${percentText}`
        }
        aria-expanded={open}
        aria-controls={id}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onClick={() => setPinned((p) => !p)}
      >
        <Ring percent={percent} />
        <span className={styles.contextPercent}>{percentText}</span>
      </button>
      {open && (
        <section
          id={id}
          className={styles.contextCard}
          aria-label="Context usage"
        >
          {pinned && (
            <p className={styles.contextPinned}>
              Pinned · Esc or click outside to close
            </p>
          )}
          <div className={styles.contextHead}>
            <h3 className={styles.contextTitle}>Context</h3>
            <span className={styles.contextHeadPercent} data-level={level}>
              {percentText}
            </span>
          </div>
          {fill.kind === "new" ? (
            <p className={styles.contextNote}>No reply yet.</p>
          ) : (
            <>
              <p className={styles.contextUsed}>
                {formatTokens(fill.used)} of{" "}
                {fill.kind === "known" ? formatTokens(fill.window) : "?"}
              </p>
              <dl className={styles.contextRows}>
                {rows.map(([label, value]) => (
                  <div key={label} className={styles.contextRow}>
                    <dt>{label}</dt>
                    <dd>{value}</dd>
                  </div>
                ))}
              </dl>
              <hr className={styles.contextSeparator} />
              <dl className={styles.contextRows}>
                <div className={styles.contextRow}>
                  <dt>This chat spent</dt>
                  <dd>
                    {formatTokens(usage.inputTokens + usage.outputTokens)}
                  </dd>
                </div>
              </dl>
              <p className={styles.contextHint}>
                ≈ estimated from text length, scaled to the provider's total.
              </p>
            </>
          )}
        </section>
      )}
    </div>
  );
}
