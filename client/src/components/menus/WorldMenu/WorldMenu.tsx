import styles from "./WorldMenu.module.css";

export type WorldSection = "people";

// The World rail panel. Only People of interest is built so far.
export function WorldMenu({
  section,
  onSelect,
}: {
  section: WorldSection;
  onSelect: (section: WorldSection) => void;
}) {
  return (
    <button
      type="button"
      className={styles.item}
      aria-pressed={section === "people"}
      onClick={() => onSelect("people")}
    >
      People of interest
    </button>
  );
}
