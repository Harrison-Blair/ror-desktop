import styles from "./SettingsMenu.module.css";

// The settings pages. Only one is built so far.
export type SettingsPage = "providers";

const pages: { id: SettingsPage; label: string }[] = [
  { id: "providers", label: "Providers and keys" },
];

// Lists the settings pages.
export function SettingsMenu({
  page,
  onSelect,
}: {
  page: SettingsPage;
  onSelect: (page: SettingsPage) => void;
}) {
  return (
    <>
      {pages.map(({ id, label }) => (
        <button
          key={id}
          type="button"
          className={styles.page}
          aria-pressed={id === page}
          onClick={() => onSelect(id)}
        >
          {label}
        </button>
      ))}
    </>
  );
}
