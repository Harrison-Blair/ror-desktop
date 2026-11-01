import styles from "./WorldMenu.module.css";

export type WorldSection = "overview" | "people";

// The World rail sections.
export function WorldMenu({
  section,
  onSelect,
}: {
  section: WorldSection;
  onSelect: (section: WorldSection) => void;
}) {
  return (
    <>
      {(["overview", "people"] as const).map((item) => (
        <button
          key={item}
          type="button"
          className={styles.item}
          aria-pressed={section === item}
          onClick={() => onSelect(item)}
        >
          {item === "overview" ? "Overview" : "People of interest"}
        </button>
      ))}
    </>
  );
}
