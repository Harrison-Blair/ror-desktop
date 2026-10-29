import type { LucideIcon } from "lucide-react";
import {
  type KeyboardEvent,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import styles from "./NotesMenu.module.css";

export type NotesMenuItem =
  | "separator"
  | { label: string; icon?: LucideIcon; shortcut?: string; run: () => void };

// Distance kept between the menu and the window edge.
const EDGE = 4;

export function NotesMenu({
  label,
  x,
  y,
  items,
  onRun,
  onClose,
}: {
  label: string;
  x: number;
  y: number;
  items: NotesMenuItem[];
  onRun: (item: Exclude<NotesMenuItem, "separator">) => void;
  onClose: () => void;
}) {
  const menu = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ left: x, top: y });

  useLayoutEffect(() => {
    const element = menu.current;
    if (!element) return;
    const { width, height } = element.getBoundingClientRect();
    setPosition({
      left: Math.max(EDGE, Math.min(x, window.innerWidth - width - EDGE)),
      top: Math.max(EDGE, Math.min(y, window.innerHeight - height - EDGE)),
    });
    element.querySelector("button")?.focus();
  }, [x, y]);

  useEffect(() => {
    const closeOutside = (event: PointerEvent) => {
      if (!menu.current?.contains(event.target as Node)) onClose();
    };
    document.addEventListener("pointerdown", closeOutside);
    return () => document.removeEventListener("pointerdown", closeOutside);
  }, [onClose]);

  const onKeyDown = (event: KeyboardEvent) => {
    const buttons = [...(menu.current?.querySelectorAll("button") ?? [])];
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const focusAt = (i: number) =>
      buttons[(i + buttons.length) % buttons.length]?.focus();
    switch (event.key) {
      case "ArrowDown":
        focusAt(index + 1);
        break;
      case "ArrowUp":
        focusAt(index - 1);
        break;
      case "Home":
        focusAt(0);
        break;
      case "End":
        focusAt(-1);
        break;
      case "Escape":
      case "Tab":
        onClose();
        break;
      default:
        return;
    }
    event.preventDefault();
  };

  return (
    <div
      ref={menu}
      role="menu"
      aria-label={label}
      className={styles.menu}
      style={position}
      onKeyDown={onKeyDown}
    >
      {items.map((item, index) =>
        item === "separator" ? (
          // biome-ignore lint/suspicious/noArrayIndexKey: the item list is fixed per menu.
          <hr key={index} className={styles.separator} />
        ) : (
          <button
            key={item.label}
            type="button"
            role="menuitem"
            tabIndex={-1}
            className={styles.item}
            onClick={() => onRun(item)}
          >
            {item.icon ? (
              <item.icon size={16} strokeWidth={1.75} aria-hidden />
            ) : (
              <span className={styles.iconSlot} aria-hidden />
            )}
            {item.label}
            {item.shortcut && (
              <span className={styles.shortcut}>{item.shortcut}</span>
            )}
          </button>
        ),
      )}
    </div>
  );
}
