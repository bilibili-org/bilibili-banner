# bilibili-banner 仿 B 站首页动态头图

基于 [palxiao/bilibili-banner](https://github.com/palxiao/bilibili-banner) 重构，使用 TypeScript + Vite 重新实现，尽可能准确地还原了 B 站首页 Banner 及其交互效果

[🚀 在线预览](https://bilibili-org.github.io/bilibili-banner/)

![cover-2021-04-12](docs/image/cover-2021-04-12.png)
![cover-2026-01-09](docs/image/cover-2026-01-09.png)

## 🛠️ 快速开始

### 1. 安装依赖

```bash
pnpm install
```

### 2. 本地开发

```bash
pnpm dev
```

### 3. 格式化与类型检查

```bash
pnpm lint
pnpm typecheck
```

### 4. 构建与预览

```bash
pnpm build && pnpm preview
```

## 📥 数据抓取指南

项目提供了 `grab` 自动化脚本，用于抓取 Banner 所需的图层资源和配置参数

使用方式：

```bash
pnpm grab -m v1
```

参数说明：

- `-m`：**必选参数**。指定抓取模式，当前支持 `v1` 和 `v2`
  - `v1`：通过 Puppeteer 模拟鼠标交互，反推出 Banner 的运动参数
  - `v2`：直接解析首页 HTML 内嵌的 Banner 图层配置
- `-u`：**可选参数**。指定 Wayback Machine 完整快照 URL；未提供时默认抓取当前日期的官网数据

> [!NOTE]
> `v1` 模式依赖 Puppeteer，因此需要在项目根目录提供 `.env` 并配置 `PUPPETEER_EXECUTABLE_PATH` 环境变量：
>
> ```env
> PUPPETEER_EXECUTABLE_PATH=X:\path\to\chrome.exe
> ```
>
> 如果需要了解抓取链路、参数微调方式，或 `v1 / v2` 的实现差异，请阅读 [scripts/README.md](scripts/README.md)。

## ❤️ 鸣谢

- 感谢 [Bilibili](https://www.bilibili.com) 设计师们带来的精美艺术作品
- 原项目：[palxiao/bilibili-banner](https://github.com/palxiao/bilibili-banner)
