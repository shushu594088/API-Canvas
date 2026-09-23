# API Canvas

API Canvas 是一个 Windows 桌面端图像生成工具，支持配置 OpenAI 官方 API 或 OpenAI 兼容服务，输入提示词生成图片，并在本地查看生成历史。

## 功能

- 多个 API 配置 Profile
- OpenAI Images API 与 Responses API 图像生成
- 反向提示词、质量、格式和尺寸选择
- 本地历史记录与图片保存
- API Key 使用 Windows DPAPI 保护

## 开发环境

- Go
- Node.js / npm
- Wails CLI v2
- Windows WebView2 Runtime

## 本地构建

```powershell
cd frontend
npm ci
npm run build
cd ..
wails build -platform windows/amd64
```

生成的可执行文件位于 `build/bin/api-canvas.exe`。若已安装 NSIS，可使用以下命令生成安装包：

```powershell
wails build -platform windows/amd64 -nsis -installscope user
```

## 数据位置

应用配置、受保护的 API Key、历史记录和图片保存在当前用户配置目录下的 `API Canvas` 文件夹。首次启动改名后的版本会从旧的 `Image Studio` 文件夹迁移已有数据，不会删除旧数据。

## 许可证

本项目遵循仓库中的 `LICENSE` 文件。
