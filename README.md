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

### 3. 构建与预览

```bash
pnpm build && pnpm preview
```

## 📥 banner 配置抓取指南

项目提供了 `grab` 自动化脚本，用于抓取 Banner 所需的图层资源和配置参数，数据通常保存在以日期命名的 `public/assets/{YYYY-MM-DD}` 目录下

使用示例：

```bash
pnpm grab -m v2 -u https://web.archive.org/web/20241226082416/https://www.bilibili.com/
```

参数说明：

- `-m`：**必选参数**。指定抓取模式，当前支持 `v1` 和 `v2` 两个选项
  - `v2`：直接解析首页 HTML 内嵌的 Banner 官方图层参数，**优先推荐**
  - `v1`：通过 Puppeteer 模拟鼠标交互，反推出 Banner 的运动参数，当 `v2` 不可用时使用此模式抓取
- `-u`：**可选参数**。指定 Wayback Machine 完整快照 URL；未提供时默认抓取当前日期的官网数据

> [!TIP]
> 抓取脚本应优先使用 `v2` 模式，根据仓库目前已有的数据表明，B站在 2023 年之后就已经开始通过 HTML 内嵌 Banner 数据的方式来下发配置，且 v2 的渲染逻辑也几乎和官方一致，能最大程度还原 Banner 的交互效果
>
> 如果需要了解抓取链路、参数微调方式，或 `v1 / v2` 的实现差异，请阅读 [scripts/README.md](scripts/README.md)。

> [!NOTE]
> `v1` 模式依赖 Puppeteer，需要手动指定 Chromium 系浏览器的可执行程序路径。脚本在运行时会优先读取当前环境中的 `PUPPETEER_EXECUTABLE_PATH` 变量；若未提供，则会尝试加载项目根目录 `.env` 中的同名变量
>
> ```env
> PUPPETEER_EXECUTABLE_PATH=X:\path\to\chrome.exe
> ```

## ❤️ 鸣谢

- 感谢 [Bilibili](https://www.bilibili.com) 设计师们带来的精美艺术作品
- 原项目：[palxiao/bilibili-banner](https://github.com/palxiao/bilibili-banner)
