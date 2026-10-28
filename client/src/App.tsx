import { useEffect, useState } from "react";
import styles from "@/App.module.css";
import { MainPanel } from "@/components/MainPanel/MainPanel";
import { Rail, type RailItem } from "@/components/Rail/Rail";
import { RailPanel } from "@/components/RailPanel/RailPanel";
import { ResizeHandle } from "@/components/ResizeHandle/ResizeHandle";
import { SidePanel } from "@/components/SidePanel/SidePanel";

const railItems: RailItem[] = [1, 2, 3, 4, 5].map((n) => ({
  id: `top${n}`,
  label: `Nav item ${n}`,
}));

const bottomItems: RailItem[] = [1, 2].map((n) => ({
  id: `bottom${n}`,
  label: `Bottom item ${n}`,
}));

const railPanelItems = [1, 2, 3, 4, 5, 6].map((n) => ({
  id: `p${n}`,
  label: `Panel item ${n}`,
}));

// Defaults match --rail-panel-width, --panel-width and --rail-width in tokens.css.
const RAIL_PANEL_WIDTH = { default: 220, min: 180 };
const PANEL_WIDTH = { default: 360, min: 280 };
const RAIL_WIDTH = 52;

export default function App() {
  const [activeId, setActiveId] = useState("top1");
  const [railPanelOpen, setRailPanelOpen] = useState(true);
  const [railPanelItemId, setRailPanelItemId] = useState("p1");
  const [panelOpen, setPanelOpen] = useState(true);
  const [railPanelWidth, setRailPanelWidth] = useState(
    RAIL_PANEL_WIDTH.default,
  );
  const [panelWidth, setPanelWidth] = useState(PANEL_WIDTH.default);
  const [windowWidth, setWindowWidth] = useState(window.innerWidth);

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

  const activeItem = [...railItems, ...bottomItems].find(
    (item) => item.id === activeId,
  );

  const selectRailItem = (id: string) => {
    if (id === activeId) {
      setRailPanelOpen((open) => !open);
      return;
    }
    setActiveId(id);
    setRailPanelItemId(railPanelItems[0].id);
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
        items={railPanelItems}
        activeId={railPanelItemId}
        onSelect={setRailPanelItemId}
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
      />
      <MainPanel />
      <SidePanel
        open={panelOpen}
        onClose={() => setPanelOpen(false)}
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
      />
    </div>
  );
}
