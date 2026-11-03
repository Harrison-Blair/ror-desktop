import { useCallback } from "react";
import type { PeopleData } from "@/components/menus/PeopleMenu/usePeople";
import { NightsPage } from "@/components/menus/SessionMenu/NightsPage";
import { Overview } from "@/components/menus/SessionMenu/Overview";
import { ReadRound } from "@/components/menus/SessionMenu/ReadRound";
import { RoundNote } from "@/components/menus/SessionMenu/RoundNote";
import {
  RoundDetail,
  RoundsList,
} from "@/components/menus/SessionMenu/RoundsPage";
import { SessionMenu } from "@/components/menus/SessionMenu/SessionMenu";
import {
  type TableData,
  useNow,
} from "@/components/menus/SessionMenu/useTable";
import {
  INTERTERM_LABEL,
  nightTitle,
  playedOn,
  runningNight,
} from "@/lib/session";
import type { Night, Round } from "@/lib/sessionApi";
import {
  type SessionScreen,
  type SessionView,
  sectionOf,
} from "@/pages/SessionPage/useSessionPage";

// The Session views. They unmount when another tab is shown; their state
// lives in useSessionPage.

export function SessionPageRail({ session }: { session: SessionView }) {
  return (
    <SessionMenu
      section={sectionOf(session.screen)}
      onSelect={(section) => session.go({ kind: section })}
    />
  );
}

const backLabel = (screen: SessionScreen, rounds: Round[]): string => {
  switch (screen.kind) {
    case "overview":
      return "Overview";
    case "rounds":
      return "Rounds";
    case "sessions":
      return "Sessions";
    case "round":
      return `Round ${rounds.find((r) => r.id === screen.roundId)?.number ?? ""}`;
    default:
      return backLabel(screen.back, rounds);
  }
};

export function SessionPageMain({
  session,
  table,
  people,
}: {
  session: SessionView;
  table: TableData;
  people: PeopleData;
}) {
  const snapshot = table.snapshot;
  const ticking =
    !!snapshot &&
    (snapshot.rounds.some((r) =>
      r.turns.some((t) => t.clock.state === "running"),
    ) ||
      runningNight(snapshot.nights) !== undefined);
  const now = useNow(ticking);
  const { screen, go } = session;
  const rounds = snapshot?.rounds ?? [];
  const characters = people.people?.characters;
  const setDateDirty = useCallback(
    (dirty: boolean) => session.setFormDirty(dirty),
    [session.setFormDirty],
  );

  const openNote = (noteId: string, title: string, from: SessionScreen) => {
    const round = rounds.find(
      (r) =>
        r.interterm.noteId === noteId ||
        r.turns.some((t) => t.noteId === noteId),
    );
    go({
      kind: "note",
      noteId,
      title,
      subtitle: round
        ? `Round ${round.number} · ${title === INTERTERM_LABEL ? "interterm note" : "turn note"}`
        : "",
      back: from,
      backLabel: backLabel(from, rounds),
    });
  };
  const openRecap = (night: Night, from: SessionScreen) =>
    go({
      kind: "note",
      noteId: night.recapNoteId,
      title: `${nightTitle(night)} recap`,
      subtitle: playedOn(night.startedAt),
      back: from,
      backLabel: backLabel(from, rounds),
    });
  const readRound = (round: Round, from: SessionScreen) =>
    go({
      kind: "read",
      roundId: round.id,
      back: from,
      backLabel: backLabel(from, rounds),
    });

  switch (screen.kind) {
    case "note":
      return (
        <RoundNote
          key={screen.noteId}
          ref={session.note}
          noteId={screen.noteId}
          title={screen.title}
          subtitle={screen.subtitle}
          back={screen.backLabel}
          onBack={() => go(screen.back)}
        />
      );
    case "read": {
      const round = rounds.find((r) => r.id === screen.roundId);
      if (!round) return null;
      return (
        <ReadRound
          round={round}
          characters={characters}
          back={screen.backLabel}
          onBack={() => go(screen.back)}
          onOpenNote={(noteId, title) => openNote(noteId, title, screen)}
        />
      );
    }
    case "rounds":
      return (
        <RoundsList
          rounds={rounds}
          nights={snapshot?.nights ?? []}
          onOpen={(round) => go({ kind: "round", roundId: round.id })}
        />
      );
    case "round": {
      const round = rounds.find((r) => r.id === screen.roundId);
      if (!round || !snapshot) return null;
      return (
        <RoundDetail
          table={table}
          round={round}
          current={round === rounds[rounds.length - 1]}
          characters={characters}
          usualSeconds={snapshot.usualSeconds}
          now={now}
          onBack={() => go({ kind: "rounds" })}
          onOpenNote={(noteId, title) => openNote(noteId, title, screen)}
          onRead={() => readRound(round, screen)}
        />
      );
    }
    case "sessions":
      return (
        <NightsPage
          table={table}
          nights={snapshot?.nights ?? []}
          rounds={rounds}
          now={now}
          onRecap={(night) => openRecap(night, screen)}
        />
      );
    default:
      return (
        <Overview
          key={session.overviewVersion}
          table={table}
          people={people}
          now={now}
          onDateDirty={setDateDirty}
          nav={{
            openNote: (noteId, title) => openNote(noteId, title, screen),
            openRecap: (night) => openRecap(night, screen),
            readRound: (round) => readRound(round, screen),
          }}
        />
      );
  }
}
