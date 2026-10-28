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
  // Bottom items only: they act on their own instead of selecting a tab.
  pressed?: boolean;
  onClick?: () => void;
};

type RailProps = {
  items: RailItem[];
  bottomItems?: RailItem[];
  activeId?: string;
  onSelect?: (id: string) => void;
  railPanelOpen?: boolean;
  onToggleRailPanel?: () => void;
  label?: string;
};

export function Rail({
  items,
  bottomItems,
  activeId,
  onSelect,
  railPanelOpen = true,
  onToggleRailPanel,
  label = "Main",
}: RailProps) {
  const ToggleIcon = railPanelOpen ? PanelLeftClose : PanelLeftOpen;
  // Bottom items are not tabs: they are never selected, and show as pressed
  // only when they set pressed.
  const renderItem = (item: RailItem, selectable: boolean) => {
    const Icon = item.icon ?? Square;
    const pressed = selectable ? item.id === activeId : item.pressed;
    return (
      <button
        key={item.id}
        type="button"
        className={pressed ? `${styles.item} ${styles.active}` : styles.item}
        aria-label={item.label}
        aria-pressed={pressed}
        onClick={selectable ? () => onSelect?.(item.id) : item.onClick}
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
      {onToggleRailPanel && (
        <button
          type="button"
          className={`${styles.item} ${styles.toggle}`}
          aria-label={railPanelOpen ? "Hide rail panel" : "Show rail panel"}
          aria-expanded={railPanelOpen}
          onClick={onToggleRailPanel}
        >
          <ToggleIcon size={20} strokeWidth={1.75} aria-hidden />
        </button>
      )}
      <div className={styles.group}>
        {items.map((item) => renderItem(item, true))}
      </div>
      {bottomItems && (
        <div className={`${styles.group} ${styles.end}`}>
          {bottomItems.map((item) => renderItem(item, false))}
        </div>
      )}
    </nav>
  );
}
