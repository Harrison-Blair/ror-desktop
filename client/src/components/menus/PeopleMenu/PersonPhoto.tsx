import { type ReactNode, useEffect, useState } from "react";
import { initials } from "@/lib/people";
import { type Character, readPhoto, readPickedPhoto } from "@/lib/peopleApi";
import styles from "./PeopleMenu.module.css";

// The app has no asset protocol, so a photo is read as bytes and shown from
// a blob URL. Sets the URL once the bytes come, and returns the cleanup that
// revokes it. A failed read leaves no URL.
function showBytes(bytes: Promise<ArrayBuffer>, setUrl: (url: string) => void) {
  let made: string | undefined;
  let stale = false;
  bytes.then(
    (b) => {
      if (stale) return;
      made = URL.createObjectURL(new Blob([b]));
      setUrl(made);
    },
    () => {},
  );
  return () => {
    stale = true;
    if (made) URL.revokeObjectURL(made);
  };
}

// The saved photo's URL. Undefined while it loads, without a photo, or when
// it can't be read.
function usePhotoUrl(id: string, photo: string | null, version: number) {
  const [url, setUrl] = useState<string>();
  // `version` reloads a photo that was replaced under the same name.
  // biome-ignore lint/correctness/useExhaustiveDependencies: see above
  useEffect(() => {
    setUrl(undefined);
    if (photo === null) return;
    return showBytes(readPhoto(id), setUrl);
  }, [id, photo, version]);
  return url;
}

// The URL of a picked, unsaved image. Undefined in the same cases.
function usePickedUrl(path: string | null, pick: number) {
  const [url, setUrl] = useState<string>();
  // `pick` reads the file again when the same path is picked again: the file
  // can have changed, or the read before can have failed.
  // biome-ignore lint/correctness/useExhaustiveDependencies: see above
  useEffect(() => {
    setUrl(undefined);
    if (path === null) return;
    return showBytes(readPickedPhoto(path), setUrl);
  }, [path, pick]);
  return url;
}

// The photo, or the initials of the name when there is none. `picked` is a
// newly picked image: it shows in place of the saved photo once it is read.
// `pick` counts the picks, so that a new pick of the same path shows the
// file as it is now. `empty` shows when there is no photo and no name.
export function PersonPhoto({
  person,
  photoVersion,
  className,
  picked = null,
  pick = 0,
  empty,
}: {
  person: Pick<Character, "id" | "name" | "photo">;
  photoVersion: number;
  className: string;
  picked?: string | null;
  pick?: number;
  empty?: ReactNode;
}) {
  const saved = usePhotoUrl(person.id, person.photo, photoVersion);
  const url = usePickedUrl(picked, pick) ?? saved;
  return (
    <span className={className} aria-hidden="true">
      {url ? (
        <img className={styles.photoImage} src={url} alt="" />
      ) : person.name.trim() ? (
        initials(person.name)
      ) : (
        empty
      )}
    </span>
  );
}
