import type { ReactNode } from "react";
import styles from "./RailPanel.module.css";

export type RailPanelItem = {
  id: string;
  label: string;
};

type RailPanelProps = {
  title: string;
  open?: boolean;
  items?: RailPanelItem[];
  activeId?: string;
  onSelect?: (id: string) => void;
  children?: ReactNode;
  width?: number;
  resizeHandle?: ReactNode;
};

export function RailPanel({
  title,
  open = true,
  items,
  activeId,
  onSelect,
  children,
  width,
  resizeHandle,
}: RailPanelProps) {
  if (!open) return null;

  return (
    <section
      className={styles.menu}
      aria-label={`${title} menu`}
      style={{ width }}
    >
      <header className={styles.head}>
        <h2 className={styles.title}>{title}</h2>
      </header>
      <div className={styles.body}>
        {children ??
          items?.map((item) => {
            const active = item.id === activeId;
            return (
              <button
                key={item.id}
                type="button"
                className={
                  active ? `${styles.item} ${styles.active}` : styles.item
                }
                aria-pressed={active}
                onClick={() => onSelect?.(item.id)}
              >
                {item.label}
              </button>
            );
          })}
      </div>
      {resizeHandle}
    </section>
  );
}
