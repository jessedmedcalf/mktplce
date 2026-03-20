import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import type { AgentRunResult } from "./types.js";

function money(price: number | null): string {
  return price == null ? "Unknown" : `$${price}`;
}

function renderListing(result: AgentRunResult["listings"][number]): string {
  const reasons = result.score.reasons.map((reason) => `- ${reason}`).join("\n");

  return [
    `## ${result.listing.title}`,
    "",
    `- Score: **${result.score.score}** (${result.score.classification})`,
    `- Price: **${money(result.listing.price)}**`,
    `- Link: ${result.listing.url}`,
    "",
    reasons,
    ""
  ].join("\n");
}

function renderMarkdown(result: AgentRunResult): string {
  const topHits = result.listings.filter((entry) => entry.score.classification !== "pass");

  const lines = [
    `# ${result.label}`,
    "",
    `- Generated: ${result.generatedAt}`,
    `- Query: ${result.query}`,
    `- Listings inspected: ${result.listings.length}`,
    `- Actionable matches: ${topHits.length}`
  ];

  if (result.notes) {
    lines.push(`- Notes: ${result.notes}`);
  }

  lines.push("");

  if (topHits.length === 0) {
    lines.push("No good or exceptional deals were found in this run.");
    return lines.join("\n");
  }

  return `${lines.join("\n")}\n${topHits.map(renderListing).join("\n")}`;
}

export async function writeRunArtifacts(result: AgentRunResult, outputDir: string): Promise<void> {
  const resolvedOutputDir = path.resolve(outputDir);
  await mkdir(resolvedOutputDir, { recursive: true });

  const markdown = renderMarkdown(result);
  const jsonPath = path.join(resolvedOutputDir, `${result.agentId}.json`);
  const markdownPath = path.join(resolvedOutputDir, `${result.agentId}.md`);

  await writeFile(jsonPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  await writeFile(markdownPath, `${markdown}\n`, "utf8");
}
