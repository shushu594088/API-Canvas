// OpenAI Images API 各模型家族的合法参数集合。
// 依据 openai/openai-openapi 官方规范核对：dall-e-2 / dall-e-3 / gpt-image 系
// 取值互不兼容，前端按 model 前缀归类，只暴露该模型可用的选项。

export type ModelFamily = "gpt-image" | "dall-e-3" | "dall-e-2";

export function modelFamily(model: string): ModelFamily {
  if (model.startsWith("gpt-image") || model.startsWith("chatgpt-image")) return "gpt-image";
  if (model.startsWith("dall-e-3")) return "dall-e-3";
  return "dall-e-2";
}

export interface SizeChoice {
  value: string;
  ratio: string;
  label: string;
}

export function sizeChoices(sizes: string[]): SizeChoice[] {
  return sizes.map((value) => {
    if (value === "auto") return { value, ratio: "auto", label: "自动" };
    const [width, height] = value.split("x").map(Number);
    const divisor = (a: number, b: number): number => b === 0 ? a : divisor(b, a % b);
    const common = divisor(width, height);
    return { value, ratio: `${width / common}:${height / common}`, label: value.replace("x", " × ") };
  });
}
export interface ParamOptions {
  sizes: string[];
  qualities: string[];
  formats: string[];
}

export function paramOptions(model: string): ParamOptions {
  switch (modelFamily(model)) {
    case "gpt-image":
      return {
        sizes: ["auto", "1024x1024", "1536x1024", "1024x1536", "1536x1536", "2048x1024", "1024x2048"],
        qualities: ["auto", "low", "medium", "high"],
        formats: ["png", "jpeg", "webp"],
      };
    case "dall-e-3":
      return {
        sizes: ["1024x1024", "1792x1024", "1024x1792"],
        qualities: ["standard", "hd"],
        formats: ["png"],
      };
    case "dall-e-2":
      return {
        sizes: ["256x256", "512x512", "1024x1024"],
        qualities: ["standard"],
        formats: ["png"],
      };
  }
}

export interface ModelParams {
  size: string;
  quality: string;
  format: string;
}

export function defaultParams(model: string): ModelParams {
  const opts = paramOptions(model);
  const family = modelFamily(model);
  return {
    size: family === "gpt-image" ? "1024x1024" : opts.sizes[0],
    quality: family === "gpt-image" ? "medium" : "standard",
    format: opts.formats[0],
  };
}

/** 切换模型后若旧参数不在新模型的合法集合内，替换为该集合的默认值。 */
export function coerceParams(model: string, params: ModelParams): ModelParams {
  const opts = paramOptions(model);
  const d = defaultParams(model);
  return {
    size: opts.sizes.includes(params.size) ? params.size : d.size,
    quality: opts.qualities.includes(params.quality) ? params.quality : d.quality,
    format: opts.formats.includes(params.format) ? params.format : d.format,
  };
}

