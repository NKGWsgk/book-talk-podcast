#!/usr/bin/env npx tsx
/**
 * Retry specific missing pages for a book OCR text.txt
 * Usage: npx tsx scripts/ocr-retry-pages.mts <book-id> <page> [page...]
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { GoogleGenerativeAI } from "@google/generative-ai";
import { execFileSync } from "node:child_process";
import {
  existsSync,
  readdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");

const PROMPTS = [
  `You are an OCR engine. Transcribe the visible characters from this scanned page image.
Rules:
- Japanese book page
- Ignore ruby/furigana
- Ignore headers/footers/page numbers
- Keep paragraph breaks
- Do not summarize
- Output plain transcribed text only`,
  `画像内の文字をそのまま書き起こしてください。要約禁止。ルビ・ノンブル無視。本文のみ。`,
];

const MODELS = ["gemini-2.5-flash", "gemini-2.0-flash"];

async function ocrPng(
  genAI: GoogleGenerativeAI,
  modelName: string,
  png: string,
  prompt: string
): Promise<string> {
  const model = genAI.getGenerativeModel({
    model: modelName,
    generationConfig: { temperature: 0.1 },
  });
  const b64 = readFileSync(png).toString("base64");
  const r = await model.generateContent([
    { inlineData: { data: b64, mimeType: "image/png" } },
    { text: prompt },
  ]);
  return r.response.text().trim();
}

function pngSize(png: string): { w: number; h: number } {
  const buf = readFileSync(png);
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}

function insertPage(allText: string, pageNum: number, body: string): string {
  const block = `--- Page ${pageNum} ---\n\n${body}\n\n`;
  if (allText.includes(`--- Page ${pageNum} ---`)) return allText;

  const nextMarker = `--- Page ${pageNum + 1} ---`;
  if (allText.includes(nextMarker)) {
    return allText.replace(nextMarker, `${block}${nextMarker}`);
  }

  const prevMarker = `--- Page ${pageNum - 1} ---`;
  const prevIdx = allText.indexOf(prevMarker);
  if (prevIdx >= 0) {
    const afterPrev = allText.indexOf("--- Page ", prevIdx + prevMarker.length);
    if (afterPrev < 0) return allText + block;
    return allText.slice(0, afterPrev) + block + allText.slice(afterPrev);
  }

  return allText + block;
}

async function tryPage(
  genAI: GoogleGenerativeAI,
  pdf: string,
  pageNum: number
): Promise<string> {
  const png = `/tmp/ocr-retry-${pageNum}.png`;
  const halfA = `/tmp/ocr-retry-${pageNum}a.png`;
  const halfB = `/tmp/ocr-retry-${pageNum}b.png`;
  const cleanup = [png, halfA, halfB];

  execFileSync("pdftoppm", [
    "-png",
    "-r",
    "200",
    "-f",
    String(pageNum),
    "-l",
    String(pageNum),
    "-singlefile",
    pdf,
    png.replace(/\.png$/, ""),
  ]);

  try {
    for (const modelName of MODELS) {
      for (const prompt of PROMPTS) {
        try {
          console.log(`try page ${pageNum} model=${modelName}`);
          const text = await ocrPng(genAI, modelName, png, prompt);
          if (text) {
            console.log(`OK page ${pageNum} full (${text.length} chars)`);
            return text;
          }
        } catch (e: any) {
          console.log(`fail full: ${String(e?.message ?? e).slice(0, 140)}`);
        }
      }
    }

    const { w, h } = pngSize(png);
    const halfH = Math.floor(h / 2);
    const crops: Array<[string, number, number, string]> = [
      ["top", 0, halfH + 40, halfA],
      ["bot", Math.max(0, halfH - 40), h - Math.max(0, halfH - 40), halfB],
    ];

    for (const [label, y, H, out] of crops) {
      try {
        execFileSync("pdftoppm", [
          "-png",
          "-r",
          "200",
          "-f",
          String(pageNum),
          "-l",
          String(pageNum),
          "-x",
          "0",
          "-y",
          String(y),
          "-W",
          String(w),
          "-H",
          String(H),
          "-singlefile",
          pdf,
          out.replace(/\.png$/, ""),
        ]);
        console.log(`cropped ${label} -> ${out}`);
      } catch (e: any) {
        console.log(`crop ${label} failed: ${String(e?.message ?? e).slice(0, 100)}`);
      }
    }

    const parts: string[] = [];
    for (const part of [halfA, halfB]) {
      if (!existsSync(part)) continue;
      let got = "";
      for (const modelName of MODELS) {
        try {
          got = await ocrPng(genAI, modelName, part, PROMPTS[0]!);
          console.log(`OK part ${path.basename(part)} (${got.length})`);
          break;
        } catch (e: any) {
          console.log(
            `fail part ${path.basename(part)}: ${String(e?.message ?? e).slice(0, 100)}`
          );
        }
      }
      if (got) parts.push(got);
    }

    if (parts.length) return parts.join("\n\n");
    throw new Error(`Could not OCR page ${pageNum}`);
  } finally {
    for (const p of cleanup) if (existsSync(p)) unlinkSync(p);
  }
}

async function main() {
  const bookId = process.argv[2];
  const pages = process.argv.slice(3).map((x) => parseInt(x, 10)).filter((n) => n > 0);
  if (!bookId || pages.length === 0) {
    console.error("Usage: npx tsx scripts/ocr-retry-pages.mts <book-id> <page> [page...]");
    process.exit(1);
  }

  const key = process.env.GEMINI_API_KEY?.trim();
  if (!key) throw new Error("GEMINI_API_KEY is not set");

  const bookDir = path.join(ROOT, "books", bookId);
  const pdfName = readdirSync(bookDir).find((f) => f.toLowerCase().endsWith(".pdf"));
  if (!pdfName) throw new Error(`No PDF in ${bookDir}`);
  const pdf = path.join(bookDir, pdfName);
  const outputPath = path.join(bookDir, "text.txt");
  if (!existsSync(outputPath)) throw new Error(`Missing ${outputPath}`);

  const genAI = new GoogleGenerativeAI(key);
  let all = readFileSync(outputPath, "utf8");

  for (const pageNum of pages) {
    if (all.includes(`--- Page ${pageNum} ---`)) {
      console.log(`page ${pageNum} already present`);
      continue;
    }
    const text = await tryPage(genAI, pdf, pageNum);
    all = insertPage(all, pageNum, text);
    writeFileSync(outputPath, all, "utf8");
    console.log(`inserted page ${pageNum}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
