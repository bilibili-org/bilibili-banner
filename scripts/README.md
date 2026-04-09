# Banner 抓取与渲染说明

本目录下的 `grab/index.ts` 同时支持两套 Banner 数据来源：

- `v1`：通过 Puppeteer 模拟交互，反推多图层 Banner 的运动参数。
- `v2`：直接解析首页 HTML 中内嵌的 `split_layer` 配置。

## 一、V1 模式：鼠标模拟计算运动参数

`v1` 抓取逻辑会模拟鼠标移动，自动分析 Banner 的图层变换规律。注意：**此方式无法捕获 Canvas 图层的资源和参数**。

### 1.1 采集策略：三态采样法

为了解各个参数随鼠标移动的变化规律，脚本采集了三个特定状态：

- **基准态 (Base)**：鼠标未进入容器时的初始状态。
- **左移态 (Left)**：鼠标向左移动 `1000px` 后的状态。
- **右移态 (Right)**：鼠标向右移动 `1000px` 后的状态。

所有“速度 (Speed)”参数本质上都是变化系数，即：

$$ \text{参数速度} = \frac{\Delta \text{状态值}}{\Delta \text{鼠标位移}} $$

### 1.2 核心参数算法

#### 中心点与平移分量 (`translateX`, `translateY`)

B 站 Banner 的图层通常通过 CSS `transform` 进行布局。

- **中心点确定**：采集时直接读取 `window.getComputedStyle` 返回的 `matrix`。该矩阵的 `e` 和 `f` 分量分别代表图层当前相对于其布局位置的水平和垂直偏移（像素）。
- **平移提取**：通过 `new DOMMatrix(style.transform)` 直接提取 `matrix.e` 和 `matrix.f`。
- **排除干扰**：由于计算的是变化率，即使图层初始位置不在 `(0, 0)`，公式 $\frac{Value_{moved} - Value_{base}}{Distance}$ 也会自动抵消初始平移常量。

#### 旋转速度 (`rotateSpeed`)

浏览器返回的矩阵 `matrix(a, b, c, d, ...)` 中包含旋转信息。

- **原理**：图层的旋转弧度 $\theta = \operatorname{atan2}(b, a)$。
- **计算**：分别算出基准、左、右三个状态的弧度，再计算弧度变化率。
- **精度**：阈值为 $10^{-8}$，小于该值的变化视为无旋转。

#### 缩放速度 (`scaleSpeed`) 与排除旋转干扰

旧版 Banner 的缩放由 CSS `scale()` 实现，而不是直接修改 `width/height`。

当鼠标移动时，如果 `getBoundingClientRect().width` 发生变化而 `el.width` 不变，则可判定为 `scale` 变换。

一个标准 2D 变换矩阵 $M$ 在同时应用缩放 $s$ 和旋转 $\theta$ 时：

$$ a = s \cdot \cos\theta $$
$$ b = s \cdot \sin\theta $$

若直接使用 $a$ 或 $b$，缩放值会被旋转角度污染。利用三角恒等式 $\cos^2\theta + \sin^2\theta = 1$，可通过行向量模长提取纯净缩放比：

$$ \sqrt{a^2 + b^2} = \sqrt{(s\cos\theta)^2 + (s\sin\theta)^2} = s $$

因此，通过计算 $s = \sqrt{a^2 + b^2}$，可以在旋转存在时仍准确反推出缩放比例。

#### 透明度区间 (`opacity`)

通常表现为鼠标移向一侧时图层显现或消失。

- **逻辑**：记录 `[初始, 左限, 右限]`。
- **吸附机制**：为了防止微小浮点误差造成闪烁，脚本会对接近 `0` 或 `1` 的值进行吸附。

#### 模糊度区间 (`blur`)

通过解析 CSS `filter: blur(Npx)` 获得。

- **外推法**：由于浏览器渲染限制或鼠标移动距离限制，采集到的模糊值可能不是极值，脚本会根据移动比例做线性外推。

### 1.3 精度与过滤

- **单位归一化**：所有 Speed 参数均按 `1000px` 位移归一化。
- **零值省略**：如果计算出的系数极小（如 `ySpeed < 1e-7`），脚本会自动从 `data.json` 删除对应字段，保持配置简洁。

### 1.4 手动微调

Banner 配置文件路径通常为 `public/assets/{YYYY-MM-DD[...]}/data.json`。如果自动抓取结果与实际存在偏差，可手动调整对应目录下的配置文件。

以下表格 **仅适用于`v1`** 配置。

<details>
<summary><b>动态图层 (MediaLayer) 配置说明</b></summary>

| 属性          | 类型       | 说明                                               |
| :------------ | :--------- | :------------------------------------------------- |
| `xSpeed`      | `number`   | 水平偏移速度，正负影响位移方向                     |
| `ySpeed`      | `number`   | 垂直偏移速度，正负影响位移方向                     |
| `scaleSpeed`  | `number`   | 缩放速度，对应 `transform: scale` 的变换比例       |
| `rotateSpeed` | `number`   | 旋转速度，正负影响偏移角度                         |
| `opacity`     | `number[]` | 透明度变化区间：`[默认值, 左移极限值, 右移极限值]` |
| `blur`        | `number[]` | 模糊度变化区间：`[默认值, 左移极限值, 右移极限值]` |

</details>

<details>
<summary><b>Canvas 粒子图层 (ParticleLayer) 配置说明</b></summary>

| 属性           | 类型               | 说明                                         |
| :------------- | :----------------- | :------------------------------------------- |
| `type`         | `"particle"`       | 固定值，标识为粒子图层                       |
| `srcs`         | `string[]`         | 粒子图片素材路径数组，会从中随机选择素材渲染 |
| `count`        | `number`           | 粒子总数                                     |
| `speedRange`   | `[number, number]` | 移动速度范围 `[最小, 最大]`                  |
| `angleRange`   | `[number, number]` | 飘落角度范围 `[最小, 最大]`                  |
| `scaleRange`   | `[number, number]` | 缩放比例范围 `[最小, 最大]`                  |
| `opacityRange` | `[number, number]` | 透明度范围 `[最小, 最大]`                    |

</details>

## 二、V2 渲染引擎的由来

`v1` 的自动捕获方案本质上是“根据页面行为反推出一套近似参数”。虽然当前项目的 `v1` 效果已经能做到比较接近官方，但 `blur`、`opacity`、`scaleSpeed`、`rotateSpeed`等参数的自动捕获逻辑，是较后期才逐步补进项目的 grab 脚本中的，很多早期抓取的配置参数，并没有这些参数，因此即使现在完善了渲染逻辑，旧配置数据本身仍然缺少关键参数，导致**早期配置即便能完整渲染，但交互效果也始终和官方有较大差异**

为了解决这个问题，我尝试在 [Wayback Machine][Wayback-Machine] 里找完整记录了 banner 交互的页面，但大多数存档页面的 banner 部分都无法顺利渲染，因此转而开始逆向 B 站官网。

观察浏览器控制台请求记录，并没有发现 BAC 仓库中记录的 `x/web-show/page/header` 等类似 banner 配置的请求记录，再结合页面和脚本一起分析，最终确认现在的 banner 配置其实是直接内嵌在 HTML 里下发的，而且相关渲染逻辑链在 JS 脚本中也比较清晰。

因此项目新增了 `v2` 渲染引擎。这样可以将部分旧 banner 的配置更新到 v2 版本，最终效果会更接近官方；同时也保留 `v1` 的鼠标模拟方式，用来兼容旧配置，以及 v2 不可用时的兜底方案。

## 三、V2 官方渲染方式概览

### 1 资源预加载

官方渲染器会先预加载每一层的 `resources`：

- 图片资源直接创建 `img`，在支持 WebP 时会优先尝试追加 `@1c.webp` 后缀。
- 视频资源通过 `fetch -> Blob -> URL.createObjectURL` 预载，再交给 `video` 标签循环播放，以减少切换时的黑屏。

本项目保留了主要视觉逻辑，但没有完全照搬 Blob 预载和 WebP 改写这些外围优化，因此目标是“效果几乎一致”，而不是完全复制官方实现。

### 2 布局与初始尺寸

官方会先计算一个高度补偿系数：

$$ w = \frac{\text{bannerHeight}}{155} $$

然后对每一层：

- 创建一个 `.layer` 容器。
- 将首个资源 `resources[0]` 挂到容器中作为实际显示元素。
- 按 `intrinsicSize * w * initialScale` 计算首帧宽高。

### 3 交互输入模型

官方把横向鼠标位移归一化为：

$$ b = \frac{\text{clientX} - \text{anchorX}}{\text{bannerWidth}} $$

其中：

- 鼠标首次进入 Banner 时记录 `anchorX`。
- 鼠标离开或窗口失焦时，会用 `200ms` 的回弹动画把位移渐进恢复到 `0`。

整个动画刷新由 `requestAnimationFrame` 驱动。

### 4 曲线与属性插值

官方的关键不是简单线性插值，而是“对称三次贝塞尔曲线 + 统一属性模型”。

若某个属性存在 `offsetCurve`，官方会先构造一个关于原点镜像对称的曲线函数：

$$
curve(x) =
\begin{cases}
bezier(x), & x \ge 0 \\
-bezier(-x), & x < 0
\end{cases}
$$

然后大多数动态属性都按统一公式求值：

$$ current = initial + offset \cdot curve(b) $$

应用到各属性后，大致可归纳为：

- `scale`：`initial + offset * curve(b)`
- `rotate`：`initial + offset * curve(b)`
- `translate`：`(initial + offset * curve(b)) * w * initialScale`
- `blur`：在上述结果基础上再根据 `wrap` 做裁剪或折返
- `opacity`：同样支持 `wrap`

### 5 `wrap` 的两种行为

`blur` 和 `opacity` 支持两种边界模式：

- `clamp`：超出范围后直接截断。
- `alternate`：做镜像折返，形成 `0 -> 1 -> 0` 或 `0 -> n -> 0` 的往返效果。

其中 `opacity.alternate` 的视觉效果尤其明显，常用来实现呼吸感或循环显隐。

## 四、历史快照

鉴于 B 站 Banner 的时效性，若需回溯已下线的往期 Banner，目前可行的数据源仍主要依赖 [Wayback Machine][Wayback-Machine]。且由于 Wayback Machine 的采集机制限制，快照质量参差不齐。这里仅收录经测试可还原完整 Banner 交互体验的数据源：

- [2020-10-01](https://web.archive.org/web/20201010160645/https://www.bilibili.com/)
- [2021-02-17](https://web.archive.org/web/20210217142039/https://www.bilibili.com/)
- [2021-04-12](https://web.archive.org/web/20210412120844/https://www.bilibili.com/)
- [2023-03-31](https://web.archive.org/web/20230331001110/https://www.bilibili.com/)
- [2023-05-08](https://web.archive.org/web/20230508113754/https://www.bilibili.com/)
- [2023-06-12](https://web.archive.org/web/20230612101044/https://www.bilibili.com/)
- [2023-07-18](https://web.archive.org/web/20230718015206/https://www.bilibili.com/)
- [2023-08-13](https://web.archive.org/web/20230805200401/https://www.bilibili.com/)
- [2023-08-21](https://web.archive.org/web/20230905184625/https://www.bilibili.com/)
- [2024-12-26](https://web.archive.org/web/20241226082416/https://www.bilibili.com/)

[Wayback-Machine]: https://web.archive.org/
