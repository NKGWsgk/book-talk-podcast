#!/usr/bin/env npx tsx
/** 目次ごとに「読むと何が得られるか」概要を統一フォーマットで再生成 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { readFile } from "node:fs/promises";
import { generateText, parseJsonBlock } from "../src/gemini.js";
import { CHARACTER_BRIEF } from "../src/characters.js";
import {
  bookIdFromArgs,
  loadBookMeta,
  loadBookText,
  projectPath,
  writeOutput,
} from "../src/paths.js";
import { renderTerrySummaryMd } from "../src/renderSummary.js";
import type { TerrySummary } from "../src/types.js";

const TERRY_SYSTEM = `${CHARACTER_BRIEF}

あなたは「てりー」として、提供された本のテキストだけを読んで要約します。
本以外の知識は使わないでください。`;

const CHAPTER_OVERVIEW_RULES = `
各章の summary ルール:
- 「この章を読むと何が得られるか？」にだけ答える
- 80〜150字・日本語・1〜2文
- 本に書いてある内容だけ。著者紹介・編纂経緯などメタ情報は入れない
- 「この章を読むと」で始めない（文体は本全体の概要と同じ）
- 箇条書き不可
- 本文がないと言わない。与えられた抜粋・参考要約だけを根拠に書く
- chapter フィールドは入力タイトルと完全一致（番号を付けない）
`.trim();

function normalizeChapterKey(name: string): string {
  return name
    .toUpperCase()
    .replace(/[''`]/g, "'")
    .replace(/\s+/g, " ")
    .replace(/[·・].*$/, "")
    .trim();
}

function compact(s: string): string {
  return s.toUpperCase().replace(/[^A-Z0-9…]/g, "");
}

function findChapterStart(fullText: string, chapter: string): number {
  const escaped = chapter.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const exactPatterns = [
    new RegExp(`(?:^|\\n)${escaped}(?:\\s*·\\s*\\d+)?\\s*\\n`, "im"),
    new RegExp(`(?:^|\\n)${escaped}\\s*\\n`, "im"),
  ];
  for (const re of exactPatterns) {
    const m = fullText.match(re);
    if (m?.index != null) return m.index;
  }

  const words = chapter
    .toUpperCase()
    .split(/[^A-Z0-9…]+/)
    .filter((w) => w.length > 2);
  if (words.length === 0) return -1;

  const lines = fullText.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const window = lines.slice(i, i + 6).join(" ").toUpperCase();
    let pos = 0;
    let matched = 0;
    for (const w of words.slice(0, Math.min(5, words.length))) {
      const idx = window.indexOf(w, pos);
      if (idx < 0) break;
      matched++;
      pos = idx + w.length;
    }
    if (matched >= Math.min(3, words.length)) {
      return fullText.indexOf(lines[i]!);
    }
  }

  const chapterC = compact(chapter).slice(0, 24);
  for (let i = 0; i < lines.length; i++) {
    const lineC = compact(lines[i]!);
    if (lineC.includes(chapterC) || chapterC.includes(lineC.slice(0, 20))) {
      return fullText.indexOf(lines[i]!);
    }
  }

  return -1;
}

function extractChapterTextSingle(fullText: string, chapter: string, nextChapter?: string): string {
  const start = findChapterStart(fullText, chapter);
  if (start < 0) return "";

  let end = fullText.length;
  if (nextChapter) {
    const nextStart = findChapterStart(fullText.slice(start + 1), nextChapter);
    if (nextStart >= 0) end = start + 1 + nextStart;
  }

  return fullText.slice(start, end).slice(0, 12_000);
}

/** meta の「PART I: WEALTH — BUILDING WEALTH」のような複合タイトルに対応 */
function extractChapterText(fullText: string, chapter: string, nextChapter?: string): string {
  const compound = chapter.split(/\s*[—–]\s*/).map((p) => p.trim()).filter(Boolean);
  if (compound.length > 1) {
    const parts = compound
      .map((part) => extractChapterTextSingle(fullText, part))
      .filter((t) => t.length > 0);
    if (parts.length > 0) return parts.join("\n\n---\n\n").slice(0, 12_000);
  }
  return extractChapterTextSingle(fullText, chapter, nextChapter);
}

function indexExisting(summaries: TerrySummary["chapterSummaries"]) {
  const map = new Map<string, string>();
  for (const c of summaries) {
    map.set(normalizeChapterKey(c.chapter), c.summary);
  }
  return map;
}

function renderMarkdown(metaTitle: string, summary: TerrySummary): string {
  return renderTerrySummaryMd(metaTitle, summary);
}

async function summarizeBatch(params: {
  bookTitle: string;
  items: Array<{ chapter: string; level: number; excerpt: string; prior?: string }>;
}): Promise<TerrySummary["chapterSummaries"]> {
  const body = params.items
    .map(
      (item, i) =>
        `## ${i + 1}. ${item.chapter} [level ${item.level}]
${item.prior ? `（参考・旧要約）\n${item.prior}\n` : ""}
（本文抜粋）
${item.excerpt || "（本文抜粋なし）"}`
    )
    .join("\n\n");

  const raw = await generateText({
    systemInstruction: TERRY_SYSTEM,
    userPrompt: `書籍: ${params.bookTitle}

以下の目次項目それぞれについて summary を書いてください。

${CHAPTER_OVERVIEW_RULES}

${body}

JSON だけ:
{
  "chapterSummaries": [
    { "chapter": "章タイトル（入力と完全一致）", "level": 3, "summary": "..." }
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
  const bookText = await loadBookText(bookId);
  const jsonPath = projectPath("output", bookId, "01-terry-summary.json");
  const existing = JSON.parse(await readFile(jsonPath, "utf8")) as TerrySummary;
  const priorMap = indexExisting(existing.chapterSummaries);

  const chapters = meta.chapters ?? [];
  console.log(`Refreshing ${chapters.length} chapter overviews: ${bookId}`);

  const BATCH = 6;
  const refreshed: TerrySummary["chapterSummaries"] = [];

  for (let i = 0; i < chapters.length; i += BATCH) {
    const slice = chapters.slice(i, i + BATCH);
    console.log(`  batch ${Math.floor(i / BATCH) + 1}/${Math.ceil(chapters.length / BATCH)}: ${slice[0]?.title} …`);

    const items = slice.map((ch, j) => {
      const next = chapters[i + j + 1]?.title;
      let excerpt = extractChapterText(bookText, ch.title, next);
      const prior = priorMap.get(normalizeChapterKey(ch.title));
      if (excerpt.length < 400 && prior) {
        excerpt = `${excerpt}\n\n（参考・旧要約）\n${prior}`.trim();
      }
      return { chapter: ch.title, level: ch.level, excerpt, prior };
    });

    const part = await summarizeBatch({ bookTitle: meta.title, items });
    for (let j = 0; j < part.length; j++) {
      part[j]!.chapter = slice[j]?.title ?? part[j]!.chapter.replace(/^\d+\.\s*/, "");
      part[j]!.level = slice[j]?.level ?? 3;
    }
    refreshed.push(...part);
  }

  const summary: TerrySummary = {
    overview: existing.overview,
    keyThemes: existing.keyThemes,
    chapterSummaries: refreshed,
  };

  await writeOutput(bookId, "01-terry-summary.json", JSON.stringify(summary, null, 2));
  await writeOutput(bookId, "01-terry-summary.md", renderMarkdown(meta.title, summary));

  console.log(`\n✅ ${refreshed.length} chapters → output/${bookId}/01-terry-summary.md`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
