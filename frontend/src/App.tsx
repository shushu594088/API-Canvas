import { useReducedMotion } from "./hooks/useReducedMotion";
import { useStore, StoreProvider } from "./state/store";
import { TopBar } from "./components/layout/TopBar";
import { HistoryRail } from "./components/history/HistoryRail";
import { CanvasStage } from "./components/canvas/CanvasStage";
import { GeneratePanel } from "./components/generate/GeneratePanel";
import { SettingsDialog } from "./components/settings/SettingsDialog";
import { ToastHost } from "./components/ui/kit";
import styles from "./App.module.css";

function Workspace() {
  useReducedMotion();
  const { state } = useStore();
  return (
    <div className={styles.workspace}>
      <TopBar />
      <div className={styles.main}>
        <HistoryRail />
        <CanvasStage />
        <GeneratePanel />
      </div>
      <SettingsDialog />
      <ToastHost toasts={state.toasts} />
    </div>
  );
}

export default function App() {
  return (
    <StoreProvider>
      <Workspace />
    </StoreProvider>
  );
}
