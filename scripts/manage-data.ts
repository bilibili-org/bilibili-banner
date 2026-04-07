import {
  existsSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import Ajv, { type ValidateFunction } from "ajv";
import * as TJS from "ts-json-schema-generator";
import type {
  BannerConfig,
  BannerRef,
  MultiLayerBannerConfigV1,
  MultiLayerBannerConfigV2,
  SingleBannerConfig,
} from "../src/types";

/**
 * 重新定义的 Payload 类型，用于生成更加精确的 Schema
 */
export type BannerPayloadV1 = Omit<MultiLayerBannerConfigV1, keyof BannerRef>;
export type BannerPayloadV2 = Omit<MultiLayerBannerConfigV2, keyof BannerRef>;
export type BannerPayloadSingle = Omit<SingleBannerConfig, keyof BannerRef>;

// 常量配置
const SCHEMA_DIR = "scripts";
const ASSETS_ROOT = resolve("public/assets");
const PUBLIC_DIR = resolve("public");
const TSCONFIG_PATH = resolve("tsconfig.json");
const SCHEMAS_NAMES = {
  V1: "banner-multilayer-v1-schema.json",
  V2: "banner-multilayer-v2-schema.json",
  SINGLE: "banner-single-schema.json",
};

const ajv = new Ajv({ allErrors: true, strict: false });

/**
 * 加载并编译 Schema
 */
function getValidator(fileName: string): ValidateFunction {
  const path = resolve(SCHEMA_DIR, fileName);
  if (!existsSync(path)) {
    throw new Error(
      `未找到 Schema 文件: ${fileName}。请先运行 'generate' 命令。`,
    );
  }
  const schema = JSON.parse(readFileSync(path, "utf-8"));
  return ajv.compile(schema);
}

/**
 * 提取 data.json 中引用的所有资源路径
 */
function collectAssets(data: BannerConfig): string[] {
  const assets: string[] = [];
  if (data.type === "multi-layer") {
    const ml = data.multiLayer;
    if (ml.version === 1) {
      for (const layer of ml.layers) {
        if ("src" in layer && layer.src) assets.push(layer.src);
        if ("srcs" in layer && Array.isArray(layer.srcs)) {
          assets.push(...layer.srcs.filter(Boolean));
        }
      }
    } else if (ml.version === 2) {
      for (const layer of ml.layers) {
        if (Array.isArray(layer.resources)) {
          for (const res of layer.resources) {
            if (res.src) assets.push(res.src);
          }
        }
      }
    }
  } else if (data.type === "single-image" || data.type === "single-video") {
    if (data.layer?.src) assets.push(data.layer.src);
  }
  return assets;
}

/**
 * 校验单个文件
 */
function validateFile(
  filePath: string,
  relativePath: string,
  validators: {
    v1: ValidateFunction;
    v2: ValidateFunction;
    single: ValidateFunction;
  },
): boolean {
  try {
    const data = JSON.parse(readFileSync(filePath, "utf-8")) as BannerConfig;
    const type = data.type;

    if (!type) {
      logError(relativePath, "[root] 缺少必要字段 'type'");
      return false;
    }

    let validate: ValidateFunction;
    if (type === "multi-layer") {
      const version = data.multiLayer?.version;
      if (version === 1) validate = validators.v1;
      else if (version === 2) validate = validators.v2;
      else {
        logError(relativePath, `[multiLayer.version] 不支持的版本 ${version}`);
        return false;
      }
    } else if (type === "single-image" || type === "single-video") {
      validate = validators.single;
    } else {
      logError(relativePath, `[type] 不支持的类型 ${type}`);
      return false;
    }

    const valid = validate(data);
    if (!valid) {
      console.log(`文件：${relativePath}`);
      validate.errors?.forEach((err) => {
        const field = err.instancePath || "root";
        console.log(`  ❌ 错误：[${field}] ${err.message}`);
      });
      console.log("---------------------");
      return false;
    }
    return true;
  } catch (error) {
    logError(
      relativePath,
      `处理失败 - ${error instanceof Error ? error.message : String(error)}`,
    );
    return false;
  }
}

function logError(file: string, message: string) {
  console.log(`文件：${file}`);
  console.log(`  ❌ 错误：${message}`);
  console.log("---------------------");
}

/**
 * 命令：生成 JSON Schemas
 */
async function generateSchemas() {
  console.log("🚀 [Schema] 正在生成 JSON Schemas...");
  try {
    const generator = TJS.createGenerator({
      path: fileURLToPath(import.meta.url),
      tsconfig: TSCONFIG_PATH,
      expose: "all",
      topRef: true,
      jsDoc: "extended",
      sortProps: true,
    });

    const targets = [
      { type: "BannerPayloadV1", file: SCHEMAS_NAMES.V1 },
      { type: "BannerPayloadV2", file: SCHEMAS_NAMES.V2 },
      { type: "BannerPayloadSingle", file: SCHEMAS_NAMES.SINGLE },
    ];

    for (const target of targets) {
      const schema = generator.createSchema(target.type);
      const schemaPath = resolve(SCHEMA_DIR, target.file);
      writeFileSync(schemaPath, JSON.stringify(schema, null, 2));
      console.log(`✅ 已生成: ${target.file}`);
    }
  } catch (error) {
    console.error("❌ Schema 生成失败:", error);
    process.exit(1);
  }
}

/**
 * 命令：校验 assets 目录下的所有 data.json
 */
async function validateData() {
  console.log("🔍 [Validate] 正在校验 Banner 数据...");
  if (!existsSync(ASSETS_ROOT)) {
    console.error(`❌ Assets 目录未找到: ${ASSETS_ROOT}`);
    process.exit(1);
  }

  try {
    const validators = {
      v1: getValidator(SCHEMAS_NAMES.V1),
      v2: getValidator(SCHEMAS_NAMES.V2),
      single: getValidator(SCHEMAS_NAMES.SINGLE),
    };

    const items = readdirSync(ASSETS_ROOT);
    let errorCount = 0;

    for (const item of items) {
      const itemPath = resolve(ASSETS_ROOT, item);
      if (statSync(itemPath).isDirectory()) {
        const dataPath = resolve(itemPath, "data.json");
        if (existsSync(dataPath)) {
          const result = validateFile(
            dataPath,
            `public/assets/${item}/data.json`,
            validators,
          );
          if (!result) errorCount++;
        }
      }
    }

    if (errorCount > 0) {
      console.log(`\n❌ 校验完成，发现 ${errorCount} 个文件存在错误。`);
      process.exit(1);
    } else {
      console.log("\n✨ 校验完成，所有数据均符合规范！");
    }
  } catch (error) {
    console.error("❌ 校验执行失败:", error);
    process.exit(1);
  }
}

/**
 * 命令：检查资源引用完整性
 */
async function checkAssets() {
  console.log("📦 [Assets] 正在检查资源完整性...");
  if (!existsSync(ASSETS_ROOT)) {
    console.error("❌ Assets 目录未找到:", ASSETS_ROOT);
    return;
  }

  const dirs = readdirSync(ASSETS_ROOT)
    .filter((f) => statSync(resolve(ASSETS_ROOT, f)).isDirectory())
    .sort();

  for (const dirName of dirs) {
    const dirPath = resolve(ASSETS_ROOT, dirName);
    const configPath = resolve(dirPath, "data.json");

    if (!existsSync(configPath)) continue;

    let data: BannerConfig;
    try {
      data = JSON.parse(readFileSync(configPath, "utf8"));
    } catch (_e) {
      console.error(`❌ [Error] 无法解析配置文件: ${configPath}`);
      continue;
    }

    const referencedAssets = collectAssets(data);
    const missing: string[] = [];
    const extra: string[] = [];

    // 检查缺失
    for (const src of new Set(referencedAssets)) {
      const absolutePath = resolve(PUBLIC_DIR, src);
      if (!existsSync(absolutePath)) {
        missing.push(src);
      }
    }

    // 检查冗余 (dirPath 下除了 data.json 以外的文件是否被引用)
    const allFiles = readdirSync(dirPath).filter((f) =>
      statSync(resolve(dirPath, f)).isFile(),
    );
    const referencedBasenames = new Set(
      referencedAssets.map((s) => basename(s)),
    );

    for (const file of allFiles) {
      if (file === "data.json" || file === ".DS_Store") continue;
      if (!referencedBasenames.has(file)) {
        extra.push(file);
      }
    }

    if (missing.length > 0 || extra.length > 0) {
      console.log(`\n📂 目录: ${dirName}`);
      if (missing.length > 0) {
        console.log(`  ⚠️ 缺失资源 (${missing.length}):`);
        missing.forEach((m) => {
          console.log(`    - ${m}`);
        });
      }
      if (extra.length > 0) {
        console.log(`  ℹ️ 多余文件 (${extra.length}):`);
        extra.forEach((e) => {
          console.log(`    - ${e}`);
        });
      }
      console.log("---------------------");
    }
  }
  console.log("\n✅ 资源检查完成。");
}

async function main() {
  const command = process.argv[2];

  switch (command) {
    case "generate":
      await generateSchemas();
      break;
    case "validate":
      await validateData();
      break;
    case "check":
      await checkAssets();
      break;
    default:
      console.log("\n🛠️ Banner 数据管理工具");
      console.log("用法: tsx scripts/manage-data.ts <command>");
      console.log("\n可用命令:");
      console.log("  generate    生成 JSON Schemas (基于 src/types.ts)");
      console.log("  validate    校验 public/assets 下的 data.json 数据规范");
      console.log("  check       检查资源文件的引用完整性 (缺失/多余)");
      break;
  }
}

main().catch((err) => {
  console.error("❌ 未捕获的错误:", err);
  process.exit(1);
});
