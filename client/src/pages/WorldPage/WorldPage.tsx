import { PeopleMenu } from "@/components/menus/PeopleMenu/PeopleMenu";
import type { PeopleData } from "@/components/menus/PeopleMenu/usePeople";
import { WorldMenu } from "@/components/menus/WorldMenu/WorldMenu";
import type { WorldView } from "@/pages/WorldPage/useWorldPage";
import { WorldOverview } from "./WorldOverview";

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
  if (world.section === "overview") {
    return (
      <WorldOverview
        key={world.overviewVersion}
        data={people}
        onDirty={world.setFormDirty}
      />
    );
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
