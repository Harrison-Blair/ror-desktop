import styles from "./SessionMenu.module.css";

export type SessionSection = "overview" | "rounds" | "sessions";

const sections: { id: SessionSection; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "rounds", label: "Rounds" },
  { id: "sessions", label: "Sessions" },
];

// The Session rail sections.
export function SessionMenu({
  section,
  onSelect,
}: {
  section: SessionSection;
  onSelect: (section: SessionSection) => void;
}) {
  return (
    <>
      {sections.map(({ id, label }) => (
        <button
          key={id}
          type="button"
          className={styles.item}
          aria-pressed={id === section}
          onClick={() => onSelect(id)}
        >
          {label}
        </button>
      ))}
    </>
  );
}
