import puppeteer from "puppeteer";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const DEFAULT_SCREEN_WIDTH = 1650;
const DEFAULT_SCREEN_HEIGHT = 800;
const DEFAULT_MOUSE_MOVE_DISTANCE = 1000;

// ─────────────────────── Utility Functions ───────────────────────

/**
 * 延迟指定时间
 * @param {number} ms - 毫秒数
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function generateDate() {
  const today = new Date();
  const y = today.getFullYear();
  const m = String(today.getMonth() + 1).padStart(2, "0");
  const d = String(today.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function prepareDataDir(dataDir) {
  const dirName = path.basename(dataDir);
  if (fs.existsSync(dataDir)) {
    fs.readdirSync(dataDir).forEach((file) => {
      fs.unlinkSync(path.join(dataDir, file));
    });
    console.log("已清空目录", dirName);
  } else {
    fs.mkdirSync(dataDir, { recursive: true });
    console.log("已创建目录", dirName);
  }
}

// ─────────────────────── Puppeteer Functions ───────────────────────

async function initBrowser() {
  const executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
  if (!executablePath) {
    throw new Error(
      "未找到浏览器路径。请在 .env 文件中配置 PUPPETEER_EXECUTABLE_PATH，或在运行命令时通过环境变量指定\n" +
        "示例内容: PUPPETEER_EXECUTABLE_PATH=C:\\Programs\\chrome.exe",
    );
  }

  const browser = await puppeteer.launch({
    headless: "new",
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

// ─────────────────────── Banner Setup Functions ───────────────────────

async function setupOfficialBanner(page, targetUrl) {
  console.log(`正在加载官网页面: ${targetUrl}`);
  await page.goto(targetUrl, { waitUntil: "domcontentloaded" });
  await sleep(2000);
  await page.goto(targetUrl, { waitUntil: "domcontentloaded" });

  console.log("正在检测动态 Banner...");
  await page.waitForSelector(".animated-banner", { timeout: 10000 });
}

async function setupArchiveBanner(page, targetUrl) {
  console.log(`正在加载 Archive 页面: ${targetUrl}`);
  await page.goto(targetUrl, { waitUntil: "networkidle2", timeout: 60000 });

  console.log("正在准备页面环境 (隐藏 Archive 工具栏)...");
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
  } catch (e) {
    console.warn("未直接检测到 .animated-banner，尝试滚动页面...");
    await page.evaluate(() => window.scrollTo(0, 100));
    await sleep(3000);
    await page.waitForSelector(".animated-banner", { timeout: 10000 });
  }
}

// ─────────────────────── Core Logic Functions ───────────────────────

async function parseLayers(page) {
  console.log("正在解析图层元数据...");
  const data = [];
  const layerElements = await page.$$(".animated-banner .layer");
  for (const layerEl of layerElements) {
    const layerData = await page.evaluate((el) => {
      const child = el.firstElementChild;
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
        width: child.width,
        height: child.height,
        src: child.src,
        blur: blur,
        a: 0.01,
      };
    }, layerEl);

    data.push(layerData);
  }
  return data;
}

/**
 * 转换元数据中的 src 为本地相对路径，并返回原始远端 URL 列表
 * @param {Array} data
 * @param {string} dataDir
 * @returns {string[]} remoteUrls
 */
function transformLayerSrc(data, dataDir) {
  const dirName = path.basename(dataDir);
  const urls = [];
  for (const item of data) {
    if (item.src) {
      urls.push(item.src);
      const fileName = item.src.split("/").pop().split("?")[0];
      item.src = `./assets/${dirName}/${fileName}`;
    }
  }
  return urls;
}

/**
 * 遍历 URL 列表下载所有素材
 * @param {string[]} urls
 * @param {import('puppeteer').Page} page
 * @param {string} dataDir
 */
async function downloadAssets(urls, page, dataDir) {
  const total = urls.length;
  console.log(`开始下载资源素材 (共 ${total} 个)...`);
  let current = 0;
  for (const url of urls) {
    const fileName = url.split("/").pop().split("?")[0];
    const filePath = path.join(dataDir, fileName);

    try {
      const content = await page.evaluate(async (assetUrl) => {
        const res = await fetch(assetUrl);
        const buffer = await res.arrayBuffer();
        return { buffer: Array.from(new Uint8Array(buffer)) };
      }, url);

      fs.writeFileSync(filePath, Buffer.from(content.buffer));
      current++;
      process.stdout.write(`\r下载进度: (${current}/${total}) `);
    } catch (e) {
      process.stdout.write("\n");
      console.warn(`下载素材失败: ${url}`, e.message);
    }
  }
  process.stdout.write("\n");
}

/**
 * 采集当前所有图层的视觉状态
 */
async function captureLayerStates(page) {
  const layerElements = await page.$$(".animated-banner .layer");
  const states = [];
  for (const el of layerElements) {
    const state = await page.evaluate((el) => {
      const child = el.firstElementChild;
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

function calcFinalData(layerData, leftStates, rightStates) {
  for (let i = 0; i < layerData.length; i++) {
    const item = layerData[i];
    const left = leftStates[i];
    const right = rightStates[i];

    if (!left || !right) {
      throw new Error(`图层状态不完整: ${item.src}`);
    }

    calcAcceleration(item, left, right);
    calcOpacity(item, left, right);
    calcBlur(item, left, right);
    calcGravity(item, left, right);
    calcDeg(item, left, right);
    calcScale(item, left, right);
  }
}

function calcAcceleration(item, left, right) {
  const origX = item.transform[4];
  const aLeft = (left.translateX - origX) / -DEFAULT_MOUSE_MOVE_DISTANCE;
  const aRight = (right.translateX - origX) / DEFAULT_MOUSE_MOVE_DISTANCE;
  item.a = Number(((aLeft + aRight) / 2).toFixed(8));
}

function calcGravity(item, left, right) {
  const origY = item.transform[5];
  const gLeft = (left.translateY - origY) / -DEFAULT_MOUSE_MOVE_DISTANCE;
  const gRight = (right.translateY - origY) / DEFAULT_MOUSE_MOVE_DISTANCE;
  const g = (gLeft + gRight) / 2;
  if (Math.abs(g) > 1e-7) {
    item.g = Number(g.toFixed(8));
  }
}

function calcDeg(item, left, right) {
  const baseRad = Math.atan2(item.transform[1], item.transform[0]);
  const leftRad = Math.atan2(left.matrixB, left.matrixA);
  const rightRad = Math.atan2(right.matrixB, right.matrixA);

  const dDegLeft = (leftRad - baseRad) / -DEFAULT_MOUSE_MOVE_DISTANCE;
  const dDegRight = (rightRad - baseRad) / DEFAULT_MOUSE_MOVE_DISTANCE;
  const deg = (dDegLeft + dDegRight) / 2;

  if (Math.abs(deg) > 1e-8) {
    item.deg = Number(deg.toFixed(9));
  }
}

function calcScale(item, left, right) {
  const base = item.baseScale ?? 1;
  const fLeft = (left.scaleS - base) / -DEFAULT_MOUSE_MOVE_DISTANCE;
  const fRight = (right.scaleS - base) / DEFAULT_MOUSE_MOVE_DISTANCE;
  const f = (fLeft + fRight) / 2;
  if (Math.abs(f) > 1e-8) {
    item.f = Number(f.toFixed(10));
  }
  delete item.baseScale;
}

function calcOpacity(item, left, right) {
  const defOp = item.opacity[0];

  const snap = (captured) => {
    if (defOp === 0) return captured > 0 ? 1 : 0;
    if (defOp === 1) return captured < 1 ? 0 : 1;
    return captured; // 回退逻辑，尽管 B 站通常只有 0 和 1
  };

  item.opacity = [defOp, snap(left.opacity), snap(right.opacity)];
}

function calcBlur(item, left, right) {
  const ratio = Math.min(
    DEFAULT_MOUSE_MOVE_DISTANCE / (DEFAULT_SCREEN_WIDTH / 2),
    1,
  );

  const defBlur = item.blur || 0;

  const process = (captured) => {
    const extrapolated = defBlur + (captured - defBlur) / ratio;
    const clamped = Math.max(0, extrapolated);
    return clamped < 1 ? 0 : Math.ceil(clamped);
  };

  const blurLeft = process(left.blur);
  const blurRight = process(right.blur);

  if (defBlur === blurLeft && defBlur === blurRight) {
    if (defBlur !== 0) {
      item.blur = defBlur;
    } else {
      delete item.blur;
    }
  } else {
    item.blur = [defBlur, blurLeft, blurRight];
  }
}

async function scrapeMoveParams(page, layerData) {
  const element = await page.$(".animated-banner");
  const { x, y } = await element.boundingBox();
  const viewportWidth = page.viewport().width;

  const leftX = x + 100;
  const rightX = x + viewportWidth - 100;

  const centerY = y + 80;
  const resetY = y + 200; // Banner 下方

  // 1. 计算右移 (从左边缘开始)
  console.log("正在计算右移参数...");
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
  console.log("正在计算左移参数...");
  await page.mouse.move(rightX, centerY);
  await page.mouse.move(rightX - DEFAULT_MOUSE_MOVE_DISTANCE, centerY, {
    steps: 10,
  });
  await sleep(1500);
  const leftStates = await captureLayerStates(page);

  calcFinalData(layerData, leftStates, rightStates);
}

function dumpLayerData(data, dataDir) {
  const outputPath = path.join(dataDir, "data.json");
  fs.writeFileSync(outputPath, JSON.stringify(data, null, 2));
  console.log(`已写入 data.json 配置文件`);
}

function updateBannerManifest(date) {
  const configFilePath = path.resolve(__dirname, "../src/data/banners.json");
  const bannerName = date;

  let banners = [];
  try {
    if (fs.existsSync(configFilePath)) {
      banners = JSON.parse(fs.readFileSync(configFilePath, "utf8"));
    }

    const existingIndex = banners.findIndex((b) => b.date === date);
    if (existingIndex !== -1) {
      const variantExists = banners[existingIndex].variants.some(
        (v) => v.name === bannerName,
      );
      if (!variantExists) {
        banners[existingIndex].variants.push({ name: bannerName });
      }
    } else {
      banners.push({
        date,
        variants: [{ name: bannerName }],
      });
    }

    banners.sort((a, b) => a.date.localeCompare(b.date));

    fs.writeFileSync(configFilePath, JSON.stringify(banners, null, 2), "utf8");
    console.log("已更新 banners.json 配置文件");
  } catch (error) {
    console.error(`更新配置文件失败: ${error.message}`);
  }
}

// ─────────────────────── Orchestrator ───────────────────────

async function runGrabber(date, targetUrl) {
  const dataDir = path.resolve(__dirname, `../public/assets/${date}`);
  const isArchive = targetUrl.includes("web.archive.org");

  let browser;
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
      await sleep(6000);
      layerData = await parseLayers(page);
    }
    if (layerData.length === 0) {
      console.error("未获取到图层数据，退出");
      return false;
    }

    const remoteUrls = transformLayerSrc(layerData, dataDir);
    await scrapeMoveParams(page, layerData);

    updateBannerManifest(date);

    prepareDataDir(dataDir);
    dumpLayerData(layerData, dataDir);
    await downloadAssets(remoteUrls, page, dataDir);
    console.log("抓取完成！运行 pnpm dev 查看效果");
    return true;
  } catch (error) {
    console.error("抓取出错:", error.message);
    return false;
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

// ─────────────────────── Entry Point ───────────────────────

const args = process.argv.slice(2);
let isArchive = false;
let date = "";
let targetUrl = "https://www.bilibili.com/";

for (let i = 0; i < args.length; i++) {
  if (args[i] === "--archive") {
    isArchive = true;
  } else if (args[i] === "-d" && args[i + 1]) {
    date = args[i + 1];
    i++;
  } else if (args[i] === "-u" && args[i + 1]) {
    targetUrl = args[i + 1];
    i++;
  }
}

if (isArchive) {
  if (!date || !targetUrl) {
    console.error(
      "Archive 模式参数错误。必须包含 -d 和 -u 参数\n" +
        "用法: node scripts/grab.js -archive -d <date> -u <url>\n",
    );
    process.exit(1);
  }
} else {
  date = generateDate();
}

runGrabber(date, targetUrl);
