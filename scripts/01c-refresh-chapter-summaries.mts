#!/usr/bin/env npx tsx
/** 各目次の概要文を「読むと何が得られるか」形式で再生成 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { readFile } from "node:fs/promises";
import { generateText, parseJsonBlock } from "../src/gemini.js";
import { CHARACTER_BRIEF } from "../src/characters.js";
import { chaptersFromMeta, extractChapters } from "../src/chapterExtract.js";
import { CHAPTER_SUMMARY_RULES } from "../src/summaryPrompts.js";
import {
  bookIdFromArgs,
  loadBookMeta,
  loadBookText,
  projectPath,
  writeOutput,
} from "../src/paths.js";
import type { TerrySummary } from "../src/types.js";

const TERRY_SYSTEM = `${CHARACTER_BRIEF}

あなたは「てりー」として、提供された本のテキストだけを読んで要約します。
本以外の知識は使わないでください。`;

function renderMarkdown(metaTitle: string, summary: TerrySummary): string {
  return `# ${metaTitle} — てりーの要約

## 概要

${summary.overview}

## 主要テーマ

${summary.keyThemes.map((t) => `- ${t}`).join("\n")}

## 目次ごとの内容

${summary.chapterSummaries
  .map((c) => `### ${c.chapter}\n\n${c.summary}`)
  .join("\n\n")}
`;
}

async function summarizeBatch(
  metaTitle: string,
  batch: Array<{ chapter: string; text: string }>
): Promise<TerrySummary["chapterSummaries"]> {
  const sections = batch
    .map(
      (b) => `## ${b.chapter}\n---\n${b.text.slice(0, 8000)}\n---`
    )
    .join("\n\n");

  const raw = await generateText({
    systemInstruction: TERRY_SYSTEM,
    userPrompt: `書籍: ${metaTitle}

以下は複数章の本文です。各章について summary を書いてください。

${sections}

${CHAPTER_SUMMARY_RULES}

JSON だけ:
{
  "chapterSummaries": [
    { "chapter": "章タイトル（入力と同じ）", "summary": "..." }
  ]
}`,
    temperature: 0.3,
  });

  const parsed = parseJsonBlock<{ chapterSummaries: TerrySummary["chapterSummaries"] }>(raw);
  return parsed.chapterSummaries ?? [];
}

async function main() {
  const bookId = bookIdFromArgs("naval-almanack");
  const meta = await loadBookMeta(bookId);
  const text = await loadBookText(bookId);
  const chapters = chaptersFromMeta(meta);

  const existingPath = projectPath("output", bookId, "01-terry-summary.json");
  const existing = JSON.parse(await readFile(existingPath, "utf8")) as TerrySummary;

  console.log(`Refreshing chapter summaries: ${meta.title} (${chapters.length} chapters)`);

  const slices = extractChapters(text, chapters);
  console.log(`  extracted ${slices.length} chapter texts`);

  const chapterSummaries: TerrySummary["chapterSummaries"] = [];
  const BATCH = 5;

  for (let i = 0; i < slices.length; i += BATCH) {
    const batch = slices.slice(i, i + BATCH);
    console.log(`  batch ${Math.floor(i / BATCH) + 1}/${Math.ceil(slices.length / BATCH)}`);
    const part = await summarizeBatch(meta.title, batch);
    chapterSummaries.push(...part);
  }

  const summary: TerrySummary = {
    overview: existing.overview,
    keyThemes: existing.keyThemes,
    chapterSummaries,
  };

  await writeOutput(bookId, "01-terry-summary.json", JSON.stringify(summary, null, 2));
  await writeOutput(bookId, "01-terry-summary.md", renderMarkdown(meta.title, summary));

  console.log(`\n✅ ${chapterSummaries.length} chapters updated`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
