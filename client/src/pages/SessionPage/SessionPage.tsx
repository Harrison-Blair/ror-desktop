import type { PeopleData } from "@/components/menus/PeopleMenu/usePeople";
import { SessionMenu } from "@/components/menus/SessionMenu/SessionMenu";
import type { SessionView } from "@/pages/SessionPage/useSessionPage";
import { SessionOverview } from "./SessionOverview";

// The Session views. They unmount when another tab is shown; their state
// lives in useSessionPage.

export function SessionPageRail() {
  return <SessionMenu />;
}

export function SessionPageMain({
  session,
  people,
}: {
  session: SessionView;
  people: PeopleData;
}) {
  return (
    <SessionOverview
      key={session.overviewVersion}
      data={people}
      onDirty={session.setFormDirty}
    />
  );
}
