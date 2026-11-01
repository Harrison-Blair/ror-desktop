import { AppShell } from "@/AppShell";
import { ToastProvider } from "@/components/Toast/Toast";

export default function App() {
  return (
    <ToastProvider>
      <AppShell />
    </ToastProvider>
  );
}
