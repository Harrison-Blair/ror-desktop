import { useState } from "react";
import styles from "@/App.module.css";
import { AppShell } from "@/components/AppShell/AppShell";
import { MainPanel } from "@/components/MainPanel/MainPanel";
import { NavMenu } from "@/components/NavMenu/NavMenu";
import { Placeholder } from "@/components/Placeholder/Placeholder";
import { Rail, type RailItem } from "@/components/Rail/Rail";
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

export default function App() {
  const [activeId, setActiveId] = useState("top1");
  const [menuOpen, setMenuOpen] = useState(true);
  const [menuItemId, setMenuItemId] = useState("m1");
  const [panelOpen, setPanelOpen] = useState(true);

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
      <SidePanel open={panelOpen} onClose={() => setPanelOpen(false)}>
        <div className={styles.stack}>
          {[1, 2, 3, 4, 5].map((n) => (
            <Placeholder key={n}>Panel content {n}</Placeholder>
          ))}
        </div>
      </SidePanel>
    </AppShell>
  );
}
