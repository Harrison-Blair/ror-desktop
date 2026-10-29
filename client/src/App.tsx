import { Dices, Globe, NotebookPen, Settings, Users } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import styles from "@/App.module.css";
import {
  DICE_HISTORY_LENGTH,
  DiceMenu,
  type DiceRoll,
} from "@/components/menus/DiceMenu/DiceMenu";
import { EditorMenu } from "@/components/menus/EditorMenu/EditorMenu";
import {
  NotesMenu,
  NotesMenuActions,
  type NotesMenuHandle,
} from "@/components/menus/NotesMenu/NotesMenu";
import { MainPanel } from "@/components/panels/MainPanel/MainPanel";
import { RailPanel } from "@/components/panels/RailPanel/RailPanel";
import { ResizeHandle } from "@/components/panels/ResizeHandle/ResizeHandle";
import { SidePanel } from "@/components/panels/SidePanel/SidePanel";
import { Rail, type RailItem } from "@/components/Rail/Rail";
import { ToastProvider, useToast } from "@/components/Toast/Toast";
import type { DiceResult } from "@/lib/dice";
import { getNotesFolder } from "@/lib/notesApi";

const railItems: RailItem[] = [
  { id: "session", label: "Session", icon: Users },
  { id: "world", label: "World", icon: Globe },
  { id: "notes", label: "Notes", icon: NotebookPen },
];

// Defaults match --rail-panel-width, --panel-width and --rail-width in tokens.css.
const RAIL_PANEL_WIDTH = { default: 220, min: 180 };
const PANEL_WIDTH = { default: 360, min: 280 };
const RAIL_WIDTH = 52;

export default function App() {
  return (
    <ToastProvider>
      <Shell />
    </ToastProvider>
  );
}

// Inside the ToastProvider so it can raise toasts.
function Shell() {
  const notify = useToast();
  const [activeId, setActiveId] = useState("notes");
  const [railPanelOpen, setRailPanelOpen] = useState(true);
  const [panelOpen, setPanelOpen] = useState(false);
  // Kept here so the history survives closing the Dice panel.
  const [rolls, setRolls] = useState<DiceRoll[]>([]);
  const [latestRoll, setLatestRoll] = useState<DiceRoll>();
  const nextRollId = useRef(1);
  const notesMenu = useRef<NotesMenuHandle>(null);
  // Kept here so the folder, open folders and the selection survive closing
  // the rail panel.
  const [notesFolder, setNotesFolder] = useState<string>();
  // Stops StrictMode from asking twice for the startup folder.
  const askedNotesFolder = useRef(false);
  // A pick wins over a startup answer that arrives after it.
  const pickedNotesFolder = useRef(false);
  const [notesExpanded, setNotesExpanded] = useState<Set<string>>(
    () => new Set(),
  );
  const [notesSelected, setNotesSelected] = useState<string | null>(null);
  const [railPanelWidth, setRailPanelWidth] = useState(
    RAIL_PANEL_WIDTH.default,
  );
  const [panelWidth, setPanelWidth] = useState(PANEL_WIDTH.default);
  const [windowWidth, setWindowWidth] = useState(window.innerWidth);

  // Asked here, once per run, since the notes menu comes and goes.
  useEffect(() => {
    if (askedNotesFolder.current) return;
    askedNotesFolder.current = true;
    getNotesFolder().then(
      ({ path, missing }) => {
        if (pickedNotesFolder.current) return;
        setNotesFolder(path);
        if (missing !== null) {
          notify({
            kind: "error",
            message: `Couldn't find ${missing}. Showing the default notes folder.`,
          });
        }
      },
      (e) => notify({ kind: "error", message: String(e) }),
    );
  }, [notify]);

  const pickNotesFolder = useCallback((path: string) => {
    pickedNotesFolder.current = true;
    setNotesFolder(path);
  }, []);

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

  const bottomItems: RailItem[] = [
    {
      id: "dice",
      label: "Dice",
      icon: Dices,
      pressed: panelOpen,
      onClick: () => setPanelOpen((open) => !open),
    },
    {
      id: "settings",
      label: "Settings",
      icon: Settings,
      onClick: () =>
        notify({ kind: "error", message: "Settings is not implemented yet." }),
    },
  ];

  const activeItem = railItems.find((item) => item.id === activeId);

  const addRoll = (result: DiceResult) => {
    const roll = { id: nextRollId.current++, time: new Date(), result };
    setLatestRoll(roll);
    setRolls((previous) => [roll, ...previous].slice(0, DICE_HISTORY_LENGTH));
  };

  const selectRailItem = (id: string) => {
    // Only Notes is built so far.
    if (id !== "notes") {
      const label = railItems.find((item) => item.id === id)?.label;
      notify({ kind: "error", message: `${label} is not implemented yet.` });
      return;
    }
    if (id === activeId) {
      setRailPanelOpen((open) => !open);
      return;
    }
    setActiveId(id);
    setRailPanelOpen(true);
  };

  return (
    <div className={styles.shell}>
      <Rail
        items={railItems}
        bottomItems={bottomItems}
        activeId={activeId}
        onSelect={selectRailItem}
        railPanelOpen={railPanelOpen}
        onToggleRailPanel={() => setRailPanelOpen((open) => !open)}
      />
      <RailPanel
        title={activeItem?.label ?? ""}
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
          activeId === "notes" && (
            <NotesMenuActions
              folder={notesFolder}
              onChooseFolder={() => notesMenu.current?.chooseFolder()}
              onCreate={(kind) => notesMenu.current?.startCreate(kind)}
            />
          )
        }
      >
        {activeId === "notes" && (
          <NotesMenu
            ref={notesMenu}
            setFolder={pickNotesFolder}
            expanded={notesExpanded}
            setExpanded={setNotesExpanded}
            selected={notesSelected}
            setSelected={setNotesSelected}
          />
        )}
      </RailPanel>
      <MainPanel>
        <EditorMenu path={notesSelected} />
      </MainPanel>
      <SidePanel
        open={panelOpen}
        onClose={() => setPanelOpen(false)}
        title="Dice"
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
        <DiceMenu
          rolls={rolls}
          latest={latestRoll}
          onRoll={addRoll}
          onClearHistory={() => setRolls([])}
        />
      </SidePanel>
    </div>
  );
}
