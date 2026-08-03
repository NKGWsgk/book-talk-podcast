#!/usr/bin/env npx tsx
/**
 * Step 3: 3人の会話台本を生成（Podcast / 音声AI向け）
 *
 * Usage: npm run script -- <book-id>
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { generateText, parseJsonBlock } from "../src/gemini.js";
import { CHARACTER_BRIEF, PODCAST_FORMAT_RULES } from "../src/characters.js";
import {
  bookIdFromArgs,
  loadBookMeta,
  loadBookText,
  readOutput,
  truncateBookText,
  writeOutput,
} from "../src/paths.js";
import type { PodcastScript, ScriptLine, TerrySummary, YotaReaction } from "../src/types.js";
import { SPEAKER_DISPLAY } from "../src/types.js";

function formatScriptMd(script: PodcastScript): string {
  const header = `# ${script.episodeTitle}

書籍: ${script.title}

凡例: 📖 = 本の中（てりー） / 🌐 = 本の外（ハイピー）

---

`;
  const body = script.lines
    .map((line) => {
      const name = SPEAKER_DISPLAY[line.speaker];
      const tag =
        line.speaker === "terry" ? " 📖"
        : line.speaker === "happy" ? " 🌐"
        : "";
      const dir = line.direction ? ` *(${line.direction})*` : "";
      return `**${name}**${tag}${dir}: ${line.text}`;
    })
    .join("\n\n");
  return header + body + "\n";
}

function formatScriptTsv(script: PodcastScript): string {
  const header = "speaker\tlabel\tsource\ttext\tdirection\n";
  const rows = script.lines
    .map((line) =>
      [
        line.speaker,
        SPEAKER_DISPLAY[line.speaker],
        line.source ?? (line.speaker === "terry" ? "book" : line.speaker === "happy" ? "general" : ""),
        line.text,
        line.direction ?? "",
      ]
        .map((c) => c.replace(/\t/g, " "))
        .join("\t")
    )
    .join("\n");
  return header + rows + "\n";
}

function normalizeLines(lines: ScriptLine[]): ScriptLine[] {
  return lines.map((line) => ({
    ...line,
    source:
      line.source ??
      (line.speaker === "terry" ? "book"
      : line.speaker === "happy" ? "general"
      : "general"),
  }));
}

async function main() {
  const bookId = bookIdFromArgs();
  const meta = await loadBookMeta(bookId);
  const summary = JSON.parse(await readOutput(bookId, "01-terry-summary.json")) as TerrySummary;
  const reactions = JSON.parse(await readOutput(bookId, "02-yota-questions.json")) as YotaReaction[];
  const bookText = truncateBookText(await loadBookText(bookId), 200_000);

  console.log(`[3/3] 台本生成: ${meta.title}`);

  const raw = await generateText({
    systemInstruction: `${CHARACTER_BRIEF}

${PODCAST_FORMAT_RULES}

あなたはPodcast台本作家です。3人のキャラを崩さず、自然な会話にしてください。`,
    userPrompt: `『${meta.title}』のPodcast台本を作ってください。

## てりーの要約
${summary.overview}

## よーたの質問・意見（これを会話の軸にする）
${reactions.map((r, i) => `${i + 1}. [${r.context}] ${r.text} (likelyInBook: ${r.likelyInBook})`).join("\n")}

## 参照用: 本のテキスト（てりーはここだけを根拠に答える）
---
${bookText.slice(0, 120_000)}
---

構成:
1. てりーが短いオープニング（本の概要を30秒程度）
2. よーた「読んでないけど聞きたい」的リアクション
3. 各質問について 2〜4ターンのやり取り（本の中→てりー、本の外→ハイピー）
4. よーたが本質的な問いで締め、ハイピーまたはてりーが一言

JSON だけ:
{
  "episodeTitle": "エピソードタイトル",
  "lines": [
    { "speaker": "terry", "source": "book", "text": "...", "direction": "落ち着いて" },
    { "speaker": "happy", "source": "general", "text": "..." }
  ]
}

speaker は "yota" | "terry" | "happy"。
terry は必ず source: "book"、happy は必ず source: "general"。
てりーが本にないと言った内容をてりーが一般論として言わないこと。
lines は 40〜80 行程度。`,
    temperature: 0.75,
  });

  const parsed = parseJsonBlock<{ episodeTitle: string; lines: ScriptLine[] }>(raw);
  const script: PodcastScript = {
    bookId,
    title: meta.title,
    episodeTitle: parsed.episodeTitle,
    lines: normalizeLines(parsed.lines),
  };

  const mdPath = await writeOutput(bookId, "03-podcast-script.md", formatScriptMd(script));
  const jsonPath = await writeOutput(bookId, "03-podcast-script.json", JSON.stringify(script, null, 2));
  const tsvPath = await writeOutput(bookId, "03-podcast-script.tsv", formatScriptTsv(script));

  console.log(`  → ${mdPath}`);
  console.log(`  → ${jsonPath}`);
  console.log(`  → ${tsvPath} (音声AIインポート用)`);
}

main().catch((err) => {
  console.error(err);
  console.error("\n※ Step 1, 2 を先に実行してください: npm run pipeline -- <book-id>");
  process.exit(1);
});
