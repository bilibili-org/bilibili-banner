# bilibili-banner 仿 B 站首页动态 Banner

本项目基于 [palxiao/bilibili-banner](https://github.com/palxiao/bilibili-banner) 重构，使用了 TypeScript + Vite 重新实现，尽可能还原了自 2019 年以来 B 站首页 Banner 及其交互效果

[🚀 在线预览](https://bilibili-org.github.io/bilibili-banner/)

![cover-2021-04-12](docs/image/cover-2021-04-12.png)
![cover-2021-07-01](docs/image/cover-2021-07-01.png)
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

## 📥 Banner 配置抓取指南

项目提供了 `grab` 自动化脚本，用于抓取 Banner 所需的图层资源和配置参数，数据通常保存在以日期命名的 `public/assets/{YYYY-MM-DD}` 目录下

使用示例：

```bash
pnpm grab -m v2 -u https://web.archive.org/web/20241226082416/https://www.bilibili.com/
```

参数说明：

- `-m`：指定抓取模式，当前支持 <`v1`|`v2`>
  - `v2`：直接解析官网首页 HTML 内嵌的 Banner 图层参数，**优先推荐**
  - `v1`：通过 Puppeteer 模拟鼠标交互，反推出各图层的运动参数
- `-u`：指定 Wayback Machine 完整快照 URL；未提供时默认抓取当前日期的官网数据

> [!TIP]
> 抓取配置应优先使用 `v2` 模式，根据仓库已抓取的数据表明，B站早在 2023 年之后就已经开始使用 HTML 内嵌 Banner 数据的方式来下发配置，且 v2 的渲染逻辑也和官方基本一致，能最大程度还原 Banner 的交互效果
> 
> 如果需要了解 `v1 / v2` 的实现差异，或是抓取链路、参数微调方式，请阅读 [scripts/README.md](scripts/README.md)。

> [!NOTE]
> `v1` 模式依赖 Puppeteer，需要通过环境变量手动指定 Chromium 系浏览器的可执行程序路径。可在项目根目录的 `.env` 文件添加 `PUPPETEER_EXECUTABLE_PATH` 变量或是直接设置环境变量
>
> ```env
> PUPPETEER_EXECUTABLE_PATH=X:\path\to\chrome.exe
> ```

## ❤️ 鸣谢

- 感谢 [Bilibili](https://www.bilibili.com) 设计师们带来的精美艺术作品
- 原项目：[palxiao/bilibili-banner](https://github.com/palxiao/bilibili-banner)
