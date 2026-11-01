import { useRef, useState } from "react";
import {
  DEFAULT_PREFS,
  type ListPrefs,
} from "@/components/menus/PeopleMenu/PeopleList";
import type { PeopleView } from "@/components/menus/PeopleMenu/PeopleMenu";
import type { WorldSection } from "@/components/menus/WorldMenu/WorldMenu";

export type WorldPageOptions = {
  // True while the World tab is shown and Settings is closed.
  active: boolean;
  // Asks "Discard changes?". Resolves true to discard.
  confirmDiscard: () => Promise<boolean>;
};

// The state and actions of the World views. Only the World page uses it.
export type WorldView = ReturnType<typeof useWorldView>;

export type WorldPage = {
  // Leaves Overview or the person form, asking before discarding edits.
  // Resolves false to keep editing.
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
  const [section, setSection] = useState<WorldSection>("overview");
  const [overviewVersion, setOverviewVersion] = useState(0);
  const [peopleView, setPeopleView] = useState<PeopleView>({ screen: "list" });
  const [prefs, setPrefs] = useState<ListPrefs>(DEFAULT_PREFS);
  // True while Overview or the person form has unsaved changes.
  const formDirty = useRef(false);

  // Discarded Overview edits reset; person forms return to the list or sheet.
  const leave = async () => {
    const form = peopleView.screen === "add" || peopleView.screen === "edit";
    if (!active || (section === "people" && !form)) return true;
    if (formDirty.current) {
      if (!(await confirmDiscard())) return false;
      formDirty.current = false;
    }
    if (section === "overview") {
      setOverviewVersion((version) => version + 1);
      return true;
    }
    setPeopleView(
      peopleView.screen === "edit"
        ? { screen: "sheet", id: peopleView.id }
        : { screen: "list" },
    );
    return true;
  };

  const openPerson = (id: string) => {
    setSection("people");
    setPeopleView({ screen: "sheet", id });
  };

  const selectSection = async (next: WorldSection) => {
    if (!(await leave())) return;
    setSection(next);
    if (next === "people") setPeopleView({ screen: "list" });
  };

  return {
    section,
    selectSection,
    overviewVersion,
    peopleView,
    setPeopleView,
    prefs,
    setPrefs,
    setFormDirty: (dirty: boolean) => {
      formDirty.current = dirty;
    },
    leave,
    openPerson,
  };
}
