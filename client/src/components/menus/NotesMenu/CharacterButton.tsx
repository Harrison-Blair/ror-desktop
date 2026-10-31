import { ChevronRight } from "lucide-react";
import { PersonPhoto } from "@/components/menus/PeopleMenu/PersonPhoto";
import type { Character } from "@/lib/peopleApi";
import styles from "./NotesMenu.module.css";

// Above the notes tree: your character, linking to its sheet in World.
export function CharacterButton({
  me,
  photoVersion,
  onOpen,
}: {
  me: Character;
  photoVersion: number;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      className={styles.me}
      title="Open your sheet in World › People of interest"
      onClick={onOpen}
    >
      <PersonPhoto
        person={me}
        photoVersion={photoVersion}
        className={styles.meAvatar}
      />
      <span className={styles.meBody}>
        <span className={styles.meName}>{me.name}</span>
        <span className={styles.meSub}>Your character</span>
      </span>
      <ChevronRight size={16} strokeWidth={1.75} aria-hidden />
    </button>
  );
}
