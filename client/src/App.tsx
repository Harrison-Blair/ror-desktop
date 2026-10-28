import { useEffect, useState } from "react";
import styles from "@/App.module.css";
import { AppShell } from "@/components/AppShell/AppShell";
import { MainPanel } from "@/components/MainPanel/MainPanel";
import { NavMenu } from "@/components/NavMenu/NavMenu";
import { Placeholder } from "@/components/Placeholder/Placeholder";
import { Rail, type RailItem } from "@/components/Rail/Rail";
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

const menuItems = [1, 2, 3, 4, 5, 6].map((n) => ({
  id: `m${n}`,
  label: `Menu item ${n}`,
}));

// Defaults match --menu-width, --panel-width and --rail-width in tokens.css.
const MENU_WIDTH = { default: 220, min: 180 };
const PANEL_WIDTH = { default: 360, min: 280 };
const RAIL_WIDTH = 52;

export default function App() {
  const [activeId, setActiveId] = useState("top1");
  const [menuOpen, setMenuOpen] = useState(true);
  const [menuItemId, setMenuItemId] = useState("m1");
  const [panelOpen, setPanelOpen] = useState(true);
  const [menuWidth, setMenuWidth] = useState(MENU_WIDTH.default);
  const [panelWidth, setPanelWidth] = useState(PANEL_WIDTH.default);
  const [windowWidth, setWindowWidth] = useState(window.innerWidth);

  useEffect(() => {
    const updateWindowWidth = () => setWindowWidth(window.innerWidth);
    window.addEventListener("resize", updateWindowWidth);
    return () => window.removeEventListener("resize", updateWindowWidth);
  }, []);

  // Main, the menu and the side panel each get at most one share of the
  // space beside the rail, so main is never narrower than either panel.
  const openAreas = 1 + Number(menuOpen) + Number(panelOpen);
  const share = (windowWidth - RAIL_WIDTH) / openAreas;
  const clampWidth = (width: number, min: number) =>
    Math.max(min, Math.min(width, share));
  const drawnMenuWidth = clampWidth(menuWidth, MENU_WIDTH.min);
  const drawnPanelWidth = clampWidth(panelWidth, PANEL_WIDTH.min);

  const activeItem = [...railItems, ...bottomItems].find(
    (item) => item.id === activeId,
  );

  const selectRailItem = (id: string) => {
    if (id === activeId) {
      setMenuOpen((open) => !open);
      return;
    }
    setActiveId(id);
    setMenuItemId(menuItems[0].id);
    setMenuOpen(true);
  };

  return (
    <AppShell>
      <Rail
        items={railItems}
        bottomItems={bottomItems}
        activeId={activeId}
        onSelect={selectRailItem}
        menuOpen={menuOpen}
        onToggleMenu={() => setMenuOpen((open) => !open)}
      />
      <NavMenu
        title={activeItem?.label ?? ""}
        open={menuOpen}
        items={menuItems}
        activeId={menuItemId}
        onSelect={setMenuItemId}
        width={drawnMenuWidth}
        resizeHandle={
          <ResizeHandle
            label="Resize menu"
            edge="right"
            width={drawnMenuWidth}
            onResize={(width) =>
              setMenuWidth(clampWidth(width, MENU_WIDTH.min))
            }
            onReset={() => setMenuWidth(MENU_WIDTH.default)}
          />
        }
      />
      <MainPanel>
        <div className={styles.stack}>
          {[1, 2, 3, 4, 5, 6].map((n) => (
            <Placeholder key={n} minHeight={n % 2 ? 240 : 160}>
              Content {n}
            </Placeholder>
          ))}
        </div>
      </MainPanel>
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
      >
        <div className={styles.stack}>
          {[1, 2, 3, 4, 5].map((n) => (
            <Placeholder key={n}>Panel content {n}</Placeholder>
          ))}
        </div>
      </SidePanel>
    </AppShell>
  );
}
