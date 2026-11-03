import {
  Dices,
  Globe,
  MessageSquare,
  NotebookPen,
  Settings,
  Users,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import styles from "@/App.module.css";
import { ConfirmDialog } from "@/components/ConfirmDialog/ConfirmDialog";
import {
  ChatMenu,
  ChatMenuActions,
} from "@/components/menus/ChatMenu/ChatMenu";
import { useChat } from "@/components/menus/ChatMenu/useChat";
import {
  DICE_HISTORY_LENGTH,
  DiceMenu,
  type DiceRoll,
} from "@/components/menus/DiceMenu/DiceMenu";
import { usePeople } from "@/components/menus/PeopleMenu/usePeople";
import { useTable } from "@/components/menus/SessionMenu/useTable";
import type { SettingsPage } from "@/components/menus/SettingsMenu/SettingsMenu";
import { MainPanel } from "@/components/panels/MainPanel/MainPanel";
import { RailPanel } from "@/components/panels/RailPanel/RailPanel";
import { ResizeHandle } from "@/components/panels/ResizeHandle/ResizeHandle";
import { SidePanel } from "@/components/panels/SidePanel/SidePanel";
import { Rail, type RailItem } from "@/components/Rail/Rail";
import { TimerPill } from "@/components/TimerPill/TimerPill";
import type { DiceResult } from "@/lib/dice";
import {
  NotesPageActions,
  NotesPageMain,
  NotesPageRail,
} from "@/pages/NotesPage/NotesPage";
import { useNotesPage } from "@/pages/NotesPage/useNotesPage";
import {
  SessionPageMain,
  SessionPageRail,
} from "@/pages/SessionPage/SessionPage";
import { useSessionPage } from "@/pages/SessionPage/useSessionPage";
import {
  SettingsPageMain,
  SettingsPageRail,
} from "@/pages/SettingsPage/SettingsPage";
import { useWorldPage } from "@/pages/WorldPage/useWorldPage";
import { WorldPageMain, WorldPageRail } from "@/pages/WorldPage/WorldPage";

const railItems: RailItem[] = [
  { id: "session", label: "Session", icon: Users },
  { id: "world", label: "World", icon: Globe },
  { id: "notes", label: "Notes", icon: NotebookPen },
];

// Defaults match --rail-panel-width, --panel-width and --rail-width in tokens.css.
const RAIL_PANEL_WIDTH = { default: 220, min: 180 };
const PANEL_WIDTH = { default: 360, min: 280 };
const RAIL_WIDTH = 52;

// Chat and Dice share the side panel.
type SidePanelId = "chat" | "dice";

// The frame around the pages: the rail, the panels, Chat, Dice and the
// moves between tabs. Inside the ToastProvider so it can raise toasts.
export function AppShell() {
  const [activeId, setActiveId] = useState("notes");
  // Settings takes over the rail panel and the main panel while it is open.
  const [settings, setSettings] = useState<SettingsPage | null>(null);
  // Counts the rail clicks that change the main panel: a click that waits
  // for a save gives way to a newer one.
  const railClicks = useRef(0);
  const [railPanelOpen, setRailPanelOpen] = useState(true);
  const [sidePanel, setSidePanel] = useState<SidePanelId | null>(null);
  const panelOpen = sidePanel !== null;
  // Kept here so the history survives closing the Dice panel.
  const [rolls, setRolls] = useState<DiceRoll[]>([]);
  const [latestRoll, setLatestRoll] = useState<DiceRoll>();
  const nextRollId = useRef(1);
  // Shared by World and the Notes character button.
  const people = usePeople();
  const reloadPeople = people.reload;
  // Shared by Session and the timer pill.
  const table = useTable(people.setWorld);
  // Answers the open "Discard changes?" question.
  const [discardAnswer, setDiscardAnswer] = useState<
    ((discard: boolean) => void) | null
  >(null);
  const confirmDiscard = async () => {
    const discard = await new Promise<boolean>((resolve) =>
      setDiscardAnswer(() => resolve),
    );
    setDiscardAnswer(null);
    return discard;
  };
  // Called here so each page keeps its state while another tab is shown.
  const notes = useNotesPage({
    active: settings === null && activeId === "notes",
    confirmDiscard,
  });
  const world = useWorldPage({
    active: settings === null && activeId === "world",
    confirmDiscard,
  });
  const session = useSessionPage({
    active: settings === null && activeId === "session",
    confirmDiscard,
  });
  const [railPanelWidth, setRailPanelWidth] = useState(
    RAIL_PANEL_WIDTH.default,
  );
  const [panelWidth, setPanelWidth] = useState(PANEL_WIDTH.default);
  const [windowWidth, setWindowWidth] = useState(window.innerWidth);
  const chat = useChat({
    openNote: notes.openNote?.toLowerCase().endsWith(".md")
      ? notes.openNote
      : null,
    app: {
      notesFolder: () => notes.folder ?? null,
      openNote: () => notes.openNote,
      flushOpenNote: notes.flush,
      showNote: notes.showNote,
      pathChanged: notes.pathChanged,
      addRoll: (result) => addRoll(result),
      // From the Notes tab or another person's form too, so the form asks
      // first.
      showPerson: async (id) =>
        (await leavePersonForms()) && showTab("world", id),
      peopleChanged: () => reloadPeople(),
    },
  });
  const loadChat = chat.load;

  useEffect(() => {
    if (sidePanel === "chat") loadChat();
  }, [sidePanel, loadChat]);

  useEffect(() => {
    const updateWindowWidth = () => setWindowWidth(window.innerWidth);
    window.addEventListener("resize", updateWindowWidth);
    return () => window.removeEventListener("resize", updateWindowWidth);
  }, []);

  // Main, the rail panel and the side panel each get at most one share of the
  // space beside the rail, so main is never narrower than either panel.
  const openAreas = 1 + Number(railPanelOpen) + Number(panelOpen);
  const share = (windowWidth - RAIL_WIDTH) / openAreas;
  const clampWidth = (width: number, min: number) =>
    Math.max(min, Math.min(width, share));
  const drawnRailPanelWidth = clampWidth(railPanelWidth, RAIL_PANEL_WIDTH.min);
  const drawnPanelWidth = clampWidth(panelWidth, PANEL_WIDTH.min);

  // Clicking the open panel's button closes the panel.
  const toggleSidePanel = (id: SidePanelId) =>
    setSidePanel((open) => (open === id ? null : id));

  const bottomItems: RailItem[] = [
    {
      id: "chat",
      label: "Chat",
      icon: MessageSquare,
      pressed: sidePanel === "chat",
      onClick: () => toggleSidePanel("chat"),
    },
    {
      id: "dice",
      label: "Dice",
      icon: Dices,
      pressed: sidePanel === "dice",
      onClick: () => toggleSidePanel("dice"),
    },
    {
      id: "settings",
      label: "Settings",
      icon: Settings,
      pressed: settings !== null,
      onClick: async () => {
        const click = ++railClicks.current;
        if (settings !== null) {
          setSettings(null);
          return;
        }
        // Settings replaces the editor, so the open note's edit is saved
        // first. A failed save keeps the editor and its text.
        if (!(await notes.flush())) return;
        if (!(await leavePersonForms())) return;
        if (click !== railClicks.current) return;
        setSettings("providers");
        setRailPanelOpen(true);
      },
    },
  ];

  const activeItem = railItems.find((item) => item.id === activeId);

  const addRoll = (result: DiceResult) => {
    const roll = { id: nextRollId.current++, time: new Date(), result };
    setLatestRoll(roll);
    setRolls((previous) => [roll, ...previous].slice(0, DICE_HISTORY_LENGTH));
  };

  // Before a person form, World Settings or Session Overview leaves the main
  // panel. Resolves false to stay on the form.
  const leavePersonForms = async () =>
    (await world.leave()) &&
    (await session.leave()) &&
    (await notes.leaveCharacterEdit());

  // Shows a tab, and on World the sheet of `personId` when given. World and
  // Session replace the editor, so the open note's edit is saved first; a
  // failed save keeps the editor and its text. Resolves false when the tab
  // wasn't shown.
  const showTab = async (id: string, personId?: string) => {
    const click = ++railClicks.current;
    if (id !== "notes" && !(await notes.flush())) return false;
    if (!(await leavePersonForms())) return false;
    if (click !== railClicks.current) return false;
    // The files may have been fixed or changed since the last load.
    if (id !== "notes") reloadPeople();
    if (id === "session") table.reload();
    if (personId !== undefined) world.openPerson(personId);
    setSettings(null);
    setActiveId(id);
    setRailPanelOpen(true);
    return true;
  };

  const selectRailItem = (id: string) => {
    if (settings === null && id === activeId) {
      railClicks.current++;
      setRailPanelOpen((open) => !open);
      return;
    }
    showTab(id);
  };

  return (
    <div className={styles.shell}>
      <Rail
        items={railItems}
        bottomItems={bottomItems}
        activeId={settings === null ? activeId : undefined}
        onSelect={selectRailItem}
        railPanelOpen={railPanelOpen}
        onToggleRailPanel={() => setRailPanelOpen((open) => !open)}
      />
      <RailPanel
        title={settings !== null ? "Settings" : (activeItem?.label ?? "")}
        open={railPanelOpen}
        width={drawnRailPanelWidth}
        resizeHandle={
          <ResizeHandle
            label="Resize rail panel"
            edge="right"
            width={drawnRailPanelWidth}
            onResize={(width) =>
              setRailPanelWidth(clampWidth(width, RAIL_PANEL_WIDTH.min))
            }
            onReset={() => setRailPanelWidth(RAIL_PANEL_WIDTH.default)}
          />
        }
        actions={
          settings === null &&
          activeId === "notes" && <NotesPageActions notes={notes.view} />
        }
      >
        {settings !== null && (
          <SettingsPageRail page={settings} onSelect={setSettings} />
        )}
        {settings === null && activeId === "notes" && (
          <NotesPageRail notes={notes.view} people={people} />
        )}
        {settings === null && activeId === "world" && (
          <WorldPageRail world={world.view} />
        )}
        {settings === null && activeId === "session" && (
          <SessionPageRail session={session.view} />
        )}
      </RailPanel>
      <MainPanel
        overlay={
          <TimerPill
            table={table}
            onOpen={async () => {
              if (await showTab("session")) session.showOverview();
            }}
          />
        }
      >
        {settings !== null ? (
          <SettingsPageMain page={settings} />
        ) : activeId === "world" ? (
          <WorldPageMain world={world.view} people={people} />
        ) : activeId === "session" ? (
          <SessionPageMain
            session={session.view}
            table={table}
            people={people}
          />
        ) : (
          <NotesPageMain
            notes={notes.view}
            people={people}
            prefs={world.view.prefs}
            setPrefs={world.view.setPrefs}
          />
        )}
      </MainPanel>
      <SidePanel
        open={panelOpen}
        onClose={() => setSidePanel(null)}
        title={sidePanel === "chat" ? "Chat" : "Dice"}
        fill={sidePanel === "chat"}
        actions={
          sidePanel === "chat" && (
            <ChatMenuActions
              historyOpen={chat.historyOpen}
              onHistory={chat.toggleHistory}
              onNewChat={() => {
                chat.closeHistory();
                chat.newChat();
              }}
            />
          )
        }
        width={drawnPanelWidth}
        resizeHandle={
          <ResizeHandle
            label="Resize side panel"
            edge="left"
            width={drawnPanelWidth}
            onResize={(width) =>
              setPanelWidth(clampWidth(width, PANEL_WIDTH.min))
            }
            onReset={() => setPanelWidth(PANEL_WIDTH.default)}
          />
        }
      >
        {sidePanel === "chat" ? (
          <ChatMenu chat={chat} />
        ) : (
          <DiceMenu
            rolls={rolls}
            latest={latestRoll}
            onRoll={addRoll}
            onClearHistory={() => setRolls([])}
          />
        )}
      </SidePanel>
      {discardAnswer && (
        <ConfirmDialog
          title="Discard changes?"
          message=""
          confirmLabel="Discard"
          danger
          onConfirm={() => discardAnswer(true)}
          onCancel={() => discardAnswer(false)}
        />
      )}
    </div>
  );
}
