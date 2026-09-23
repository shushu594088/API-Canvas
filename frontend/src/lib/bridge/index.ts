export * from "./types";
export { createWailsBridge } from "./wails";

import { createWailsBridge } from "./wails";
import type { Bridge } from "./types";

export const bridge: Bridge = createWailsBridge();
