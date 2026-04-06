import { parseArgs } from "./cli";
import { runGrabV1 } from "./v1/index";
import { runGrabV2 } from "./v2/index";

async function main(): Promise<void> {
  const args = parseArgs();

  try {
    const success =
      args.mode === "v1" ? await runGrabV1(args) : await runGrabV2(args);

    if (!success) {
      process.exitCode = 1;
    }
  } catch (error: unknown) {
    console.error(
      "抓取出错:",
      error instanceof Error ? error.message : String(error),
    );
    process.exitCode = 1;
  }
}

void main();
