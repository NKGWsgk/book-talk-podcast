#!/usr/bin/env tsx
/**
 * 本番台本 (*-script.md) から ElevenLabs 用テキストを生成する。
 * 正本は常に *-script.md。この出力を手編集しない。
 *
 * Usage:
 *   npm run prepare:elevenlabs -- output/episode-foo-script.md
 *   npm run prepare:elevenlabs -- output/episode-foo-script.md --out output/custom.txt
 */

import { readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";

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

function scriptToElevenLabs(markdown: string): string {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const blocks: string[] = [];
  let current: string[] = [];

  const flush = () => {
    const text = current.join("\n").trim();
    if (text) blocks.push(text);
    current = [];
  };

  for (const line of lines) {
    if (/^#{1,6}\s/.test(line)) {
      flush();
      continue;
    }
    if (line.trim() === "") {
      flush();
      continue;
    }
    current.push(line);
  }
  flush();

  if (blocks.length === 0) {
    throw new Error("No narration text found after removing headings");
  }

  return blocks.join("\n[pause]\n\n") + "\n";
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
