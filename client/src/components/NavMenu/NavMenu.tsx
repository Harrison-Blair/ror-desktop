import type { ReactNode } from "react";
import styles from "./NavMenu.module.css";

export type NavMenuItem = {
  id: string;
  label: string;
};

type NavMenuProps = {
  title: string;
  open?: boolean;
  items?: NavMenuItem[];
  activeId?: string;
  onSelect?: (id: string) => void;
  children?: ReactNode;
};

export function NavMenu({
  title,
  open = true,
  items,
  activeId,
  onSelect,
  children,
}: NavMenuProps) {
  if (!open) return null;

  return (
    <section className={styles.menu} aria-label={`${title} menu`}>
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
    </section>
  );
}
