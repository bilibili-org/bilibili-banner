import fs from "node:fs";
import path, { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { DailyBannerGroup } from "../../src/types";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export function cleanUrl(url: string): string {
  return url.split("@")[0];
}

export function createStagedDataDir(date: string): string {
  return path.resolve(__dirname, `../../temp/grab-${date}-${Date.now()}`);
}

export function removeDir(dirPath: string): void {
  if (fs.existsSync(dirPath)) {
    fs.rmSync(dirPath, { recursive: true, force: true });
  }
}

export function prepareEmptyDir(dirPath: string): void {
  removeDir(dirPath);
  fs.mkdirSync(dirPath, { recursive: true });
  console.log("已准备临时目录", path.basename(dirPath));
}

function getPublishedDataDir(date: string): string {
  return path.resolve(__dirname, `../../public/assets/${date}`);
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
      removeDir(backupDir);
    }

    console.log("已发布资源目录", path.basename(targetDir));
  } catch (error: unknown) {
    if (!fs.existsSync(targetDir) && fs.existsSync(backupDir)) {
      fs.renameSync(backupDir, targetDir);
    }
    throw error;
  }
}

function updateBannerManifest(date: string): void {
  const configFilePath = path.resolve(__dirname, "../../src/data/banner.json");

  let banners: DailyBannerGroup[] = [];
  if (fs.existsSync(configFilePath)) {
    banners = JSON.parse(fs.readFileSync(configFilePath, "utf8"));
  }

  const bannerName = date;
  const existingIndex = banners.findIndex((banner) => banner.date === date);

  if (existingIndex !== -1) {
    const existingRefs = banners[existingIndex].refs || [];
    const variantExists = existingRefs.some(
      (variant) => variant.name === bannerName,
    );

    if (!variantExists) {
      existingRefs.push({ name: bannerName, path: date });
      banners[existingIndex].refs = existingRefs;
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

export function publishGrabResult(date: string, stagedDir: string): void {
  publishDataDir(stagedDir, getPublishedDataDir(date));
  updateBannerManifest(date);
}

// biome-ignore lint/suspicious/noExplicitAny: the data can be any structure from the layer config
export function dumpLayerConfig(dataDir: string, data: any): void {
  const outputPath = path.join(dataDir, "data.json");

  fs.writeFileSync(outputPath, JSON.stringify(data, null, 2));
  console.log("已写入 data.json 配置文件");
}
