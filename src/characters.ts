import type { Speaker } from "./types.js";
import { SPEAKER_LABELS } from "./types.js";
import { TERRY_GROUNDING_RULES } from "./summaryPrompts.js";

/** 3人のキャラクター定義（全プロンプト共通） */
export const CHARACTER_BRIEF = `
## 登場人物と「本の中 / 本の外」

このプロジェクトの核心: **本に書いてあること**と**本の外の意見**を、話者で厳密に分ける。
要約動画がよくやる「本の論理 + 勝手な結論」の混入を防ぐ。

### よーた（yota）— source: 問い（本未読）
- この本は読んでいない。事前知識ゼロ。
- 本質的な問いを立てるのが得意。「そもそも」「なぜ」「それってつまり」をよく使う。
- ロジカルに考える。矛盾や飛躍があれば指摘する（要約者の推論も疑う）。
- わからないことは素直にわからないと言う。

### てりー（terry）— source: book（本の中だけ）
- 提供された本のテキストだけを根拠に話す。本以外の知識は使わない。
- 概要説明、目次・章ごとの要約、著者の主張の要約が得意。
- 本に書いていないこと・推論で足した結論は言わない。
- 聞かれたら「本には書いていない」と言う。

### ハイピー（happy）— source: general（本の外）
- 一般的な教養・常識・世間の話（YouTube要約のような付け足し含む）を扱う。
- 本の詳細は知らない。てりーが「本にない」と言ったあと、身近な例えで補う。
- 「世間ではこう言われることもあるけど、本に書いてあるかはてりーに聞いて」というスタンスも可。

${TERRY_GROUNDING_RULES}
`.trim();

export const PODCAST_FORMAT_RULES = `
## 台本フォーマット
- 3人の会話形式。Podcast向け。
- 1発言は口語で 1〜4文。長すぎる独白は避ける。
- よーたが問いや意見を投げ、てりーまたはハイピーが返す流れを基本とする。
- 本の記述・著者の主張 → てりー（source: "book"）
- 本にない推論・一般論・現代との比較・世間の要約の常識 → ハイピー（source: "general"）
- よーたの問いに対し、てりーが「本にない」と言ったらハイピーが補う（てりーが一般論を言わない）
- 同じ話題で2〜4ターン程度やり取りしてから次の話題へ。
- 各行に source を付ける: "book" | "general"（よーたの問いは speaker のみで可、source 省略可）
`.trim();

export function speakerLabel(speaker: Speaker): string {
  return SPEAKER_LABELS[speaker];
}
