import { useCallback, useEffect, useRef, useState } from "react";
import { errorMessage } from "@/lib/errorMessage";
import { getWorld, listPeople, type People, type World } from "@/lib/peopleApi";

// The characters and the world, as loaded. A part that failed to load has
// its error instead; both are undefined until the first load ends.
export type PeopleData = {
  people?: People;
  peopleError?: string;
  world?: World;
  worldError?: string;
  // Goes up when a photo changes, since a new photo can keep its file name.
  photoVersion: number;
  reload: () => Promise<void>;
  setWorld: (world: World) => void;
  photoChanged: () => void;
};

// Kept in the app shell, so the World menus and the Notes character button
// share one copy.
export function usePeople(): PeopleData {
  const [state, setState] = useState<
    Pick<PeopleData, "people" | "peopleError" | "world" | "worldError">
  >({});
  const [photoVersion, setPhotoVersion] = useState(0);
  const loadId = useRef(0);

  const reload = useCallback(async () => {
    const id = ++loadId.current;
    const [people, world] = await Promise.allSettled([
      listPeople(),
      getWorld(),
    ]);
    if (id !== loadId.current) return;
    setState({
      people: people.status === "fulfilled" ? people.value : undefined,
      peopleError:
        people.status === "rejected" ? errorMessage(people.reason) : undefined,
      world: world.status === "fulfilled" ? world.value : undefined,
      worldError:
        world.status === "rejected" ? errorMessage(world.reason) : undefined,
    });
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const setWorld = useCallback(
    (world: World) =>
      setState((prev) => ({ ...prev, world, worldError: undefined })),
    [],
  );
  const photoChanged = useCallback(() => setPhotoVersion((v) => v + 1), []);

  return { ...state, photoVersion, reload, setWorld, photoChanged };
}
