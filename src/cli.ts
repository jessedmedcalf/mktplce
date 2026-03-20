import path from "node:path";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { chromium } from "playwright";

import { listProductConfigs, loadGlobalConfig, loadProductConfig } from "./config.js";
import { evaluateListing } from "./evaluator.js";
import { fetchMarketplaceListings } from "./marketplace.js";
import { writeRunArtifacts } from "./report.js";
import type { AgentRunResult } from "./types.js";

function argumentValue(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  if (index === -1) {
    return undefined;
  }

  return process.argv[index + 1];
}

async function commandListAgents(): Promise<void> {
  const agentId = argumentValue("--agent-id");
  const matrix = process.argv.includes("--matrix");
  const entries = await listProductConfigs(agentId);

  if (matrix) {
    const include = entries.map(({ file, config }) => ({
      id: config.id,
      label: config.label,
      file: path.relative(process.cwd(), file)
    }));
    console.log(JSON.stringify({ include }));
    return;
  }

  console.log(
    JSON.stringify(
      entries.map(({ file, config }) => ({
        id: config.id,
        label: config.label,
        file: path.relative(process.cwd(), file)
      })),
      null,
      2
    )
  );
}

async function runAgentFromFile(file: string): Promise<AgentRunResult> {
  const [globalConfig, productConfig] = await Promise.all([
    loadGlobalConfig(),
    loadProductConfig(file)
  ]);

  const listings = await fetchMarketplaceListings(globalConfig, productConfig);
  const scoredListings = listings
    .map((listing) => ({
      listing,
      score: evaluateListing(listing, productConfig, globalConfig)
    }))
    .sort((left, right) => right.score.score - left.score.score);

  const result: AgentRunResult = {
    agentId: productConfig.id,
    label: productConfig.label,
    query: productConfig.search.query,
    generatedAt: new Date().toISOString(),
    notes: productConfig.notes,
    listings: scoredListings
  };

  await writeRunArtifacts(result, globalConfig.reporting.outputDir);
  return result;
}

async function commandRunAgent(): Promise<void> {
  const file = argumentValue("--file");

  if (!file) {
    throw new Error("Missing required --file argument.");
  }

  const result = await runAgentFromFile(file);
  console.log(`Wrote report for ${result.agentId} to out/`);
}

async function commandRunAll(): Promise<void> {
  const entries = await listProductConfigs();

  if (entries.length === 0) {
    throw new Error("No enabled agents found in agents/.");
  }

  for (const entry of entries) {
    const result = await runAgentFromFile(entry.file);
    console.log(`Wrote report for ${result.agentId} to out/`);
  }
}

async function commandSaveAuth(): Promise<void> {
  const globalConfig = await loadGlobalConfig();
  const browser = await chromium.launch({
    headless: false
  });
  const context = await browser.newContext({
    locale: "en-AU",
    timezoneId: "Australia/Sydney"
  });
  const page = await context.newPage();
  const rl = readline.createInterface({ input, output });

  try {
    await page.goto("https://www.facebook.com/marketplace/", {
      waitUntil: "domcontentloaded",
      timeout: 45_000
    });

    await rl.question("Log into Facebook Marketplace in the opened browser, then press Enter here to save the session. ");
    await context.storageState({
      path: path.resolve(globalConfig.marketplace.storageStatePath)
    });
    console.log(`Saved session to ${globalConfig.marketplace.storageStatePath}`);
  } finally {
    rl.close();
    await context.close().catch(() => undefined);
    await browser.close().catch(() => undefined);
  }
}

async function main(): Promise<void> {
  const command = process.argv[2];

  switch (command) {
    case "list-agents":
      await commandListAgents();
      break;
    case "run-agent":
      await commandRunAgent();
      break;
    case "run-all":
      await commandRunAll();
      break;
    case "save-auth":
      await commandSaveAuth();
      break;
    default:
      throw new Error(`Unknown command: ${command ?? "(missing)"}`);
  }
}

await main();
