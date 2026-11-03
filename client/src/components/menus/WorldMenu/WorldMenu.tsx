import styles from "./WorldMenu.module.css";

const SECTIONS = {
  people: "People of interest",
  settings: "Settings",
} as const;

export type WorldSection = keyof typeof SECTIONS;

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
      {(Object.keys(SECTIONS) as WorldSection[]).map((item) => (
        <button
          key={item}
          type="button"
          className={styles.item}
          aria-pressed={section === item}
          onClick={() => onSelect(item)}
        >
          {SECTIONS[item]}
        </button>
      ))}
    </>
  );
}
