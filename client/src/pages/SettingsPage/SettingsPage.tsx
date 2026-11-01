import { ProvidersSettings } from "@/components/menus/SettingsMenu/ProvidersSettings";
import {
  SettingsMenu,
  type SettingsPage,
} from "@/components/menus/SettingsMenu/SettingsMenu";

// The Settings views. The app shell owns which page is open.

export function SettingsPageRail({
  page,
  onSelect,
}: {
  page: SettingsPage;
  onSelect: (page: SettingsPage) => void;
}) {
  return <SettingsMenu page={page} onSelect={onSelect} />;
}

export function SettingsPageMain({ page }: { page: SettingsPage }) {
  return page === "providers" ? <ProvidersSettings /> : null;
}
