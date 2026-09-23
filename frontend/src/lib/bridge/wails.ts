import type { Bridge, GenerationEvent, GenerationJob, GenerationRequest, HistoryPage, HistoryQuery, ImageAsset, Profile, ProfileInput, ProtocolKind, RequestStrategy, TestResult } from "./types";
import * as AppAPI from "../../../wailsjs/go/main/App";
import { EventsOn } from "../../../wailsjs/runtime/runtime";

type WailsApp = typeof AppAPI & Record<string, (...args: any[]) => Promise<any>>;
const api = AppAPI as WailsApp;

const method = (name: string) => {
  const fn = api[name];
  if (!fn) throw new Error(`Wails 方法未生成: ${name}`);
  return fn;
};

export function createWailsBridge(): Bridge {
  return {
    listProfiles: () => method("ListProfiles")(),
    createProfile: (input: ProfileInput) => method("CreateProfile")(input),
    updateProfile: (id: string, input: ProfileInput) => method("UpdateProfile")(id, input),
    deleteProfile: (id: string) => method("DeleteProfile")(id),
    setDefaultProfile: (id: string) => method("SetDefaultProfile")(id),
    testProfile: (input: ProfileInput) => method("TestProfile")(input),
    listAvailableModels: (protocol: ProtocolKind, strategy: RequestStrategy) => method("ListAvailableModels")(protocol, strategy),
    fetchModels: (profileId: string | null, input: ProfileInput) => method("FetchModels")(profileId ?? "", input),
    startGeneration: (request: GenerationRequest) => method("StartGeneration")(request),
    cancelGeneration: (jobId: string) => method("CancelGeneration")(jobId),
    listHistory: (query: HistoryQuery): Promise<HistoryPage> => method("ListHistory")(query),
    deleteHistory: (jobId: string) => method("DeleteHistory")(jobId),
    saveImage: (assetId: string) => method("SaveImage")(assetId),
    openImage: (assetId: string) => method("OpenImage")(assetId),
    onGenerationEvent(handler: (event: GenerationEvent) => void) {
      const names = ["generation.started", "generation.progress", "generation.completed", "generation.failed", "generation.canceled"];
      const offs = names.map((name) => EventsOn(name, (payload: GenerationEvent) => handler(payload)));
      return () => offs.forEach((off) => off?.());
    },
  };
}

export type { GenerationJob, ImageAsset, Profile, TestResult };
