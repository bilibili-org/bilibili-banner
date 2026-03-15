import puppeteer from "puppeteer";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const DEFAYLT_SCREEN_WIDTH = 1650;
const DEFAYLT_SCREEN_HEIGHT = 800;
const DEFAYLT_MOUSE_MOVE_DISTANCE = 1000;

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
  if (fs.existsSync(dataDir)) {
    fs.readdirSync(dataDir).forEach((file) => {
      fs.unlinkSync(path.join(dataDir, file));
    });
    console.log("已清空目录", dataDir);
  } else {
    fs.mkdirSync(dataDir, { recursive: true });
    console.log("已创建目录", dataDir);
  }
}

// ─────────────────────── Puppeteer Functions ───────────────────────

async function launchBrowser() {
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
    width: DEFAYLT_SCREEN_WIDTH,
    height: DEFAYLT_SCREEN_HEIGHT,
  });
  return { browser, page };
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
      const fileName = item.src.split("/").pop();
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
  console.log("正在下载资源素材...");
  for (const url of urls) {
    const fileName = url.split("/").pop();
    const filePath = path.join(dataDir, fileName);

    const content = await page.evaluate(async (assetUrl) => {
      const res = await fetch(assetUrl);
      const buffer = await res.arrayBuffer();
      return { buffer: Array.from(new Uint8Array(buffer)) };
    }, url);

    fs.writeFileSync(filePath, Buffer.from(content.buffer));
  }
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
  }
}

function calcAcceleration(item, left, right) {
  const origX = item.transform[4];
  const aLeft = (left.translateX - origX) / -DEFAYLT_MOUSE_MOVE_DISTANCE;
  const aRight = (right.translateX - origX) / DEFAYLT_MOUSE_MOVE_DISTANCE;
  item.a = Number(((aLeft + aRight) / 2).toFixed(8));
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
    DEFAYLT_MOUSE_MOVE_DISTANCE / (DEFAYLT_SCREEN_WIDTH / 2),
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
  await page.mouse.move(leftX + DEFAYLT_MOUSE_MOVE_DISTANCE, centerY, {
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
  await page.mouse.move(rightX - DEFAYLT_MOUSE_MOVE_DISTANCE, centerY, {
    steps: 10,
  });
  await sleep(1500);
  const leftStates = await captureLayerStates(page);

  calcFinalData(layerData, leftStates, rightStates);
}

function dumpData(data, dataDir) {
  const outputPath = path.join(dataDir, "data.json");
  fs.writeFileSync(outputPath, JSON.stringify(data, null, 2));
  console.log(`已写入 ${outputPath}`);
}

function updateManifest(bannerName, date, dataLoaderFilePath) {
  let code = fs.readFileSync(dataLoaderFilePath, "utf8");
  const newEntry = `    { date: "${date}", variants: [{ name: "${bannerName}" }] },`;
  // 在 NEW_DATA_PLACEHOLDER 注释前插入新条目
  code = code.replace(/(\s*\/\/\s*NEW_DATA_PLACEHOLDER)/, `\n${newEntry}$1`);
  fs.writeFileSync(dataLoaderFilePath, code);
  console.log(`已更新 BannerDataLoader.ts`);
}

// ─────────────────────── Orchestrator ───────────────────────

async function runGrabber(bannerName) {
  const date = generateDate();
  const dataDir = path.resolve(__dirname, `../public/assets/${date}`);
  const dataLoaderFilePath = path.resolve(
    __dirname,
    "../src/core/BannerDataLoader.ts",
  );

  prepareDataDir(dataDir);

  let browser;
  try {
    const launchResult = await launchBrowser();
    browser = launchResult.browser;
    const page = launchResult.page;

    console.log("正在加载页面...");
    await page.goto("https://www.bilibili.com/", {
      waitUntil: "domcontentloaded",
    });
    await sleep(1000);
    await page.goto("https://www.bilibili.com/", {
      waitUntil: "domcontentloaded",
    });

    console.log("正在检测动态 Banner...");
    await page.waitForSelector(".animated-banner");
    await sleep(2000);

    const layerData = await parseLayers(page);
    const remoteUrls = transformLayerSrc(layerData, dataDir);

    await scrapeMoveParams(page, layerData);

    dumpData(layerData, dataDir);
    updateManifest(bannerName, date, dataLoaderFilePath);
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

const bannerName = process.argv[2];
if (!bannerName) {
  console.error(
    'Banner 未命名，请正确运行命令\n示例: node scripts/grab.js "大海之上 - 鳄鱼"',
  );
  process.exit(1);
}

runGrabber(bannerName);
