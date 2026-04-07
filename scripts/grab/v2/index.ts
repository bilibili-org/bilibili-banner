import fs from "node:fs";
import path from "node:path";
import type { LayersV2 } from "../../../src/types";
import type { Args } from "../cli";
import type { AssetDownloadCtx, DownloadSummary } from "../types";
import {
  cleanUrl,
  createStagedDataDir,
  prepareEmptyDir,
  publishGrabResult,
  removeDir,
} from "../workflow";

interface SplitLayerPayload {
  version: string | number;
  layers: LayersV2[];
}

export async function runGrabV2(args: Args): Promise<boolean> {
  const stagedDataDir = createStagedDataDir(args.date);

  try {
    console.log(`正在请求页面源码: ${args.targetUrl}`);
    const html = await fetchHtml(args.targetUrl);
    const layers = parseLayersFromHtml(html);
    const downloadCtx = buildAssetDownloadCtx(layers, args.date, stagedDataDir);

    prepareEmptyDir(stagedDataDir);
    dumpLayerConfig(layers, stagedDataDir);

    const downloadSummary = await downloadAssets(downloadCtx);
    if (downloadSummary.failed.length > 0) {
      console.error(
        `资源下载失败 ${downloadSummary.failed.length}/${downloadSummary.total}，已取消发布`,
      );
      downloadSummary.failed.forEach((item) => {
        console.error(`- ${item.url}: ${item.reason}`);
      });
      return false;
    }

    publishGrabResult(args.date, stagedDataDir);
    console.log("抓取完成！运行 pnpm dev 查看效果");
    return true;
  } catch (error: unknown) {
    console.error(
      "抓取出错:",
      error instanceof Error ? error.message : String(error),
    );
    return false;
  } finally {
    removeDir(stagedDataDir);
  }
}

async function fetchHtml(targetUrl: string): Promise<string> {
  const response = await fetch(targetUrl, {
    signal: AbortSignal.timeout(30000),
    headers: {
      Accept: "text/html,application/xhtml+xml",
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:140.0) Gecko/20100101 Firefox/140.0",
    },
  });

  if (!response.ok) {
    throw new Error(
      `获取页面源码失败: HTTP ${response.status} ${response.statusText}`,
    );
  }

  return await response.text();
}

function parseLayersFromHtml(html: string): LayersV2[] {
  const literalContent = extractSplitLayerLiteral(html);
  const jsonText = decodeJsStringContent(literalContent);

  let parsed: SplitLayerPayload;
  try {
    parsed = JSON.parse(jsonText) as SplitLayerPayload;
  } catch (error: unknown) {
    throw new Error(
      `JSON 解析失败: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  if (Number(parsed.version) !== 1) {
    throw new Error(
      `banner 版本校验失败: 预期官方 version=1，实际为 ${String(parsed.version)}`,
    );
  }

  if (!Array.isArray(parsed.layers) || parsed.layers.length === 0) {
    throw new Error("banner 数据校验失败: layers 必须是非空数组");
  }

  return parsed.layers;
}

function extractSplitLayerLiteral(html: string): string {
  const splitLayerPattern = /(^|[^\w$"'`])["']?split_layer["']?\s*:\s*(['"])/m;
  const match = splitLayerPattern.exec(html);
  if (!match || match.index === undefined) {
    throw new Error("未找到 banner 数据");
  }

  const quote = match[2];
  const valueStart = match.index + match[0].length - 1;
  let escaped = false;

  for (let i = valueStart + 1; i < html.length; i++) {
    const char = html[i];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (char === "\\") {
      escaped = true;
      continue;
    }

    if (char === quote) {
      return html.slice(valueStart + 1, i);
    }
  }

  throw new Error("split_layer 字符串字面量未正常闭合");
}

function decodeJsStringContent(raw: string): string {
  let decoded = "";

  for (let i = 0; i < raw.length; i++) {
    const char = raw[i];

    if (char !== "\\") {
      decoded += char;
      continue;
    }

    i++;
    if (i >= raw.length) {
      throw new Error("split_layer 字符串包含非法结尾转义");
    }

    const escapeChar = raw[i];
    switch (escapeChar) {
      case "b":
        decoded += "\b";
        break;
      case "f":
        decoded += "\f";
        break;
      case "n":
        decoded += "\n";
        break;
      case "r":
        decoded += "\r";
        break;
      case "t":
        decoded += "\t";
        break;
      case "v":
        decoded += "\v";
        break;
      case "0":
        decoded += "\0";
        break;
      case "'":
      case '"':
      case "\\":
      case "/":
        decoded += escapeChar;
        break;
      case "x": {
        const hex = raw.slice(i + 1, i + 3);
        if (!/^[0-9a-fA-F]{2}$/.test(hex)) {
          throw new Error(`split_layer 包含非法十六进制转义: \\x${hex}`);
        }
        decoded += String.fromCharCode(Number.parseInt(hex, 16));
        i += 2;
        break;
      }
      case "u": {
        const hex = raw.slice(i + 1, i + 5);
        if (!/^[0-9a-fA-F]{4}$/.test(hex)) {
          throw new Error(`split_layer 包含非法 Unicode 转义: \\u${hex}`);
        }
        decoded += String.fromCharCode(Number.parseInt(hex, 16));
        i += 4;
        break;
      }
      case "\n":
        break;
      case "\r":
        if (raw[i + 1] === "\n") {
          i++;
        }
        break;
      default:
        decoded += escapeChar;
        break;
    }
  }

  return decoded;
}

function buildAssetDownloadCtx(
  layers: LayersV2[],
  targetDirName: string,
  stagedDir: string,
): AssetDownloadCtx[] {
  const ctx: AssetDownloadCtx[] = [];
  const seenUrls = new Set<string>();
  const fileSourceMap = new Map<string, string>();

  for (const layer of layers) {
    for (const resource of layer.resources ?? []) {
      if (!resource.src) {
        throw new Error(
          `V2 图层资源缺少 src: ${layer.name ?? layer.id ?? "unknown"}`,
        );
      }

      const sourceUrl = cleanUrl(resource.src);
      const fileName =
        path.posix.basename(new URL(sourceUrl).pathname) || "unknown";
      const existingSource = fileSourceMap.get(fileName);

      if (existingSource && existingSource !== sourceUrl) {
        throw new Error(
          `资源文件名冲突: ${fileName}\n${existingSource}\n${sourceUrl}`,
        );
      }

      fileSourceMap.set(fileName, sourceUrl);
      resource.src = `assets/${targetDirName}/${fileName}`;

      if (!seenUrls.has(sourceUrl)) {
        seenUrls.add(sourceUrl);
        ctx.push({
          sourceUrl,
          fileName,
          filePath: path.join(stagedDir, fileName),
        });
      }
    }
  }

  return ctx;
}

async function downloadAssets(
  ctx: AssetDownloadCtx[],
): Promise<DownloadSummary> {
  const total = ctx.length;
  console.log(`开始下载资源素材 (共 ${total} 个)...`);
  let successCount = 0;
  const failed: DownloadSummary["failed"] = [];

  for (const task of ctx) {
    try {
      const response = await fetch(task.sourceUrl, {
        signal: AbortSignal.timeout(30000),
        headers: {
          Referer: "https://www.bilibili.com/",
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36",
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText}`);
      }

      fs.writeFileSync(
        task.filePath,
        Buffer.from(await response.arrayBuffer()),
      );
      successCount++;
      process.stdout.write(`\r下载进度: (${successCount}/${total}) `);
    } catch (error: unknown) {
      process.stdout.write("\n");
      failed.push({
        url: task.sourceUrl,
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }

  process.stdout.write("\n");
  return { total, successCount, failed };
}

function dumpLayerConfig(layers: LayersV2[], dataDir: string): void {
  const outputPath = path.join(dataDir, "data.json");
  fs.writeFileSync(
    outputPath,
    JSON.stringify(
      {
        version: 2,
        layers,
      },
      null,
      2,
    ),
    "utf8",
  );
  console.log("已写入 data.json 配置文件");
}
