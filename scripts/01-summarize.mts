#!/usr/bin/env npx tsx
/**
 * Step 1: てりー視点 — 本の概要 + 目次（章）ごとの要約
 *
 * Usage: npm run summarize -- <book-id>
 * Example: npm run summarize -- naval-almanack
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { generateText, parseJsonBlock } from "../src/gemini.js";
import { CHARACTER_BRIEF } from "../src/characters.js";
import { CHAPTER_SUMMARY_RULES, OVERVIEW_RULES } from "../src/summaryPrompts.js";
import {
  bookIdFromArgs,
  loadBookMeta,
  loadBookText,
  splitBookText,
  writeOutput,
} from "../src/paths.js";
import type { TerrySummary } from "../src/types.js";
import { renderTerrySummaryMd } from "../src/renderSummary.js";

const TERRY_SYSTEM = `${CHARACTER_BRIEF}

あなたは「てりー」として、提供された本のテキストだけを読んで要約します。
本以外の知識は使わないでください。推論で結論を足さないでください。`;

async function summarizeChunk(params: {
  metaTitle: string;
  chunkIndex: number;
  chunkTotal: number;
  chapterHint: string;
  text: string;
}): Promise<TerrySummary["chapterSummaries"]> {
  console.log(`  chunk ${params.chunkIndex + 1}/${params.chunkTotal} (${params.text.length} chars)`);

  const raw = await generateText({
    systemInstruction: TERRY_SYSTEM,
    userPrompt: `書籍: ${params.metaTitle}
${params.chapterHint}

以下は本のテキストの一部（${params.chunkIndex + 1}/${params.chunkTotal}）です。
この部分に含まれる章・セクションだけを要約してください。

---
${params.text}
---

JSON だけ:
{
  "chapterSummaries": [
    { "chapter": "章タイトル", "summary": "..." }
  ]
}

${CHAPTER_SUMMARY_RULES}`,
    temperature: 0.3,
  });

  const parsed = parseJsonBlock<{ chapterSummaries: TerrySummary["chapterSummaries"] }>(raw);
  return parsed.chapterSummaries ?? [];
}

async function summarizeOverview(params: {
  metaTitle: string;
  chapterSummaries: TerrySummary["chapterSummaries"];
}): Promise<Pick<TerrySummary, "overview" | "keyThemes">> {
  const digest = params.chapterSummaries
    .map((c) => `- ${c.chapter}: ${c.summary}`)
    .join("\n");

  const raw = await generateText({
    systemInstruction: TERRY_SYSTEM,
    userPrompt: `書籍: ${params.metaTitle}

以下は章ごとの要約です。これだけを根拠に、overview と keyThemes を書いてください。

${digest}

${OVERVIEW_RULES}

JSON だけ:
{
  "overview": "...",
  "keyThemes": ["主要テーマ1", "主要テーマ2", "..."]
}`,
    temperature: 0.3,
  });

  return parseJsonBlock<Pick<TerrySummary, "overview" | "keyThemes">>(raw);
}

function renderMarkdown(metaTitle: string, summary: TerrySummary): string {
  return renderTerrySummaryMd(metaTitle, summary);
}

async function main() {
  const bookId = bookIdFromArgs();
  const meta = await loadBookMeta(bookId);
  const text = await loadBookText(bookId);
  const chunks = splitBookText(text);

  console.log(`[1/3] てりーが要約中: ${meta.title} (${bookId}, ${chunks.length} chunks)`);

  const chapterHint =
    meta.chapters?.length ?
      `\n目次（参考・階層付き）:\n${meta.chapters.map((c) => `${"  ".repeat(c.level)}[L${c.level}] ${c.title}`).join("\n")}`
    : "";

  const chapterSummaries: TerrySummary["chapterSummaries"] = [];
  for (let i = 0; i < chunks.length; i++) {
    const part = await summarizeChunk({
      metaTitle: meta.title,
      chunkIndex: i,
      chunkTotal: chunks.length,
      chapterHint,
      text: chunks[i]!,
    });
    chapterSummaries.push(...part);
  }

  const { overview, keyThemes } = await summarizeOverview({
    metaTitle: meta.title,
    chapterSummaries,
  });

  const summary: TerrySummary = { overview, keyThemes, chapterSummaries };

  const jsonPath = await writeOutput(bookId, "01-terry-summary.json", JSON.stringify(summary, null, 2));
  const mdPath = await writeOutput(bookId, "01-terry-summary.md", renderMarkdown(meta.title, summary));

  console.log(`  → ${mdPath}`);
  console.log(`  → ${jsonPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
