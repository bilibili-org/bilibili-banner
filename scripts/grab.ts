import fs from "node:fs";
import path, { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer, { type Browser, type Page } from "puppeteer";
import type { DailyBannerGroup, Layers, MediaLayer } from "../src/core/types";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const DEFAULT_SCREEN_WIDTH = 1650;
const DEFAULT_SCREEN_HEIGHT = 800;
const DEFAULT_MOUSE_MOVE_DISTANCE = 1000;

// ─────────────────────── Internal Types ───────────────────────

interface LayerMetadata {
  tagName: string;
  opacity: number[];
  transform: number[];
  baseScale: number;
  width: number;
  height: number;
  src: string;
  blur?: number | number[];
  xSpeed: number;
  ySpeed?: number;
  rotateSpeed?: number;
  scaleSpeed?: number;
}

interface LayerState {
  translateX: number;
  translateY: number;
  matrixA: number;
  matrixB: number;
  scaleS: number;
  opacity: number;
  blur: number;
}

interface AssetDownloadTask {
  sourceUrl: string;
  fileName: string;
  filePath: string;
}

interface DownloadSummary {
  total: number;
  successCount: number;
  failed: Array<{ url: string; reason: string }>;
}

// ─────────────────────── Utility Functions ───────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function generateDate(): string {
  const today = new Date();
  const y = today.getFullYear();
  const m = String(today.getMonth() + 1).padStart(2, "0");
  const d = String(today.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function removeDirIfExists(dirPath: string): void {
  if (fs.existsSync(dirPath)) {
    fs.rmSync(dirPath, { recursive: true, force: true });
  }
}

function prepareEmptyDir(dataDir: string): void {
  removeDirIfExists(dataDir);
  fs.mkdirSync(dataDir, { recursive: true });
  console.log("已准备临时目录", path.basename(dataDir));
}

function publishDataDir(stagedDir: string, targetDir: string): void {
  const targetDirExists = fs.existsSync(targetDir);
  const backupDir = `${targetDir}.bak-${Date.now()}`;

  try {
    if (targetDirExists) {
      fs.renameSync(targetDir, backupDir);
    }

    fs.renameSync(stagedDir, targetDir);

    if (targetDirExists) {
      removeDirIfExists(backupDir);
    }

    console.log("已发布资源目录", path.basename(targetDir));
  } catch (error: unknown) {
    if (!fs.existsSync(targetDir) && fs.existsSync(backupDir)) {
      fs.renameSync(backupDir, targetDir);
    }
    throw error;
  }
}

// ─────────────────────── Puppeteer Functions ───────────────────────

async function initBrowser(): Promise<{ browser: Browser; page: Page }> {
  const executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
  if (!executablePath) {
    throw new Error(
      "未找到浏览器路径。请在 .env 文件中配置 PUPPETEER_EXECUTABLE_PATH，或在运行命令时通过环境变量指定\n" +
        "示例内容: PUPPETEER_EXECUTABLE_PATH=C:\\Programs\\chrome.exe",
    );
  }

  const browser = await puppeteer.launch({
    headless: true,
    executablePath,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
  const page = await browser.newPage();
  await page.setViewport({
    width: DEFAULT_SCREEN_WIDTH,
    height: DEFAULT_SCREEN_HEIGHT,
  });
  return { browser, page };
}

async function setupOfficialBanner(
  page: Page,
  targetUrl: string,
): Promise<void> {
  console.log(`正在加载官网页面: ${targetUrl}`);
  await page.goto(targetUrl, { waitUntil: "domcontentloaded" });
  await sleep(2000);
  await page.goto(targetUrl, { waitUntil: "domcontentloaded" });
  await sleep(2000);
  console.log("正在检测动态 Banner...");
  await page.waitForSelector(".animated-banner", { timeout: 10000 });
}

async function setupArchiveBanner(
  page: Page,
  targetUrl: string,
): Promise<void> {
  console.log(`正在加载 Wayback Machine 页面: ${targetUrl}`);
  await page.goto(targetUrl, { waitUntil: "networkidle2", timeout: 60000 });

  console.log("正在准备页面环境 (隐藏 Wayback Machine 工具栏)...");
  await page.evaluate(() => {
    const wm = document.getElementById("wm-ipp-base");
    if (wm) wm.style.display = "none";
    const wm2 = document.getElementById("wm-ipp-print");
    if (wm2) wm2.style.display = "none";
  });

  console.log("正在检测动态 Banner...");
  try {
    await page.waitForSelector(".animated-banner", { timeout: 10000 });
    await sleep(3000);
  } catch (_e) {
    console.warn("未直接检测到 .animated-banner，尝试滚动页面...");
    await page.evaluate(() => window.scrollTo(0, 100));
    await sleep(10000);
    await page.waitForSelector(".animated-banner", { timeout: 10000 });
  }
}

// ─────────────────────── Core Logic Functions ───────────────────────

async function parseLayers(page: Page): Promise<LayerMetadata[]> {
  console.log("正在解析图层元数据...");
  const data: LayerMetadata[] = [];
  const layerElements = await page.$$(".animated-banner .layer");
  for (const layerEl of layerElements) {
    const layerData = await page.evaluate((el) => {
      const child = el.firstElementChild as HTMLImageElement | HTMLVideoElement;
      const style = window.getComputedStyle(child);
      const matrix = new DOMMatrix(style.transform);

      const filterStr = style.filter;
      let blur = 0;
      if (filterStr && filterStr !== "none") {
        const match = filterStr.match(/blur\((.+?)px\)/);
        if (match) blur = parseFloat(match[1]);
      }

      return {
        tagName: child.tagName.toLowerCase(),
        opacity: [
          parseFloat(style.opacity),
          parseFloat(style.opacity),
          parseFloat(style.opacity),
        ],
        transform: [matrix.a, matrix.b, matrix.c, matrix.d, matrix.e, matrix.f],
        baseScale: Math.sqrt(matrix.a * matrix.a + matrix.b * matrix.b),
        width: (child as HTMLImageElement).width || 0,
        height: (child as HTMLImageElement).height || 0,
        src: (child as HTMLImageElement).src || "",
        blur: blur,
        xSpeed: 0.01,
      };
    }, layerEl);

    data.push(layerData);
  }
  return data;
}

function buildAssetDownloadTasks(
  data: LayerMetadata[],
  targetDirName: string,
  stagedDir: string,
): AssetDownloadTask[] {
  const tasks: AssetDownloadTask[] = [];
  const seenUrls = new Set<string>();
  const fileSourceMap = new Map<string, string>();

  for (const item of data) {
    if (item.src) {
      const sourceUrl = item.src;
      const fileName = sourceUrl.split("/").pop()?.split("?")[0] || "unknown";
      const existingSource = fileSourceMap.get(fileName);

      if (existingSource && existingSource !== sourceUrl) {
        throw new Error(
          `资源文件名冲突: ${fileName}\n${existingSource}\n${sourceUrl}`,
        );
      }

      fileSourceMap.set(fileName, sourceUrl);
      item.src = `assets/${targetDirName}/${fileName}`;

      if (!seenUrls.has(sourceUrl)) {
        seenUrls.add(sourceUrl);
        tasks.push({
          sourceUrl,
          fileName,
          filePath: path.join(stagedDir, fileName),
        });
      }
    }
  }

  return tasks;
}

async function downloadAssets(
  tasks: AssetDownloadTask[],
  page: Page,
): Promise<DownloadSummary> {
  const total = tasks.length;
  console.log(`开始下载资源素材 (共 ${total} 个)...`);
  let successCount = 0;
  const failed: DownloadSummary["failed"] = [];

  for (const task of tasks) {
    try {
      let buffer: Buffer;

      if (task.sourceUrl.startsWith("blob:")) {
        const content = await page.evaluate(async (assetUrl) => {
          const res = await fetch(assetUrl);

          if (!res.ok) {
            throw new Error(`HTTP ${res.status} ${res.statusText}`);
          }

          const arrayBuffer = await res.arrayBuffer();
          return Array.from(new Uint8Array(arrayBuffer));
        }, task.sourceUrl);

        buffer = Buffer.from(content);
      } else {
        const res = await fetch(task.sourceUrl);

        if (!res.ok) {
          throw new Error(`HTTP ${res.status} ${res.statusText}`);
        }

        buffer = Buffer.from(await res.arrayBuffer());
      }

      fs.writeFileSync(task.filePath, buffer);

      successCount++;
      process.stdout.write(`\r下载进度: (${successCount}/${total}) `);
    } catch (error: unknown) {
      process.stdout.write("\n");
      const reason = error instanceof Error ? error.message : String(error);
      failed.push({ url: task.sourceUrl, reason });
    }
  }
  process.stdout.write("\n");

  return {
    total,
    successCount,
    failed,
  };
}

async function captureLayerStates(page: Page): Promise<LayerState[]> {
  const layerElements = await page.$$(".animated-banner .layer");
  const states: LayerState[] = [];
  for (const el of layerElements) {
    const state = await page.evaluate((el) => {
      const child = el.firstElementChild as HTMLElement;
      const style = window.getComputedStyle(child);
      const matrix = new DOMMatrix(style.transform);

      const filterStr = style.filter;
      let blur = 0;
      if (filterStr && filterStr !== "none") {
        const match = filterStr.match(/blur\((.+?)px\)/);
        if (match) blur = parseFloat(match[1]);
      }

      return {
        translateX: matrix.e,
        translateY: matrix.f,
        matrixA: matrix.a,
        matrixB: matrix.b,
        scaleS: Math.sqrt(matrix.a * matrix.a + matrix.b * matrix.b),
        opacity: parseFloat(style.opacity),
        blur: blur,
      };
    }, el);
    states.push(state);
  }
  return states;
}

function calcXSpeed(
  layerMetadata: LayerMetadata,
  left: LayerState,
  right: LayerState,
): void {
  const origX = layerMetadata.transform[4];
  const aLeft = (left.translateX - origX) / -DEFAULT_MOUSE_MOVE_DISTANCE;
  const aRight = (right.translateX - origX) / DEFAULT_MOUSE_MOVE_DISTANCE;
  layerMetadata.xSpeed = Number(((aLeft + aRight) / 2).toFixed(8));
}

function calcYSpeed(
  layerMetadata: LayerMetadata,
  left: LayerState,
  right: LayerState,
): void {
  const origY = layerMetadata.transform[5];
  const gLeft = (left.translateY - origY) / -DEFAULT_MOUSE_MOVE_DISTANCE;
  const gRight = (right.translateY - origY) / DEFAULT_MOUSE_MOVE_DISTANCE;
  const g = (gLeft + gRight) / 2;
  if (Math.abs(g) > 1e-7) {
    layerMetadata.ySpeed = Number(g.toFixed(8));
  }
}

function calcRotateSpeed(
  layerMetadata: LayerMetadata,
  left: LayerState,
  right: LayerState,
): void {
  const baseRad = Math.atan2(
    layerMetadata.transform[1],
    layerMetadata.transform[0],
  );
  const leftRad = Math.atan2(left.matrixB, left.matrixA);
  const rightRad = Math.atan2(right.matrixB, right.matrixA);

  const dDegLeft = (leftRad - baseRad) / -DEFAULT_MOUSE_MOVE_DISTANCE;
  const dDegRight = (rightRad - baseRad) / DEFAULT_MOUSE_MOVE_DISTANCE;
  const deg = (dDegLeft + dDegRight) / 2;

  if (Math.abs(deg) > 1e-8) {
    layerMetadata.rotateSpeed = Number(deg.toFixed(9));
  }
}

function calcScaleSpeed(
  layerMetadata: LayerMetadata,
  left: LayerState,
  right: LayerState,
): void {
  const base = layerMetadata.baseScale ?? 1;
  const fLeft = (left.scaleS - base) / -DEFAULT_MOUSE_MOVE_DISTANCE;
  const fRight = (right.scaleS - base) / DEFAULT_MOUSE_MOVE_DISTANCE;
  const f = (fLeft + fRight) / 2;
  if (Math.abs(f) > 1e-8) {
    layerMetadata.scaleSpeed = Number(f.toFixed(10));
  }
}

function calcOpacityRange(
  layerMetadata: LayerMetadata,
  left: LayerState,
  right: LayerState,
): void {
  const defOp = layerMetadata.opacity[0];

  const snap = (captured: number) => {
    if (defOp === 0) return captured > 0 ? 1 : 0;
    if (defOp === 1) return captured < 1 ? 0 : 1;
    return captured;
  };

  layerMetadata.opacity = [defOp, snap(left.opacity), snap(right.opacity)];
}

function calcBlur(
  layerMetadata: LayerMetadata,
  left: LayerState,
  right: LayerState,
): void {
  const ratio = Math.min(
    DEFAULT_MOUSE_MOVE_DISTANCE / (DEFAULT_SCREEN_WIDTH / 2),
    1,
  );

  const defBlur =
    layerMetadata.blur !== undefined
      ? typeof layerMetadata.blur === "number"
        ? layerMetadata.blur
        : layerMetadata.blur[0]
      : 0;

  const process = (captured: number) => {
    const extrapolated = defBlur + (captured - defBlur) / ratio;
    const clamped = Math.max(0, extrapolated);
    return clamped < 1 ? 0 : Math.ceil(clamped);
  };

  const blurLeft = process(left.blur);
  const blurRight = process(right.blur);

  if (defBlur === blurLeft && defBlur === blurRight) {
    if (defBlur !== 0) {
      layerMetadata.blur = defBlur;
    } else {
      delete layerMetadata.blur;
    }
  } else {
    layerMetadata.blur = [defBlur, blurLeft, blurRight];
  }
}

function calcLayerParams(
  layerMetadatas: LayerMetadata[],
  leftStates: LayerState[],
  rightStates: LayerState[],
): void {
  for (let i = 0; i < layerMetadatas.length; i++) {
    const layerMetadata = layerMetadatas[i];
    const left = leftStates[i];
    const right = rightStates[i];

    if (!left || !right) {
      throw new Error(`图层状态不完整: ${layerMetadata.src}`);
    }

    calcXSpeed(layerMetadata, left, right);
    calcOpacityRange(layerMetadata, left, right);
    calcBlur(layerMetadata, left, right);
    calcYSpeed(layerMetadata, left, right);
    calcRotateSpeed(layerMetadata, left, right);
    calcScaleSpeed(layerMetadata, left, right);
  }
}

async function scrapeMoveParams(
  page: Page,
  layerMetadatas: LayerMetadata[],
): Promise<void> {
  const element = await page.$(".animated-banner");
  if (!element) return;
  const box = await element.boundingBox();
  if (!box) return;
  const { x, y } = box;
  const viewportWidth = page.viewport()?.width || DEFAULT_SCREEN_WIDTH;

  const leftX = x + 100;
  const rightX = x + viewportWidth - 100;

  const centerY = y + 80;
  const resetY = y + 200; // Banner 下方

  // 1. 计算右移 (从左边缘开始)
  await page.mouse.move(leftX, centerY);
  await page.mouse.move(leftX + DEFAULT_MOUSE_MOVE_DISTANCE, centerY, {
    steps: 10,
  });
  await sleep(1500);
  const rightStates = await captureLayerStates(page);

  // 鼠标移动到 Banner 下方等待图层回正
  await page.mouse.move(viewportWidth / 2, resetY);
  await sleep(1500);

  // 2. 计算左移 (从右边缘开始)
  await page.mouse.move(rightX, centerY);
  await page.mouse.move(rightX - DEFAULT_MOUSE_MOVE_DISTANCE, centerY, {
    steps: 10,
  });
  await sleep(1500);
  const leftStates = await captureLayerStates(page);

  calcLayerParams(layerMetadatas, leftStates, rightStates);
}

/**
 * Custom sort function for object keys
 * Priority: type, src, width, height, transform, xSpeed, ySpeed...
 * Others: alphabetical
 */
// biome-ignore lint/suspicious/noExplicitAny: common utility for sorting keys
function sortObjectKeys(obj: any): any {
  const priorityKeys = [
    "type",
    "src",
    "srcs",
    "width",
    "height",
    "transform",
    "xSpeed",
    "ySpeed",
  ];
  const allKeys = Object.keys(obj);

  const presentPriorityKeys = priorityKeys.filter((key) =>
    allKeys.includes(key),
  );
  const otherKeys = allKeys.filter((key) => !priorityKeys.includes(key)).sort();

  // biome-ignore lint/suspicious/noExplicitAny: common utility for sorting keys
  const sortedObj: any = {};

  for (const key of presentPriorityKeys) {
    sortedObj[key] = obj[key];
  }

  for (const key of otherKeys) {
    sortedObj[key] = obj[key];
  }

  return sortedObj;
}

function dumpLayerMetadatas(
  layerMetadatas: LayerMetadata[],
  dataDir: string,
): void {
  const outputPath = path.join(dataDir, "data.json");

  // Transform RawLayerData to Layers type for storage
  const finalLayers: Layers = layerMetadatas.map((item) => {
    if (item.tagName !== "img" && item.tagName !== "video") {
      throw new Error(
        `[Grabber] 发现未知图层类型: ${item.tagName}, 目前仅支持 img 和 video, 请新增处理逻辑`,
      );
    }
    const layer: MediaLayer = {
      type: item.tagName,
      src: item.src,
      width: item.width,
      height: item.height,
      transform: item.transform,
      opacity: item.opacity,
      xSpeed: item.xSpeed,
    };
    if (item.blur !== undefined) layer.blur = item.blur;
    if (item.ySpeed !== undefined) layer.ySpeed = item.ySpeed;
    if (item.rotateSpeed !== undefined) layer.rotateSpeed = item.rotateSpeed;
    if (item.scaleSpeed !== undefined) layer.scaleSpeed = item.scaleSpeed;

    return sortObjectKeys(layer);
  });

  fs.writeFileSync(
    outputPath,
    JSON.stringify(
      {
        type: "multi-layer",
        layers: finalLayers,
      },
      null,
      2,
    ),
  );
  console.log("已写入 data.json 配置文件");
}

function updateBannerManifest(date: string): void {
  const configFilePath = path.resolve(__dirname, "../src/data/banner.json");

  let banners: DailyBannerGroup[] = [];
  if (fs.existsSync(configFilePath)) {
    banners = JSON.parse(fs.readFileSync(configFilePath, "utf8"));
  }

  const bannerName = date;
  const existingIndex = banners.findIndex((b) => b.date === date);
  if (existingIndex !== -1) {
    const variantExists = (banners[existingIndex].refs || []).some(
      (v) => v.name === bannerName,
    );
    if (!variantExists) {
      if (!banners[existingIndex].refs) banners[existingIndex].refs = [];
      banners[existingIndex].refs.push({ name: bannerName, path: date });
    }
  } else {
    banners.push({
      date,
      refs: [{ name: bannerName, path: date }],
    });
  }

  banners.sort((a, b) => a.date.localeCompare(b.date));

  fs.writeFileSync(configFilePath, JSON.stringify(banners, null, 2), "utf8");
  console.log("已更新 banner.json 配置文件");
}

// ─────────────────────── Orchestrator ───────────────────────

async function runGrabber(date: string, targetUrl: string): Promise<boolean> {
  const dataDir = path.resolve(__dirname, `../public/assets/${date}`);
  const stagedDataDir = path.resolve(
    __dirname,
    `../temp/grab-${date}-${Date.now()}`,
  );
  const isArchive = targetUrl.includes("web.archive.org");
  const targetDirName = path.basename(dataDir);

  let browser: Browser | undefined;
  try {
    const browserResult = await initBrowser();
    browser = browserResult.browser;
    const page = browserResult.page;

    if (!isArchive) {
      await setupOfficialBanner(page, targetUrl);
    } else {
      await setupArchiveBanner(page, targetUrl);
    }

    let layerData = await parseLayers(page);
    if (layerData.length === 0) {
      console.error("未获取到图层数据，尝试增加等待时间");
      await sleep(30000);
      layerData = await parseLayers(page);
    }
    if (layerData.length === 0) {
      console.error("未获取到图层数据，退出");
      return false;
    }

    const assetTasks = buildAssetDownloadTasks(
      layerData,
      targetDirName,
      stagedDataDir,
    );
    await scrapeMoveParams(page, layerData);

    prepareEmptyDir(stagedDataDir);
    dumpLayerMetadatas(layerData, stagedDataDir);

    const downloadSummary = await downloadAssets(assetTasks, page);
    if (downloadSummary.failed.length > 0) {
      console.error(
        `资源下载失败 ${downloadSummary.failed.length}/${downloadSummary.total}，已取消发布`,
      );
      downloadSummary.failed.forEach((item) => {
        console.error(`- ${item.url}: ${item.reason}`);
      });
      return false;
    }

    publishDataDir(stagedDataDir, dataDir);
    updateBannerManifest(date);
    console.log("抓取完成！运行 pnpm dev 查看效果");
    return true;
  } catch (error: unknown) {
    console.error("抓取出错:", (error as Error).message);
    return false;
  } finally {
    if (browser) {
      await browser.close();
    }
    removeDirIfExists(stagedDataDir);
  }
}

// ─────────────────────── Entry Point ───────────────────────

function parseArgs(): { date: string; targetUrl: string } {
  const args = process.argv.slice(2);
  let date = "";
  let targetUrl = "https://www.bilibili.com/";
  let urlArgProvided = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "-u" && args[i + 1]) {
      targetUrl = args[i + 1];
      urlArgProvided = true;
      i++;
    }
  }

  if (urlArgProvided) {
    // 必须符合 Archive 模式: https://web.archive.org/web/{date}/https://www.bilibili.com/
    const archivePattern =
      /web\.archive\.org\/web\/(\d{8})\d{6}\/https?:\/\/(?:www\.)?bilibili\.com\/?/;
    const match = targetUrl.match(archivePattern);

    if (!match) {
      console.error(
        "错误: 指定了 -u 参数，但 URL 不符合 Wayback Machine 网址格式\n" +
          "预期格式: https://web.archive.org/web/{YYYYMMDDHHMMSS}/https://www.bilibili.com/\n",
      );
      process.exit(1);
    }

    const d = match[1];
    date = `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
    console.log(`检测到 Wayback Machine URL，日期: ${date}`);
  } else {
    date = generateDate();
    console.log(`未指定 URL，将从 Bilibili 官网抓取，日期: ${date}`);
  }
  return { date, targetUrl };
}

const { date, targetUrl } = parseArgs();
runGrabber(date, targetUrl);
