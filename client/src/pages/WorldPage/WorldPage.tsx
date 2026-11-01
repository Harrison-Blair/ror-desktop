import { PeopleMenu } from "@/components/menus/PeopleMenu/PeopleMenu";
import type { PeopleData } from "@/components/menus/PeopleMenu/usePeople";
import { WorldMenu } from "@/components/menus/WorldMenu/WorldMenu";
import type { WorldView } from "@/pages/WorldPage/useWorldPage";

// The World views. They unmount when another tab is shown; their state lives
// in useWorldPage.

export function WorldPageRail({ world }: { world: WorldView }) {
  return <WorldMenu section="people" onSelect={world.showList} />;
}

export function WorldPageMain({
  world,
  people,
}: {
  world: WorldView;
  people: PeopleData;
}) {
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
