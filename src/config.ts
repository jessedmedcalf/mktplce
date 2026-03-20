import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { parse } from "yaml";

import { globalConfigSchema, productConfigSchema } from "./schema.js";
import type { GlobalConfig, ProductConfig } from "./types.js";

const DEFAULT_GLOBAL_CONFIG_PATH = path.resolve("config/global.yaml");
const AGENTS_DIR = path.resolve("agents");

async function parseYamlFile<T>(filePath: string): Promise<T> {
  const raw = await readFile(filePath, "utf8");
  return parse(raw) as T;
}

export async function loadGlobalConfig(
  configPath = process.env.SCOUT_GLOBAL_CONFIG ?? DEFAULT_GLOBAL_CONFIG_PATH
): Promise<GlobalConfig> {
  const parsed = await parseYamlFile<unknown>(path.resolve(configPath));
  return globalConfigSchema.parse(parsed);
}

export async function loadProductConfig(filePath: string): Promise<ProductConfig> {
  const parsed = await parseYamlFile<unknown>(path.resolve(filePath));
  return productConfigSchema.parse(parsed);
}

export async function listProductConfigs(agentId?: string): Promise<Array<{ file: string; config: ProductConfig }>> {
  const entries = await readdir(AGENTS_DIR, { withFileTypes: true });
  const yamlFiles = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".yaml"))
    .map((entry) => path.join(AGENTS_DIR, entry.name))
    .sort();

  const configs = await Promise.all(
    yamlFiles.map(async (file) => ({
      file,
      config: await loadProductConfig(file)
    }))
  );

  return configs.filter(({ config }) => {
    if (!config.enabled) {
      return false;
    }

    if (agentId) {
      return config.id === agentId;
    }

    return true;
  });
}
