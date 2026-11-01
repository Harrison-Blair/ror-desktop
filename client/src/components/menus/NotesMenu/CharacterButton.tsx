import { ChevronRight } from "lucide-react";
import { PersonPhoto } from "@/components/menus/PeopleMenu/PersonPhoto";
import { occupationLine } from "@/lib/people";
import type { Character } from "@/lib/peopleApi";
import styles from "./NotesMenu.module.css";

// Above the notes tree: your character, opening its sheet in the main panel.
// Its occupation shows below the name; without one, the name stands alone.
export function CharacterButton({
  me,
  gameDate,
  photoVersion,
  onOpen,
}: {
  me: Character;
  // Undefined while the world is not loaded: no occupation shows.
  gameDate?: string;
  photoVersion: number;
  onOpen: () => void;
}) {
  const occupation = gameDate ? occupationLine(me, gameDate) : "";
  return (
    <button
      type="button"
      className={`${styles.me} ${occupation ? "" : styles.meShort}`}
      title="Open your sheet"
      onClick={onOpen}
    >
      <PersonPhoto
        person={me}
        photoVersion={photoVersion}
        className={styles.meAvatar}
      />
      <span className={styles.meBody}>
        <span className={styles.meName} title={me.name}>
          {me.name}
        </span>
        {occupation && (
          <span className={styles.meSub} title={occupation}>
            {occupation}
          </span>
        )}
      </span>
      <ChevronRight size={16} strokeWidth={1.75} aria-hidden />
    </button>
  );
}
