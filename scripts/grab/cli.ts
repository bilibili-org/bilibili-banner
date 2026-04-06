const DEFAULT_TARGET_URL = "https://www.bilibili.com/";

type GrabMode = "v1" | "v2";

export interface Args {
  mode: GrabMode;
  date: string;
  targetUrl: string;
  isArchive: boolean;
}

function generateDate(): string {
  const today = new Date();
  const y = today.getFullYear();
  const m = String(today.getMonth() + 1).padStart(2, "0");
  const d = String(today.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function exitWithArgError(message: string): never {
  console.error(message);
  process.exit(1);
}

function parseMode(value: string | undefined): GrabMode {
  if (value === "v1" || value === "v2") {
    return value;
  }

  return exitWithArgError(
    "错误: -m 参数必须指定为 v1 或 v2\n示例: pnpm grab -m v1\n",
  );
}

export function parseArgs(): Args {
  const args = process.argv.slice(2);
  let mode: GrabMode | null = null;
  let targetUrl = DEFAULT_TARGET_URL;
  let urlArgProvided = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if ((arg === "-m" || arg === "--mode") && args[i + 1]) {
      mode = parseMode(args[i + 1]);
      i++;
      continue;
    }

    if ((arg === "-u" || arg === "--url") && args[i + 1]) {
      targetUrl = args[i + 1];
      urlArgProvided = true;
      i++;
    }
  }

  if (!mode) {
    exitWithArgError(
      "错误: 必须提供 -m 参数以指定抓取模式\n示例: pnpm grab -m v1\n",
    );
  }

  if (urlArgProvided) {
    const archivePattern =
      /web\.archive\.org\/web\/(\d{8})\d{6}\/(?:https:\/\/)?(?:www\.)?bilibili\.com\/?/;
    const match = targetUrl.match(archivePattern);

    if (!match) {
      exitWithArgError(
        "错误: 指定了 -u 参数，但 URL 不符合 Wayback Machine 网址格式\n" +
          "预期格式: https://web.archive.org/web/{YYYYMMDDHHMMSS}/https://www.bilibili.com/\n",
      );
    }

    const archiveDate = match[1];
    const date = `${archiveDate.slice(0, 4)}-${archiveDate.slice(4, 6)}-${archiveDate.slice(6, 8)}`;
    console.log(`数据来源: Wayback Machine，日期: ${date}`);

    return {
      mode,
      date,
      targetUrl,
      isArchive: true,
    };
  } else {
    const date = generateDate();
    console.log(`数据来源: Bilibili 官网，日期: ${date}`);

    return {
      mode,
      date,
      targetUrl,
      isArchive: false,
    };
  }
}
