import type { ErrorCode } from "./bridge/types";

export interface ErrorCopy {
  title: string;
  hint: string;
}

export function errorCopy(code: ErrorCode): ErrorCopy {
  switch (code) {
    case "auth_failed":
      return { title: "鉴权失败", hint: "API Key 无效或已过期，请在设置中检查该 Profile 的 Key。" };
    case "invalid_request":
      return { title: "请求无效", hint: "参数组合不被当前模型支持，请调整尺寸、质量或格式后重试。" };
    case "model_unavailable":
      return { title: "模型不可用", hint: "当前上游不支持该模型，请在设置中更换图像模型 ID。" };
    case "rate_limited":
      return { title: "触发限流", hint: "上游请求过于频繁，请稍等片刻再重试。" };
    case "content_blocked":
      return { title: "内容被拦截", hint: "提示词触发了上游的内容审核，请调整后重新生成。" };
    case "network_error":
      return { title: "网络错误", hint: "无法连接上游服务，请检查网络与 Base URL 配置。" };
    case "timeout":
      return { title: "请求超时", hint: "上游响应超时，请稍后重试。" };
    case "upstream_error":
      return { title: "上游服务异常", hint: "服务端内部错误，请稍后重试。" };
    case "storage_error":
      return { title: "保存失败", hint: "图片未能写入本地磁盘，请检查存储空间与目录权限。" };
  }
}
