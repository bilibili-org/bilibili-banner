import fs from "node:fs";
import path, { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer, { type Browser, type Page } from "puppeteer";

export const DEFAULT_SCREEN_WIDTH = 1650;
export const DEFAULT_SCREEN_HEIGHT = 800;
export const DEFAULT_MOUSE_MOVE_DISTANCE = 1000;

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ENV_FILE = path.resolve(__dirname, "../../../.env");

export interface BrowserSession {
  browser: Browser;
  page: Page;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function resolveExecutablePath(): string {
  const inlinePath = process.env.PUPPETEER_EXECUTABLE_PATH?.trim();
  if (inlinePath) {
    return inlinePath;
  }

  if (fs.existsSync(PROJECT_ENV_FILE)) {
    process.loadEnvFile(PROJECT_ENV_FILE);
  }

  const executablePath = process.env.PUPPETEER_EXECUTABLE_PATH?.trim();
  if (executablePath) {
    return executablePath;
  }

  throw new Error(
    "未找到浏览器路径。请设置 PUPPETEER_EXECUTABLE_PATH，或在项目根目录 .env 中配置该变量\n" +
      "示例内容: PUPPETEER_EXECUTABLE_PATH=/path/to/chrome.exe",
  );
}

export async function initBrowser(): Promise<BrowserSession> {
  const executablePath = resolveExecutablePath();

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

export async function loadPage(
  page: Page,
  targetUrl: string,
  isArchive: boolean,
): Promise<void> {
  if (isArchive) {
    await loadArchiveBanner(page, targetUrl);
  } else {
    await loadOfficialBanner(page, targetUrl);
  }
}

async function loadOfficialBanner(
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

async function loadArchiveBanner(page: Page, targetUrl: string): Promise<void> {
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
  } catch (_error) {
    console.warn("未直接检测到 .animated-banner，尝试滚动页面...");
    await page.evaluate(() => window.scrollTo(0, 100));
    await sleep(10000);
    await page.waitForSelector(".animated-banner", { timeout: 10000 });
  }
}
