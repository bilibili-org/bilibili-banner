# bilibili-banner 仿B站首页动态头图

基于 [palxiao/bilibili-banner](https://github.com/palxiao/bilibili-banner) 重构，使用 TypeScript + Vite 完全重写，高度还原 B 站动态 Banner 及交互效果

---

[在线预览](https://bilibili-org.github.io/bilibili-banner/)
![cover](docs/image/cover.png)

> 自动化通常只能完成 90% 的工作，部分参数可能需要手动微调以达到最佳交互效果，具体可参考下方说明和往期数据
>
> 数据更新可能不及时或错过，如果你恰好发现B站更新头图，欢迎 PR ~
>
> 最后，希望你喜欢这个项目 ❤️

## 准备工作

1. 运行 `pnpm i` 或 `npm i` 安装依赖
2. **配置浏览器路径**：抓取工具依赖 Puppeteer，如果你的电脑没有安装默认路径的 Chrome，请创建 `.env` 文件并指定浏览器可执行文件路径：
   ```env
   PUPPETEER_EXECUTABLE_PATH=X:\path\to\chrome.exe
   ```

## 查看演示网页

1. 运行 `pnpm dev`（或 `npm run dev`）

## 抓取最新 Banner 数据

1. 运行 `pnpm grab`，抓取 B 站官网当天的 Banner 数据，会自动在 `public/assets` 目录下生成数据（以当天日期命名并自动记录）
2. 运行 `pnpm dev` 查看效果

## 抓取往期 Banner 数据

如果错过了某天的 Banner，可以通过 [Web Archive](https://web.archive.org/) 获取历史数据。需通过 `--archive` 参数启用抓取往期数据功能，`-d` 参数指定日期，`-u` 参数指定 Web Archive 中 bilibili 历史快照的完整 URL

```bash
pnpm grab --archive -d 2024-12-26 -u https://web.archive.org/web/20241226082416/https://www.bilibili.com/
```

- `--archive` 参数为必填，表示抓取往期数据
- `-d`: 指定日期 (YYYY-MM-DD)
- `-u`: 指定 Web Archive 中 bilibili 历史快照的完整 URL

## 参数示例

> [!IMPORTANT]
> 目前自动化脚本可以生成图层所需的所有参数，但如果效果与实际有差距，可手动调整参数

打开 `public/assets` 目录下对应的 `data.json` 文件，修改其中需要调整对象的参数，然后运行 `pnpm dev` 查看效果

目前支持参数如下：

| 属性    | 类型   | 说明                                                   |
| ------- | ------ | ------------------------------------------------------ |
| a       | number | 水平移动幅度，数值越大偏移越明显（支持正负值）         |
| deg     | number | 旋转幅度，数值越大旋转角度越大（支持正负值）           |
| g       | number | 垂直移动（重力）幅度，数值越大偏移越明显（支持正负值） |
| f       | number | 缩放比例，对应 CSS `transform: scale`                  |
| opacity | array  | 透明度变化区间，格式：`[default, leftMax, rightMax]`   |
| blur    | array  | 模糊度变化区间，格式：`[default, leftMax, rightMax]`   |

> 注：正负值会影响变化的方向

## 项目开发历程

> 以下文章由原作者 [Shawn Phang](https://github.com/palxiao) 撰写，详细记录了该项目的技术原理与实现过程。

- [复刻 Bilibili 首页头图的视差交互效果技术原理详解](https://juejin.cn/post/7269385060611997711)
- [三分钟复刻B站首页动态Banner](https://juejin.cn/post/7288331623992688680)
- [一键自动1比1复刻 B 站首页动态 Banner](https://juejin.cn/post/7295720738568159267)

## 鸣谢

- 原项目：[palxiao/bilibili-banner](https://github.com/palxiao/bilibili-banner)

- 部分素材来源：[Cloudtq/bilibili-banner](https://github.com/Cloudtq/bilibili-banner/tree/main), [web.archive.org](docs/README.md)
