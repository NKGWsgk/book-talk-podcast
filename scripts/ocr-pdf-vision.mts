#!/usr/bin/env npx tsx
/**
 * Scanned PDF → page images → Gemini Vision OCR → books/<id>/text.txt
 *
 * Usage:
 *   npx tsx scripts/ocr-pdf-vision.mts <book-id> [pdf-path]
 *   npx tsx scripts/ocr-pdf-vision.mts churing
 *
 * Env:
 *   GEMINI_API_KEY (required)
 *   GEMINI_TEXT_MODEL (optional, default gemini-2.5-flash)
 *   OCR_DPI (optional, default 200)
 *
 * Resume: skips pages already present as `--- Page N ---` in text.txt
 *
 * Image conversion:
 *   - Linux: pdftoppm (poppler-utils)
 *   - macOS: pypdf single-page split + sips
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { GoogleGenerativeAI } from "@google/generative-ai";
import { execFileSync, execSync } from "node:child_process";
import {
  existsSync,
  readdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");

function usage(): never {
  console.error("Usage: npx tsx scripts/ocr-pdf-vision.mts <book-id> [pdf-path]");
  process.exit(1);
}

function findPdf(bookDir: string, explicit?: string): string {
  if (explicit) {
    const abs = path.isAbsolute(explicit)
      ? explicit
      : path.resolve(process.cwd(), explicit);
    if (!existsSync(abs)) throw new Error(`PDF not found: ${abs}`);
    return abs;
  }
  const pdfs = readdirSync(bookDir).filter((f) => f.toLowerCase().endsWith(".pdf"));
  if (pdfs.length === 0) {
    throw new Error(`No PDF in ${bookDir}. Pass an explicit pdf-path.`);
  }
  if (pdfs.length > 1) {
    console.warn(`Multiple PDFs found; using first: ${pdfs[0]}`);
  }
  return path.join(bookDir, pdfs[0]!);
}

function pageCount(pdfPath: string): number {
  const out = execFileSync(
    "python3",
    [
      "-c",
      "from pypdf import PdfReader; import sys; print(len(PdfReader(sys.argv[1]).pages))",
      pdfPath,
    ],
    { encoding: "utf8" }
  ).trim();
  const n = parseInt(out, 10);
  if (!Number.isFinite(n) || n <= 0) throw new Error(`Bad page count: ${out}`);
  return n;
}

function hasCommand(cmd: string): boolean {
  try {
    execFileSync("bash", ["-lc", `command -v ${cmd}`], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function renderPagePng(pdfPath: string, pageNum: number, outPng: string, dpi: number) {
  if (hasCommand("pdftoppm")) {
    const prefix = outPng.replace(/\.png$/i, "");
    execFileSync(
      "pdftoppm",
      ["-png", "-r", String(dpi), "-f", String(pageNum), "-l", String(pageNum), "-singlefile", pdfPath, prefix],
      { stdio: "ignore" }
    );
    if (!existsSync(outPng)) throw new Error(`pdftoppm failed for page ${pageNum}`);
    return;
  }

  if (process.platform === "darwin" && hasCommand("sips")) {
    const tempPdf = `${outPng}.page.pdf`;
    execFileSync(
      "python3",
      [
        "-c",
        `
from pypdf import PdfReader, PdfWriter
import sys
reader = PdfReader(sys.argv[1])
writer = PdfWriter()
writer.add_page(reader.pages[int(sys.argv[2])])
writer.write(sys.argv[3])
`.trim(),
        pdfPath,
        String(pageNum - 1),
        tempPdf,
      ],
      { stdio: "ignore" }
    );
    execSync(`sips -s format png ${JSON.stringify(tempPdf)} --out ${JSON.stringify(outPng)} > /dev/null 2>&1`);
    if (existsSync(tempPdf)) unlinkSync(tempPdf);
    if (!existsSync(outPng)) throw new Error(`sips failed for page ${pageNum}`);
    return;
  }

  throw new Error(
    "No PDF→PNG converter found. Install poppler-utils (pdftoppm) or use macOS sips."
  );
}

async function sleep(ms: number) {
  await new Promise((r) => setTimeout(r, ms));
}

async function ocrPage(
  model: ReturnType<GoogleGenerativeAI["getGenerativeModel"]>,
  pngPath: string
): Promise<string> {
  const imageData = readFileSync(pngPath).toString("base64");
  const result = await model.generateContent([
    {
      inlineData: {
        data: imageData,
        mimeType: "image/png",
      },
    },
    {
      text: `Extract all text from this page.
IMPORTANT:
- This is a Japanese book.
- Ignore ruby (pronunciation characters above kanji).
- Ignore page numbers and headers/footers.
- Preserve the structure of paragraphs.
- Output ONLY the text.`,
    },
  ]);
  return result.response.text().trim();
}

async function main() {
  const bookId = process.argv[2];
  const pdfArg = process.argv[3];
  if (!bookId) usage();

  const key = process.env.GEMINI_API_KEY?.trim();
  if (!key) throw new Error("GEMINI_API_KEY is not set (.env.local)");

  const modelName = process.env.GEMINI_TEXT_MODEL?.trim() || "gemini-2.5-flash";
  const dpi = parseInt(process.env.OCR_DPI || "200", 10);

  const bookDir = path.join(ROOT, "books", bookId);
  const outputPath = path.join(bookDir, "text.txt");
  await mkdir(bookDir, { recursive: true });

  const pdfPath = findPdf(bookDir, pdfArg);
  const totalPages = pageCount(pdfPath);
  console.log(`Book: ${bookId}`);
  console.log(`PDF: ${pdfPath}`);
  console.log(`Pages: ${totalPages}`);
  console.log(`Model: ${modelName}`);
  console.log(`Output: ${outputPath}`);

  const genAI = new GoogleGenerativeAI(key);
  const model = genAI.getGenerativeModel({ model: modelName });

  let allText = existsSync(outputPath) ? readFileSync(outputPath, "utf8") : "";
  if (allText) console.log("Resuming from existing text.txt...");

  const tmpDir = path.join(os.tmpdir(), `ocr-${bookId}`);
  await mkdir(tmpDir, { recursive: true });

  let done = 0;
  let errors = 0;

  for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
    if (allText.includes(`--- Page ${pageNum} ---`)) {
      done++;
      continue;
    }

    console.log(`Processing page ${pageNum}/${totalPages}...`);
    const pngPath = path.join(tmpDir, `page_${pageNum}.png`);

    try {
      renderPagePng(pdfPath, pageNum, pngPath, dpi);

      let text = "";
      for (let attempt = 0; attempt < 4; attempt++) {
        try {
          text = await ocrPage(model, pngPath);
          break;
        } catch (err: any) {
          const msg = String(err?.message ?? err);
          const retryable =
            msg.includes("429") ||
            msg.includes("503") ||
            msg.includes("RESOURCE_EXHAUSTED") ||
            msg.includes("UNAVAILABLE");
          if (!retryable || attempt === 3) throw err;
          const waitMs = 3000 * 2 ** attempt;
          console.log(`  … retry ${attempt + 1} after ${waitMs}ms`);
          await sleep(waitMs);
        }
      }

      allText += `--- Page ${pageNum} ---\n\n${text}\n\n`;
      writeFileSync(outputPath, allText, "utf8");
      done++;
      console.log(`  Page ${pageNum} saved (${text.length} chars).`);
    } catch (err: any) {
      errors++;
      console.error(`Error at page ${pageNum}:`, err?.message ?? err);
      await sleep(2000);
    } finally {
      if (existsSync(pngPath)) unlinkSync(pngPath);
    }
  }

  console.log(`OCR complete. pages_with_markers≈${done}, errors=${errors}`);
  console.log(`Saved: ${outputPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
