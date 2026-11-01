import { useRef, useState } from "react";
import {
  DEFAULT_PREFS,
  type ListPrefs,
} from "@/components/menus/PeopleMenu/PeopleList";
import type { PeopleView } from "@/components/menus/PeopleMenu/PeopleMenu";

export type WorldPageOptions = {
  // True while the World tab is shown and Settings is closed.
  active: boolean;
  // Asks "Discard changes?". Resolves true to discard.
  confirmDiscard: () => Promise<boolean>;
};

// The state and actions of the World views. Only the World page uses it.
export type WorldView = ReturnType<typeof useWorldView>;

export type WorldPage = {
  // Leaves the Add or Edit person form, asking first when it has unsaved
  // changes. Resolves false to stay on the form.
  leave: () => Promise<boolean>;
  // Shows a person's sheet the next time World is shown.
  openPerson: (id: string) => void;
  view: WorldView;
};

// Called by the app shell, so World keeps its view and list preferences
// when another tab is open.
export function useWorldPage(options: WorldPageOptions): WorldPage {
  const view = useWorldView(options);
  return {
    leave: view.leave,
    openPerson: view.openPerson,
    view,
  };
}

function useWorldView({ active, confirmDiscard }: WorldPageOptions) {
  const [peopleView, setPeopleView] = useState<PeopleView>({ screen: "list" });
  const [prefs, setPrefs] = useState<ListPrefs>(DEFAULT_PREFS);
  // True while the Add or Edit person form has unsaved changes.
  const formDirty = useRef(false);

  // Leaving drops the form, so World opens on the list or the sheet next
  // time.
  const leave = async () => {
    const form = peopleView.screen === "add" || peopleView.screen === "edit";
    if (!active || !form) return true;
    if (formDirty.current) {
      if (!(await confirmDiscard())) return false;
      formDirty.current = false;
    }
    setPeopleView(
      peopleView.screen === "edit"
        ? { screen: "sheet", id: peopleView.id }
        : { screen: "list" },
    );
    return true;
  };

  const openPerson = (id: string) => setPeopleView({ screen: "sheet", id });

  // The People section button shows the list.
  const showList = async () => {
    if (await leave()) setPeopleView({ screen: "list" });
  };

  return {
    peopleView,
    setPeopleView,
    prefs,
    setPrefs,
    setFormDirty: (dirty: boolean) => {
      formDirty.current = dirty;
    },
    leave,
    openPerson,
    showList,
  };
}
