export interface AssetDownloadCtx {
  sourceUrl: string;
  fileName: string;
  filePath: string;
}

export interface DownloadSummary {
  total: number;
  successCount: number;
  failed: Array<{ url: string; reason: string }>;
}
