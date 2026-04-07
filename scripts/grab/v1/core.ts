import fs from "node:fs";
import path from "node:path";
import type { Page } from "puppeteer";
import type { LayersV1, MediaLayer } from "../../../src/types";
import type { AssetDownloadCtx, DownloadSummary } from "../types";
import { cleanUrl } from "../workflow";
import {
  DEFAULT_MOUSE_MOVE_DISTANCE,
  DEFAULT_SCREEN_WIDTH,
  sleep,
} from "./browser";

interface LayerConfig {
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

interface CaptureMetrics {
  captureBannerWidth: number;
  captureBannerHeight: number;
}

interface BannerData {
  version: 1;
  type: "multi-layer";
  captureBannerWidth: number;
  captureBannerHeight: number;
  layers: LayersV1;
}

export async function parseLayers(page: Page): Promise<LayerConfig[]> {
  console.log("正在解析图层元数据...");
  const data: LayerConfig[] = [];
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
        blur,
        xSpeed: 0.01,
      };
    }, layerEl);

    data.push(layerData);
  }

  return data;
}

export function buildAssetDownloadCtx(
  data: LayerConfig[],
  targetDirName: string,
  stagedDir: string,
): AssetDownloadCtx[] {
  const ctx: AssetDownloadCtx[] = [];
  const seenUrls = new Set<string>();
  const fileSourceMap = new Map<string, string>();

  for (const item of data) {
    if (!item.src) {
      continue;
    }

    const sourceUrl = cleanUrl(item.src);
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
      ctx.push({
        sourceUrl,
        fileName,
        filePath: path.join(stagedDir, fileName),
      });
    }
  }

  return ctx;
}

export async function downloadAssets(
  ctx: AssetDownloadCtx[],
  page: Page,
): Promise<DownloadSummary> {
  const total = ctx.length;
  console.log(`开始下载资源素材 (共 ${total} 个)...`);
  let successCount = 0;
  const failed: DownloadSummary["failed"] = [];

  for (const task of ctx) {
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
    const state = await page.evaluate((layer) => {
      const child = layer.firstElementChild as HTMLElement;
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
        blur,
      };
    }, el);

    states.push(state);
  }

  return states;
}

async function getAnimatedBannerBox(page: Page) {
  const element = await page.$(".animated-banner");
  if (!element) {
    throw new Error("未找到 .animated-banner");
  }

  const box = await element.boundingBox();
  if (!box) {
    throw new Error("无法获取 .animated-banner");
  }

  return box;
}

function calcXSpeed(
  layerMetadata: LayerConfig,
  left: LayerState,
  right: LayerState,
): void {
  const origX = layerMetadata.transform[4];
  const aLeft = (left.translateX - origX) / -DEFAULT_MOUSE_MOVE_DISTANCE;
  const aRight = (right.translateX - origX) / DEFAULT_MOUSE_MOVE_DISTANCE;
  layerMetadata.xSpeed = Number(((aLeft + aRight) / 2).toFixed(8));
}

function calcYSpeed(
  layerMetadata: LayerConfig,
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
  layerMetadata: LayerConfig,
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
  layerMetadata: LayerConfig,
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
  layerMetadata: LayerConfig,
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
  layerMetadata: LayerConfig,
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
  layerMetadatas: LayerConfig[],
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

export async function captureBannerMetrics(
  page: Page,
): Promise<CaptureMetrics> {
  const box = await getAnimatedBannerBox(page);
  const viewportWidth = page.viewport()?.width || DEFAULT_SCREEN_WIDTH;

  return {
    captureBannerWidth: viewportWidth,
    captureBannerHeight: Number(box.height.toFixed(3)),
  };
}

export async function scrapeAndUpdateLayerParams(
  page: Page,
  layerMetadatas: LayerConfig[],
): Promise<void> {
  const box = await getAnimatedBannerBox(page);
  const { x, y } = box;
  const viewportWidth = page.viewport()?.width || DEFAULT_SCREEN_WIDTH;

  const leftX = x + 100;
  const rightX = x + viewportWidth - 100;
  const centerY = y + 80;
  const resetY = y + 200;

  await page.mouse.move(leftX, centerY);
  await page.mouse.move(leftX + DEFAULT_MOUSE_MOVE_DISTANCE, centerY, {
    steps: 10,
  });
  await sleep(1500);
  const rightStates = await captureLayerStates(page);

  await page.mouse.move(viewportWidth / 2, resetY);
  await sleep(1500);

  await page.mouse.move(rightX, centerY);
  await page.mouse.move(rightX - DEFAULT_MOUSE_MOVE_DISTANCE, centerY, {
    steps: 10,
  });
  await sleep(1500);
  const leftStates = await captureLayerStates(page);

  calcLayerParams(layerMetadatas, leftStates, rightStates);
}

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

export function buildBannerData(
  layerConfigs: LayerConfig[],
  captureMetrics: CaptureMetrics,
): BannerData {
  const finalLayers: LayersV1 = layerConfigs.map((item) => {
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

  return {
    version: 1,
    type: "multi-layer",
    captureBannerWidth: captureMetrics.captureBannerWidth,
    captureBannerHeight: captureMetrics.captureBannerHeight,
    layers: finalLayers,
  };
}
