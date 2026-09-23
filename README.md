# API Canvas

API Canvas 是一个面向 Windows 的本地桌面端文生图工具。它使用 Wails 将 React/TypeScript 前端与 Go 后端连接起来，允许用户配置 OpenAI 官方 API 或 OpenAI 兼容的中转服务，提交提示词生成图片，并在本地查看、保存和管理生成历史。

> 当前项目处于首版开发阶段。核心 Wails Bridge 与真实上游请求已经接入，界面和测试也已具备；发布级安装包、跨平台支持以及更多图像编辑能力暂不在范围内。

## 功能概览

- **多 Profile 配置**：保存多个上游配置，设置默认 Profile，并支持编辑和删除。
- **OpenAI 风格 API**：支持 Images API 与 Responses API 两类图像生成协议。
- **兼容中转服务**：支持配置自定义 Base URL，并保留兼容网关路径。
- **连接测试与模型获取**：通过上游 `/models` 检查地址、凭据和服务可用性，并拉取可选模型。
- **文生图**：输入提示词，选择模型、尺寸、质量和输出格式后发起生成。
- **任务状态管理**：显示排队、运行、成功、失败和取消状态；支持取消任务。
- **有限自动重试**：网络超时、连接中断、限流和部分 5xx 错误可有限重试；鉴权和参数错误不会自动重试。
- **本地历史记录**：生成成功后保存图片和参数快照，支持查看、删除、复制提示词、打开图片和另存图片。
- **本地密钥保护**：API Key 不进入前端状态、普通配置文件、历史记录或日志；Windows 下单独使用 DPAPI 加密保存。
- **减少动态效果**：前端根据系统的减少动态效果设置降低或移除非必要动画。
- **前端 Mock 模式**：浏览器开发和前端测试可使用 Mock Bridge，不依赖真实桌面运行时。

## 界面布局

首版采用三栏桌面布局：

```text
┌──────────────┬──────────────────────────────┬──────────────────┐
│ 历史记录栏    │ 当前画布 / 生成结果            │ 生成控制面板       │
│              │                              │                  │
│ 缩略图与时间  │ 提示词示例、结果和任务状态      │ 模型、尺寸、质量   │
│              │                              │ 输出格式、生成按钮 │
└──────────────┴──────────────────────────────┴──────────────────┘
```

- 左侧历史栏默认宽度为 260px，可折叠为图标栏。
- 中间画布优先展示当前结果，生成中显示任务状态和取消操作。
- 右侧面板负责提示词、反向提示词、模型、尺寸、质量、输出格式和主操作。
- 设置对话框负责 Profile、API Key、协议和模型配置。

## 技术栈

### 桌面端与后端

- [Wails](https://wails.io/)：桌面窗口、资源打包和 Go/前端桥接
- Go：业务服务、上游 HTTP 请求、任务生命周期、本地文件和持久化
- Go 标准库 HTTP Client：避免通过供应商 SDK 固化协议
- Windows DPAPI：保护本地 API Key

### 前端

- React 19
- TypeScript
- Vite 7
- React Context + `useReducer`
- `lucide-react`
- Vitest + Testing Library

## 项目结构

```text
.
├── backend.go              # Go 后端服务、Profile、生成任务、历史和上游请求
├── backend_test.go         # 后端单元测试
├── app.go                  # Wails App 基础绑定
├── main.go                 # Wails 启动入口与前端资源嵌入
├── keys_windows.go         # Windows DPAPI 密钥存储
├── keys_other.go           # 非 Windows 的密钥存储实现
├── wails.json              # Wails 构建配置
├── frontend/
│   ├── src/
│   │   ├── components/     # 画布、生成面板、历史栏、设置和布局组件
│   │   ├── state/          # React Context 与 reducer
│   │   ├── lib/bridge/     # Wails Bridge、Mock Bridge 与前后端类型
│   │   ├── hooks/          # 前端 hooks
│   │   └── styles/         # 全局样式、设计 token 和玻璃效果
│   ├── public/samples/     # 空状态示例图片
│   ├── package.json
│   └── vite.config.ts
├── docs/
│   ├── PRD.md              # 产品需求
│   ├── PRODUCT.md          # 产品设计与交互规范
│   ├── ARCHITECTURE.md     # 产品架构和模块边界
│   ├── TECHNICAL.md        # 技术架构和安全约束
│   ├── DATABASE.md         # 数据存储设计
│   └── API.md              # Wails Bridge 与上游协议说明
└── BORROWING_PLAN.md       # 参考项目借鉴计划
```

## 工作原理

```text
React/TypeScript UI
        │
        │ Wails generated bindings / runtime events
        ▼
Go App service
        │
        ├── Profile 与配置持久化
        ├── Generation job 生命周期、取消、重试
        ├── Provider 请求与响应解析
        ├── 图片下载与本地历史
        └── Windows 文件与密钥能力
```

前端不直接拼接供应商请求，也不保存 API Key 明文。Go 后端根据 Profile 的协议类型和策略，将统一请求转换为 Images API 或 Responses API 请求，并将返回的 Base64 图片或远程图片 URL 统一保存到本地应用数据目录。

## 安全与数据存储

API Canvas 默认将数据保存到本机应用数据目录：

- `state.json`：Profile 元数据和历史/任务状态等普通数据。
- `keys.json`：独立保存的 API Key；Windows 下使用 DPAPI 加密。
- `images/`：生成图片文件。

安全约束包括：

- 前端只接收掩码后的 API Key，不回显完整密钥。
- API Key 不写入 `state.json`、localStorage、历史记录或普通日志。
- 远程上游只允许 HTTPS；HTTP 仅允许 localhost 和回环地址。
- 原始响应可用于诊断，但不得包含 API Key。
- 图片路径由 Go 解析并通过 Bridge 返回，前端不自行拼接本地路径。

> 请注意：本项目会向你配置的上游服务发送提示词和生成请求。请确认你的 Base URL、API Key、服务条款和数据隐私要求。

## 开发环境

建议环境：

- Windows
- Go，具体版本要求以 `go.mod` 为准
- Node.js 和 npm
- Wails CLI v2

检查依赖：

```powershell
go version
node --version
npm --version
wails version
```

## 安装依赖

在项目根目录执行：

```powershell
npm --prefix frontend install
go mod download
```

Wails 也会按照 `wails.json` 中的配置在构建时执行前端依赖安装和构建。

## 前端开发与测试

### 启动 Vite 前端开发服务器

```powershell
npm --prefix frontend run dev
```

该模式主要用于开发 React 界面，默认使用前端 Mock Bridge，适合快速调试组件和交互。

### 类型检查

```powershell
npm --prefix frontend run typecheck
```

### 运行前端测试

```powershell
npm --prefix frontend test
```

### 构建前端

```powershell
npm --prefix frontend run build
```

## 后端测试

在项目根目录执行：

```powershell
go test ./...
```

后端测试覆盖的重点包括：

- Base URL 规范化和兼容路径保留
- Profile 输入校验
- 远程 HTTP 拒绝与回环 HTTP 放行
- `/models` 请求和错误归类
- Images/Responses 请求构造
- 重试策略和上下文取消
- 图片响应解析与本地保存
- API Key 脱敏和密钥存储行为

## 构建桌面应用

确保 `frontend/dist` 已生成后，在项目根目录执行：

```powershell
wails build
```

构建产物通常位于：

```text
build/bin/api-canvas.exe
```

开发模式：

```powershell
wails dev
```

Wails 会根据 `wails.json` 启动前端开发服务器、生成绑定并运行桌面窗口。

## 基本使用流程

1. 启动 API Canvas。
2. 打开设置并创建 Profile。
3. 选择协议：
   - `Images API`：使用图像生成接口。
   - `Responses API`：通过 Responses API 的 `image_generation` 工具生成图片。
4. 填写 Base URL、API Key 和模型信息。
5. 测试连接，必要时从上游获取模型列表。
6. 选择可用模型并保存 Profile。
7. 在右侧面板输入提示词，配置尺寸、质量和格式。
8. 点击“生成”，在画布中查看结果。
9. 通过历史栏再次查看、复制提示词、打开图片、另存或删除记录。

### Base URL 说明

后端会统一规范化 Base URL：

- 根地址会自动补充 `/v1`。
- 已包含 `/v1` 或 `/openai` 等兼容路径的地址会保留，不重复追加。
- 远程服务必须使用 `https://`。
- `http://` 只允许 localhost、`127.0.0.1` 或 IPv6 回环地址。

## Wails Bridge 主要接口

前端通过 Bridge 调用 Go 服务，主要接口包括：

| 类别 | 接口 |
| --- | --- |
| Profile | `ListProfiles`、`CreateProfile`、`UpdateProfile`、`DeleteProfile`、`SetDefaultProfile` |
| 连接 | `TestProfile`、`FetchModels` |
| 生成 | `StartGeneration`、`CancelGeneration` |
| 历史 | `ListHistory`、`DeleteHistory`、`SaveImage`、`OpenImage` |
| 事件 | `generation.started`、`generation.progress`、`generation.completed`、`generation.failed`、`generation.canceled` |

详细字段和错误分类请参阅 [`docs/API.md`](docs/API.md)。

## 当前边界

根据产品需求和现有实现，以下能力暂不属于首版范围：

- 图生图、多参考图和蒙版编辑
- 移动端、macOS、Linux 和在线 Web 版
- 多用户、账号系统和云端同步
- 批量生成、工作流编排和插件系统
- 自动提示词优化
- 流式预览不作为生成成功的前置条件
- 搜索、筛选、批量历史操作和图片对比

## 相关文档

- [产品需求](docs/PRD.md)
- [产品设计](docs/PRODUCT.md)
- [产品架构](docs/ARCHITECTURE.md)
- [技术架构](docs/TECHNICAL.md)
- [数据库设计](docs/DATABASE.md)
- [API 接口](docs/API.md)
- [借鉴计划](BORROWING_PLAN.md)

## 许可证

当前仓库未声明开源许可证。若要公开发布，请在仓库根目录补充许可证文件，并在此处更新说明。
