import styles from "./SessionMenu.module.css";

// The Session rail sections. Overview is the only one so far, so it is
// always selected.
export function SessionMenu() {
  return (
    <button type="button" className={styles.item} aria-pressed>
      Overview
    </button>
  );
}
