# bilibili-banner 仿 B 站首页动态头图

基于 [palxiao/bilibili-banner](https://github.com/palxiao/bilibili-banner) 重构，使用 TypeScript + Vite 完全重写，高度还原 B 站动态 Banner 及交互效果。本项目长期收集并汇总了自 2020 年起 B 站首页的大部分动态 Banner

---

[🚀 在线预览](https://bilibili-org.github.io/bilibili-banner/)

![cover](docs/image/cover.png)

## 🛠️ 快速开始

### 1. 安装依赖

```bash
pnpm install
```

### 2. 环境配置

抓取工具依赖 Puppeteer。您必须在项目根目录下创建 `.env` 文件并指定 Chrome 系浏览器可执行文件路径

```env
PUPPETEER_EXECUTABLE_PATH=X:\path\to\chrome.exe
```

### 3. 本地预览

```bash
pnpm dev
```

## 📥 数据抓取指南

### 抓取最新 Banner

实时获取 B 站官网当天的 Banner 数据，会自动在 `public/assets` 目录下生成日期命名的文件夹

```bash
pnpm grab
```

### 抓取往期 Banner

如果错过了某天的 Banner，可以通过 [Web Archive](https://web.archive.org/) 网站获取历史数据

```bash
pnpm grab --archive -u https://web.archive.org/web/20241226082416/https://www.bilibili.com/
```

**参数说明**：

- `--archive`：启用往期抓取
- `-u`：Web Archive 完整快照 URL

## ⚙️ 进阶参数微调

> 自动化脚本可完成动态图层所需的大部分参数计算。但早期 B 站实现雪花等粒子效果时使用的是 Canvas 渲染，此类图层需要手动添加粒子配置（近期 Banner 改用 WebM 视频实现渲染）
>
> 此外，若自动抓取的参数效果与实际存在偏差，亦可参照下方说明进行手动微调

Banner 配置文件位于 `public/assets/{YYYY-MM-DD[...]}/data.json`（文件夹通常以日期开头，并可能带有描述性后缀），找到对应目录下的 `data.json` 文件进行调整

<details>
<summary><b>动态图层 (MotionLayer) 配置说明</b></summary>

| 属性            | 类型     | 说明                                               |
| :-------------- | :------- | :------------------------------------------------- |
| **xSpeed**      | `number` | 水平偏移速度（正负影响位移方向）                   |
| **ySpeed**      | `number` | 垂直偏移速度（正负影响位移方向）                   |
| **scaleSpeed**  | `number` | 缩放速度，对应 `transform: scale` 的变换比例       |
| **rotateSpeed** | `number` | 旋转速度（正负影响偏移角度）                       |
| **opacity**     | `array`  | 透明度变化区间：`[默认值, 左移极限值, 右移极限值]` |
| **blur**        | `array`  | 模糊度变化区间：`[默认值, 左移极限值, 右移极限值]` |

</details>

<details>
<summary><b>Canvas 粒子图层 (ParticleLayer) 配置说明</b></summary>

| 属性             | 类型               | 说明                                         |
| :--------------- | :----------------- | :------------------------------------------- |
| **type**         | `"particle"`       | 固定值，标识为粒子图层                       |
| **srcs**         | `string[]`         | 粒子图片素材路径数组，会从中随机选择素材渲染 |
| **count**        | `number`           | 粒子总数                                     |
| **speedRange**   | `[number, number]` | 移动速度范围 `[最小, 最大]`                  |
| **angleRange**   | `[number, number]` | 飘落角度范围（度）`[最小, 最大]`             |
| **scaleRange**   | `[number, number]` | 缩放比例范围 `[最小, 最大]`                  |
| **opacityRange** | `[number, number]` | 透明度范围 `[最小, 最大]`                    |

</details>

## 📚 项目开发历程

> 以下文章由原作者 [Shawn Phang](https://github.com/palxiao) 撰写，详细记录了该项目的技术原理与实现过程

- [复刻 Bilibili 首页头图的视差交互效果技术原理详解](https://juejin.cn/post/7269385060611997711)
- [三分钟复刻B站首页动态Banner](https://juejin.cn/post/7288331623992688680)
- [一键自动1比1复刻 B 站首页动态 Banner](https://juejin.cn/post/7295720738568159267)

## 🤝 鸣谢

- **原项目**：[palxiao/bilibili-banner](https://github.com/palxiao/bilibili-banner)
- **部分素材来源**：[Cloudtq/bilibili-banner](https://github.com/Cloudtq/bilibili-banner/tree/main), [web.archive.org](docs/README.md)

最后，感谢 [Bilibili](https://www.bilibili.com) 设计师们带来的精美艺术作品❤️
