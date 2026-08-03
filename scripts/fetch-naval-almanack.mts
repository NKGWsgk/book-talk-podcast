#!/usr/bin/env npx tsx
/**
 * 公式無料PDFから The Almanack of Naval Ravikant の全文を取得
 * https://www.navalmanack.com/
 *
 * Usage: npx tsx scripts/fetch-naval-almanack.mts
 *
 * 依存: python3 + pypdf (pip install pypdf)
 */
import { spawnSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const PDF_URL =
  "https://navalmanack.s3.amazonaws.com/Eric-Jorgenson_The-Almanack-of-Naval-Ravikant_Final.pdf";
const BOOK_ID = "naval-almanack";
const ROOT = path.resolve(import.meta.dirname, "..");
const OUT_DIR = path.join(ROOT, "books", BOOK_ID);
const OUT_TEXT = path.join(OUT_DIR, "text.txt");
const TMP_PDF = path.join(OUT_DIR, ".source.pdf");

async function main() {
  await mkdir(OUT_DIR, { recursive: true });

  console.log("Downloading official PDF...");
  const curl = spawnSync("curl", ["-sL", "-o", TMP_PDF, PDF_URL], { stdio: "inherit" });
  if (curl.status !== 0) throw new Error("PDF download failed");

  console.log("Extracting text with pypdf...");
  const py = spawnSync(
    "python3",
    [
      "-c",
      `
import re, sys
from pypdf import PdfReader
reader = PdfReader(sys.argv[1])
parts = [(p.extract_text() or "") for p in reader.pages]
raw = "\\n\\n".join(t for t in parts if t.strip())
clean = re.sub(r"(\\w)\\s*-\\s*\\n\\s*(\\w)", r"\\1\\2", raw)
clean = re.sub(r"\\n{3,}", "\\n\\n", clean)
clean = re.sub(r"[ \\t]{2,}", " ", clean)
sys.stdout.write(clean)
`.trim(),
      TMP_PDF,
    ],
    { encoding: "utf8", maxBuffer: 20 * 1024 * 1024 }
  );

  if (py.status !== 0) {
    console.error(py.stderr);
    throw new Error("PDF extraction failed — run: pip3 install pypdf");
  }

  await writeFile(OUT_TEXT, py.stdout!, "utf8");
  console.log(`Saved: ${OUT_TEXT} (${py.stdout!.length} chars)`);
  console.log(`Source: ${PDF_URL}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
