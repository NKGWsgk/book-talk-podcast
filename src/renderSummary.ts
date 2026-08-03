import type { TerrySummary } from "./types.js";
import { chapterLevelLabel } from "./toc.js";

const HEADING: Record<0 | 1 | 2 | 3, string> = {
  0: "###",
  1: "####",
  2: "#####",
  3: "######",
};

export function renderTerrySummaryMd(metaTitle: string, summary: TerrySummary): string {
  const partsBlock =
    summary.parts?.length ?
      `## 3部の俯瞰

> 目次上の大きな塊は **PART I / PART II / BONUS** の3つ（前置きのあと）。厳密には「2部＋付録」。

${summary.parts
  .map(
    (p, i) => `### 第${i + 1}部 ${p.title}

${p.summary}`
  )
  .join("\n\n")}

`
    : "";

  const chapterBlocks = summary.chapterSummaries
    .map((c) => {
      const level = c.level ?? 3;
      const tag = chapterLevelLabel(level);
      const hashes = HEADING[level];
      return `${hashes} ${c.chapter}（${tag}）

${c.summary}`;
    })
    .join("\n\n");

  return `# ${metaTitle} — てりーの要約

## 概要

${summary.overview}

## 主要テーマ

${summary.keyThemes.map((t) => `- ${t}`).join("\n")}

${partsBlock}## 目次ごとの内容

> 階層: **部** → **セクション** → **章**（前置きは本編前の導入）

${chapterBlocks}
`;
}
