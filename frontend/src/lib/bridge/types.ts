// 与 docs/API.md 对齐的前后端契约。

export type ProtocolKind = "images" | "responses";
export type RequestStrategy = "openai" | "compatible";

export type ErrorCode =
  | "auth_failed"
  | "invalid_request"
  | "model_unavailable"
  | "rate_limited"
  | "content_blocked"
  | "network_error"
  | "timeout"
  | "upstream_error"
  | "storage_error";

export interface Profile {
  id: string;
  name: string;
  protocol: ProtocolKind;
  baseUrl: string;
  /** 掩码后的 Key，例如 sk-••••ab12。界面任何位置不回显明文。 */
  apiKeyMasked: string;
  hasKey: boolean;
  model: string;
  /** Responses API 文本模型；Images API 可为空。 */
  textModel?: string;
  /** Profile 中允许用于生成的模型列表，model 为默认项。 */
  models?: string[];
  strategy: RequestStrategy;
  isDefault: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface ProfileInput {
  name: string;
  protocol: ProtocolKind;
  baseUrl: string;
  /** 编辑时留空表示沿用已保存的 Key。 */
  apiKey?: string;
  model: string;
  textModel?: string;
  strategy: RequestStrategy;
  models?: string[];
}

export type TestConclusion = "ok" | "auth_failed" | "bad_url" | "model_unavailable";

export interface TestResult {
  conclusion: TestConclusion;
  latencyMs?: number;
}

export interface GenerationRequest {
  prompt: string;
  negativePrompt?: string;
  model: string;
  size: string;
  quality: string;
  format: string;
  profileId: string;
}

export type JobStatus = "queued" | "running" | "succeeded" | "failed" | "canceled";

export interface GenerationJob {
  id: string;
  profileId: string;
  prompt: string;
  negativePrompt?: string;
  model: string;
  size: string;
  quality: string;
  format: string;
  status: JobStatus;
  progress: number;
  errorCode?: ErrorCode;
  errorMessage?: string;
  createdAt: number;
}

export interface ImageAsset {
  id: string;
  jobId: string;
  /** 由后端解析出的可渲染地址，前端不自行拼路径。 */
  displayUrl: string;
  filePath: string;
  width: number;
  height: number;
}

export interface HistoryItem {
  jobId: string;
  prompt: string;
  negativePrompt?: string;
  model: string;
  size: string;
  quality: string;
  format: string;
  createdAt: number;
  thumbnailUrl: string;
  assetId: string;
}

export interface HistoryQuery {
  cursor?: string;
  limit?: number;
}

export interface HistoryPage {
  items: HistoryItem[];
  nextCursor?: string;
}

export type GenerationEvent =
  | { type: "generation.started"; job: GenerationJob }
  | { type: "generation.progress"; jobId: string; progress: number }
  | { type: "generation.completed"; job: GenerationJob; asset: ImageAsset }
  | { type: "generation.failed"; job: GenerationJob; code: ErrorCode; message: string }
  | { type: "generation.canceled"; job: GenerationJob };

export interface Bridge {
  listProfiles(): Promise<Profile[]>;
  createProfile(input: ProfileInput): Promise<Profile>;
  updateProfile(id: string, input: ProfileInput): Promise<Profile>;
  deleteProfile(id: string): Promise<void>;
  setDefaultProfile(id: string): Promise<void>;
  testProfile(input: ProfileInput): Promise<TestResult>;
  listAvailableModels(protocol: ProtocolKind, strategy: RequestStrategy): Promise<string[]>;
  fetchModels?: (profileId: string | null, input: ProfileInput) => Promise<string[]>;
  startGeneration(request: GenerationRequest): Promise<GenerationJob>;
  cancelGeneration(jobId: string): Promise<void>;
  listHistory(query: HistoryQuery): Promise<HistoryPage>;
  deleteHistory(jobId: string): Promise<void>;
  /** 保存图片到本地，返回保存路径。浏览器 Mock 下触发下载。 */
  saveImage(assetId: string): Promise<string>;
  /** 用系统程序打开图片文件。 */
  openImage(assetId: string): Promise<void>;
  onGenerationEvent(handler: (event: GenerationEvent) => void): () => void;
}

