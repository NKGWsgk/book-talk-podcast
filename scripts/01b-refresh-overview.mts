#!/usr/bin/env npx tsx
/** 既存の章要約から overview だけ再生成 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { readFile } from "node:fs/promises";
import { generateText, parseJsonBlock } from "../src/gemini.js";
import { OVERVIEW_RULES } from "../src/summaryPrompts.js";
import { CHARACTER_BRIEF } from "../src/characters.js";
import { bookIdFromArgs, projectPath, writeOutput } from "../src/paths.js";
import { renderTerrySummaryMd } from "../src/renderSummary.js";
import type { TerrySummary } from "../src/types.js";

const TERRY_SYSTEM = `${CHARACTER_BRIEF}

あなたは「てりー」として、提供された本のテキストだけを読んで要約します。
本以外の知識は使わないでください。`;

function renderMarkdown(metaTitle: string, summary: TerrySummary): string {
  return renderTerrySummaryMd(metaTitle, summary);
}

async function main() {
  const bookId = bookIdFromArgs("naval-almanack");
  const jsonPath = projectPath("output", bookId, "01-terry-summary.json");
  const summary = JSON.parse(await readFile(jsonPath, "utf8")) as TerrySummary;

  const digest = summary.chapterSummaries.map((c) => `- ${c.chapter}: ${c.summary}`).join("\n");

  console.log(`Refreshing overview: ${bookId}`);

  const raw = await generateText({
    systemInstruction: TERRY_SYSTEM,
    userPrompt: `書籍: The Almanack of Naval Ravikant

以下は章ごとの要約です。これだけを根拠に overview を書き直してください。

${digest}

${OVERVIEW_RULES}

JSON だけ:
{ "overview": "..." }`,
    temperature: 0.3,
  });

  const { overview } = parseJsonBlock<{ overview: string }>(raw);
  summary.overview = overview;

  await writeOutput(bookId, "01-terry-summary.json", JSON.stringify(summary, null, 2));
  await writeOutput(bookId, "01-terry-summary.md", renderMarkdown("The Almanack of Naval Ravikant", summary));

  console.log("\n--- overview ---\n");
  console.log(overview);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
