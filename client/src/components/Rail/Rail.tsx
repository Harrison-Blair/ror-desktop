import {
  type LucideIcon,
  PanelLeftClose,
  PanelLeftOpen,
  Square,
} from "lucide-react";
import styles from "./Rail.module.css";

export type RailItem = {
  id: string;
  label: string;
  icon?: LucideIcon;
};

type RailProps = {
  items: RailItem[];
  bottomItems?: RailItem[];
  activeId?: string;
  onSelect?: (id: string) => void;
  menuOpen?: boolean;
  onToggleMenu?: () => void;
  label?: string;
};

export function Rail({
  items,
  bottomItems,
  activeId,
  onSelect,
  menuOpen = true,
  onToggleMenu,
  label = "Main",
}: RailProps) {
  const ToggleIcon = menuOpen ? PanelLeftClose : PanelLeftOpen;
  const renderItem = (item: RailItem) => {
    const Icon = item.icon ?? Square;
    const active = item.id === activeId;
    return (
      <button
        key={item.id}
        type="button"
        className={active ? `${styles.item} ${styles.active}` : styles.item}
        aria-label={item.label}
        aria-pressed={active}
        onClick={() => onSelect?.(item.id)}
      >
        <Icon size={20} strokeWidth={1.75} aria-hidden />
        <span className={styles.tip} aria-hidden>
          {item.label}
        </span>
      </button>
    );
  };

  return (
    <nav className={styles.rail} aria-label={label}>
      {onToggleMenu && (
        <button
          type="button"
          className={`${styles.item} ${styles.toggle}`}
          aria-label={menuOpen ? "Hide menu" : "Show menu"}
          aria-expanded={menuOpen}
          onClick={onToggleMenu}
        >
          <ToggleIcon size={20} strokeWidth={1.75} aria-hidden />
        </button>
      )}
      <div className={styles.group}>{items.map(renderItem)}</div>
      {bottomItems && (
        <div className={`${styles.group} ${styles.end}`}>
          {bottomItems.map(renderItem)}
        </div>
      )}
    </nav>
  );
}
