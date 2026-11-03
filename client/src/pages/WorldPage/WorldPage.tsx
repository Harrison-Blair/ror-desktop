import { PeopleMenu } from "@/components/menus/PeopleMenu/PeopleMenu";
import type { PeopleData } from "@/components/menus/PeopleMenu/usePeople";
import { WorldMenu } from "@/components/menus/WorldMenu/WorldMenu";
import type { WorldView } from "@/pages/WorldPage/useWorldPage";
import { WorldBlankPage } from "./WorldBlankPage";
import { WorldSettings } from "./WorldSettings";

const BLANK_TITLES = {
  overview: "Overview",
  timeline: "Timeline",
  divergences: "Divergences",
  research: "Research",
};

// The World views. They unmount when another tab is shown; their state lives
// in useWorldPage.

export function WorldPageRail({ world }: { world: WorldView }) {
  return <WorldMenu section={world.section} onSelect={world.selectSection} />;
}

export function WorldPageMain({
  world,
  people,
}: {
  world: WorldView;
  people: PeopleData;
}) {
  if (world.section === "settings") {
    return (
      <WorldSettings
        key={world.settingsVersion}
        data={people}
        onDirty={world.setFormDirty}
      />
    );
  }
  if (world.section !== "people") {
    return <WorldBlankPage title={BLANK_TITLES[world.section]} />;
  }
  return (
    <PeopleMenu
      data={people}
      view={world.peopleView}
      setView={world.setPeopleView}
      prefs={world.prefs}
      setPrefs={world.setPrefs}
      onFormDirty={world.setFormDirty}
    />
  );
}
