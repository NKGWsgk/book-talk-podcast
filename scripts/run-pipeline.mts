#!/usr/bin/env npx tsx
/**
 * 全ステップを順番に実行
 *
 * Usage: npm run pipeline -- <book-id>
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { spawn } from "node:child_process";
import path from "node:path";
import { bookIdFromArgs } from "../src/paths.js";

const ROOT = path.resolve(import.meta.dirname, "..");

function runStep(script: string, bookId: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn("npx", ["tsx", script, bookId], {
      cwd: ROOT,
      stdio: "inherit",
      env: process.env,
    });
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${script} failed with code ${code}`));
    });
  });
}

async function main() {
  const bookId = bookIdFromArgs();
  console.log(`\n📚 Book Talk Podcast — pipeline start: ${bookId}\n`);

  await runStep("scripts/01-summarize.mts", bookId);
  await runStep("scripts/02-yota-questions.mts", bookId);
  await runStep("scripts/03-write-script.mts", bookId);

  console.log(`\n✅ 完了: output/${bookId}/`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
