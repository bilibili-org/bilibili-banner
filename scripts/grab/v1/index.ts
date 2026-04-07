import type { Browser } from "puppeteer";
import type { Args } from "../cli";
import {
  createStagedDataDir,
  dumpLayerConfig,
  prepareEmptyDir,
  publishGrabResult,
  removeDir,
} from "../workflow";
import { initBrowser, loadPage, sleep } from "./browser";
import {
  buildAssetDownloadCtx,
  buildBannerData,
  captureBannerMetrics,
  downloadAssets,
  parseLayers,
  scrapeAndUpdateLayerParams,
} from "./core";

export async function runGrabV1(args: Args): Promise<boolean> {
  const stagedDataDir = createStagedDataDir(args.date);
  const targetDirName = args.date;

  let browser: Browser | undefined;

  try {
    const browserSession = await initBrowser();
    browser = browserSession.browser;
    const { page } = browserSession;

    await loadPage(page, args.targetUrl, args.isArchive);

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

    const assetCtx = buildAssetDownloadCtx(
      layerData,
      targetDirName,
      stagedDataDir,
    );
    const captureMetrics = await captureBannerMetrics(page);
    await scrapeAndUpdateLayerParams(page, layerData);

    prepareEmptyDir(stagedDataDir);
    dumpLayerConfig(stagedDataDir, buildBannerData(layerData, captureMetrics));

    const downloadSummary = await downloadAssets(assetCtx, page);
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
    if (browser) {
      await browser.close();
    }
    removeDir(stagedDataDir);
  }
}
