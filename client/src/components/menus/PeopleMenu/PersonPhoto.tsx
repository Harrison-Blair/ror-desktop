import { useEffect, useState } from "react";
import { initials } from "@/lib/people";
import { type Character, readPhoto } from "@/lib/peopleApi";
import styles from "./PeopleMenu.module.css";

// The app has no asset protocol, so a photo is read as bytes and shown from
// a blob URL. Undefined while it loads, without a photo, or when it can't be
// read: the caller then shows the initials.
function usePhotoUrl(id: string, photo: string | null, version: number) {
  const [url, setUrl] = useState<string>();
  // `version` reloads a photo that was replaced under the same name.
  // biome-ignore lint/correctness/useExhaustiveDependencies: see above
  useEffect(() => {
    setUrl(undefined);
    if (photo === null) return;
    let made: string | undefined;
    let stale = false;
    readPhoto(id).then(
      (bytes) => {
        if (stale) return;
        made = URL.createObjectURL(new Blob([bytes]));
        setUrl(made);
      },
      () => {},
    );
    return () => {
      stale = true;
      if (made) URL.revokeObjectURL(made);
    };
  }, [id, photo, version]);
  return url;
}

// The photo, or the initials of the name when there is none.
export function PersonPhoto({
  person,
  photoVersion,
  className,
}: {
  person: Pick<Character, "id" | "name" | "photo">;
  photoVersion: number;
  className: string;
}) {
  const url = usePhotoUrl(person.id, person.photo, photoVersion);
  return (
    <span className={className} aria-hidden="true">
      {url ? (
        <img className={styles.photoImage} src={url} alt="" />
      ) : (
        initials(person.name)
      )}
    </span>
  );
}
