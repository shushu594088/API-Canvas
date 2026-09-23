import { createContext, useContext, useEffect, useMemo, useReducer, type ReactNode } from "react";
import { bridge } from "../lib/bridge";
import type {
  GenerationJob,
  HistoryItem,
  ImageAsset,
  Profile,
  TestResult,
} from "../lib/bridge";

export interface Toast {
  id: number;
  kind: "success" | "error" | "info";
  text: string;
}

export interface AppState {
  ready: boolean;
  profiles: Profile[];
  selectedProfileId: string | null;
  jobs: GenerationJob[];
  assets: ImageAsset[];
  history: HistoryItem[];
  activeJobId: string | null;
  railCollapsed: boolean;
  settingsOpen: boolean;
  draftPrompt: string;
  draftNegativePrompt: string;
  toasts: Toast[];
}

type Action =
  | { type: "hydrated"; profiles: Profile[]; jobs: GenerationJob[]; assets: ImageAsset[]; history: HistoryItem[] }
  | { type: "profiles"; profiles: Profile[] }
  | { type: "select-profile"; id: string | null }
  | { type: "job-upsert"; job: GenerationJob }
  | { type: "job-progress"; jobId: string; progress: number }
  | { type: "job-completed"; job: GenerationJob; asset: ImageAsset }
  | { type: "history"; items: HistoryItem[] }
  | { type: "history-remove"; jobId: string }
  | { type: "active-job"; id: string | null }
  | { type: "rail"; collapsed: boolean }
  | { type: "settings"; open: boolean }
  | { type: "draft"; text: string }
  | { type: "negative-draft"; text: string }
  | { type: "toast-push"; toast: Toast }
  | { type: "toast-drop"; id: number };

const RAIL_KEY = "api-canvas.ui.rail";

const initialState: AppState = {
  ready: false,
  profiles: [],
  selectedProfileId: null,
  jobs: [],
  assets: [],
  history: [],
  activeJobId: null,
  railCollapsed: false,
  settingsOpen: false,
  draftPrompt: "",
  draftNegativePrompt: "",
  toasts: [],
};

function upsertJob(jobs: GenerationJob[], job: GenerationJob): GenerationJob[] {
  const idx = jobs.findIndex((j) => j.id === job.id);
  if (idx === -1) return [job, ...jobs];
  const next = jobs.slice();
  next[idx] = job;
  return next;
}

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case "hydrated":
      return {
        ...state,
        ready: true,
        profiles: action.profiles,
        jobs: action.jobs,
        assets: action.assets,
        history: action.history,
        activeJobId:
          action.jobs.find((j) => j.status === "succeeded")?.id ?? null,
      };
    case "profiles":
      return { ...state, profiles: action.profiles };
    case "select-profile":
      return { ...state, selectedProfileId: action.id };
    case "job-upsert":
      return { ...state, jobs: upsertJob(state.jobs, action.job) };
    case "job-progress":
      return {
        ...state,
        jobs: state.jobs.map((j) => (j.id === action.jobId ? { ...j, progress: action.progress } : j)),
      };
    case "job-completed":
      return {
        ...state,
        jobs: upsertJob(state.jobs, action.job),
        assets: [...state.assets, action.asset],
      };
    case "history":
      return { ...state, history: action.items };
    case "history-remove":
      return {
        ...state,
        history: state.history.filter((h) => h.jobId !== action.jobId),
        jobs: state.jobs.filter((j) => j.id !== action.jobId),
        assets: state.assets.filter((a) => a.jobId !== action.jobId),
        activeJobId: state.activeJobId === action.jobId ? null : state.activeJobId,
      };
    case "active-job":
      return { ...state, activeJobId: action.id };
    case "rail":
      return { ...state, railCollapsed: action.collapsed };
    case "settings":
      return { ...state, settingsOpen: action.open };
    case "draft":
      return { ...state, draftPrompt: action.text };
    case "negative-draft":
      return { ...state, draftNegativePrompt: action.text };
    case "toast-push":
      return { ...state, toasts: [...state.toasts.slice(-2), action.toast] };
    case "toast-drop":
      return { ...state, toasts: state.toasts.filter((t) => t.id !== action.id) };
  }
}

export interface Store {
  state: AppState;
  activeProfile: Profile | null;
  dispatch: React.Dispatch<Action>;
  refreshProfiles(): Promise<void>;
  refreshHistory(): Promise<void>;
  pushToast(kind: Toast["kind"], text: string): void;
}

const StoreContext = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, {
    ...initialState,
    railCollapsed: (() => {
      try {
        return localStorage.getItem(RAIL_KEY) === "1";
      } catch {
        return false;
      }
    })(),
  });

  useEffect(() => {
    let disposed = false;
    (async () => {
      const [profiles, history] = await Promise.all([
        bridge.listProfiles(),
        bridge.listHistory({ limit: 30 }),
      ]);
      if (disposed) return;
      dispatch({ type: "hydrated", profiles, jobs: [], assets: [], history: history.items });
    })();
    const off = bridge.onGenerationEvent((event) => {
      switch (event.type) {
        case "generation.started":
          dispatch({ type: "job-upsert", job: event.job });
          dispatch({ type: "active-job", id: event.job.id });
          break;
        case "generation.progress":
          dispatch({ type: "job-progress", jobId: event.jobId, progress: event.progress });
          break;
        case "generation.completed":
          dispatch({ type: "job-completed", job: event.job, asset: event.asset });
          dispatch({ type: "active-job", id: event.job.id });
          void bridge.listHistory({ limit: 30 }).then((page) => dispatch({ type: "history", items: page.items }));
          break;
        case "generation.failed":
          dispatch({ type: "job-upsert", job: event.job });
          dispatch({ type: "active-job", id: event.job.id });
          break;
        case "generation.canceled":
          dispatch({ type: "job-upsert", job: event.job });
          break;
      }
    });
    return () => {
      disposed = true;
      off();
    };
  }, []);

  const activeProfile = useMemo(() => {
    const sel = state.selectedProfileId
      ? state.profiles.find((p) => p.id === state.selectedProfileId)
      : undefined;
    return sel ?? state.profiles.find((p) => p.isDefault) ?? state.profiles[0] ?? null;
  }, [state.profiles, state.selectedProfileId]);

  const store = useMemo<Store>(
    () => ({
      state,
      activeProfile,
      dispatch,
      async refreshProfiles() {
        const profiles = await bridge.listProfiles();
        dispatch({ type: "profiles", profiles });
      },
      async refreshHistory() {
        const page = await bridge.listHistory({ limit: 30 });
        dispatch({ type: "history", items: page.items });
      },
      pushToast(kind, text) {
        const id = Date.now() + Math.random();
        dispatch({ type: "toast-push", toast: { id, kind, text } });
        setTimeout(() => dispatch({ type: "toast-drop", id }), 3600);
      },
    }),
    [state, activeProfile],
  );

  return <StoreContext.Provider value={store}>{children}</StoreContext.Provider>;
}

export function useStore(): Store {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore 必须在 StoreProvider 内使用");
  return ctx;
}
