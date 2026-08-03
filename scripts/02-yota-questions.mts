#!/usr/bin/env npx tsx
/**
 * Step 2: よーた視点 — 要約を聞いて質問・意見を生成
 *
 * Usage: npm run questions -- <book-id>
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { generateText, parseJsonBlock } from "../src/gemini.js";
import { CHARACTER_BRIEF } from "../src/characters.js";
import {
  bookIdFromArgs,
  loadBookMeta,
  readOutput,
  writeOutput,
} from "../src/paths.js";
import type { TerrySummary, YotaReaction } from "../src/types.js";

async function main() {
  const bookId = bookIdFromArgs();
  const meta = await loadBookMeta(bookId);
  const summaryRaw = await readOutput(bookId, "01-terry-summary.json");
  const summary = JSON.parse(summaryRaw) as TerrySummary;

  console.log(`[2/3] よーたの質問・意見を生成: ${meta.title}`);

  const summaryForPrompt = `
概要:
${summary.overview}

章ごとの要約:
${summary.chapterSummaries.map((c) => `- ${c.chapter}: ${c.summary}`).join("\n")}

主要テーマ: ${summary.keyThemes.join("、")}
`.trim();

  const raw = await generateText({
    systemInstruction: `${CHARACTER_BRIEF}

あなたは「よーた」として、てりーの要約を初めて聞いた状態です。
本は読んでいません。本質的な問いとロジカルな突っ込みを出してください。`,
    userPrompt: `『${meta.title}』について、てりーが以下の要約を話してくれました。

${summaryForPrompt}

この要約を聞いて、よーたが投げる質問・意見を 8〜12 個作ってください。
- 各項目は 1〜3文
- 「そもそも」「なぜ」「それって矛盾してない？」系を混ぜる
- likelyInBook: 答えが本の中にありそうなら true、一般常識・現代社会との比較など本の外なら false

JSON だけ:
{
  "reactions": [
    { "context": "どの章/テーマへの反応か", "text": "よーたの発言", "likelyInBook": true }
  ]
}`,
    temperature: 0.8,
  });

  const parsed = parseJsonBlock<{ reactions: YotaReaction[] }>(raw);
  const reactions = parsed.reactions;

  const md = `# ${meta.title} — よーたの質問・意見

${reactions
  .map(
    (r, i) => `## ${i + 1}. ${r.context}

> ${r.text}

（回答担当の目安: ${r.likelyInBook ? "てりー（本の中）" : "ハイピー（一般知識）"}）
`
  )
  .join("\n")}
`;

  const jsonPath = await writeOutput(bookId, "02-yota-questions.json", JSON.stringify(reactions, null, 2));
  const mdPath = await writeOutput(bookId, "02-yota-questions.md", md);

  console.log(`  → ${mdPath}`);
  console.log(`  → ${jsonPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
