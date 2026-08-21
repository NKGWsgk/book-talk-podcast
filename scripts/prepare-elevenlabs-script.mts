#!/usr/bin/env tsx
/**
 * 本番台本 (*-script.md) から ElevenLabs 用テキストを生成する。
 * 正本は常に *-script.md。この出力を手編集しない。
 *
 * - 見出し（ブロック名）を削除
 * - ブロックとブロックの間に ーーーーーー を入れる
 *
 * Usage:
 *   npm run prepare:elevenlabs -- output/episode-foo-script.md
 *   npm run prepare:elevenlabs -- output/episode-foo-script.md --out output/custom.txt
 */

import { readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";

const BLOCK_GAP = "ーーーーーー";

function usage(): never {
  console.error(
    "Usage: npm run prepare:elevenlabs -- <path-to-*-script.md> [--out <path>]"
  );
  process.exit(1);
}

function defaultOutPath(scriptPath: string): string {
  const dir = dirname(scriptPath);
  const base = basename(scriptPath);
  if (!base.endsWith("-script.md")) {
    throw new Error(
      `Input should be named like '*-script.md' (got: ${base})`
    );
  }
  const stem = base.slice(0, -"-script.md".length);
  return join(dir, `${stem}-script-for-elevenlabs.txt`);
}

/** ## 見出し単位をブロックとし、見出し行は捨てて本文だけ残す */
function scriptToElevenLabs(markdown: string): string {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const blocks: string[] = [];
  let current: string[] = [];

  const flush = () => {
    // 先頭・末尾の空行だけ落とす。ブロック内の空行は残す
    while (current.length > 0 && current[0].trim() === "") current.shift();
    while (
      current.length > 0 &&
      current[current.length - 1].trim() === ""
    ) {
      current.pop();
    }
    if (current.length > 0) blocks.push(current.join("\n"));
    current = [];
  };

  for (const line of lines) {
    if (/^#{1,6}\s/.test(line)) {
      flush();
      continue;
    }
    current.push(line);
  }
  flush();

  if (blocks.length === 0) {
    throw new Error("No narration text found after removing headings");
  }

  return blocks.join(`\n${BLOCK_GAP}\n`) + "\n";
}

function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) usage();

  let scriptPath: string | undefined;
  let outPath: string | undefined;

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--out") {
      outPath = args[++i];
      continue;
    }
    if (a.startsWith("-")) usage();
    if (!scriptPath) scriptPath = a;
    else usage();
  }

  if (!scriptPath) usage();

  const resolvedScript = resolve(scriptPath);
  const resolvedOut = resolve(outPath ?? defaultOutPath(resolvedScript));

  const markdown = readFileSync(resolvedScript, "utf8");
  const output = scriptToElevenLabs(markdown);
  writeFileSync(resolvedOut, output, "utf8");

  console.log(`Wrote ${resolvedOut}`);
}

main();
