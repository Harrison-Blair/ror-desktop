import { ChevronLeft, Star } from "lucide-react";
import styles from "./PeopleMenu.module.css";

// The gold star after the name of your character.
export function MineStar({ size = 16 }: { size?: number }) {
  return (
    <Star
      className={styles.star}
      size={size}
      fill="currentColor"
      strokeWidth={1.5}
      role="img"
      aria-label="Your character"
    />
  );
}

export function BackLink({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" className={styles.back} onClick={onClick}>
      <ChevronLeft size={16} strokeWidth={1.75} aria-hidden />
      People of interest
    </button>
  );
}
