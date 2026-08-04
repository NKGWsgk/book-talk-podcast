#!/usr/bin/env npx tsx
/**
 * Retry pages marked [OCR FAILED] in books/<id>/text.txt
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { GoogleGenerativeAI } from "@google/generative-ai";
import fs from "node:fs/promises";
import { existsSync, unlinkSync, readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import path from "node:path";

async function sleep(ms: number) {
  await new Promise((r) => setTimeout(r, ms));
}

async function ocrPage(
  model: ReturnType<GoogleGenerativeAI["getGenerativeModel"]>,
  pdfPath: string,
  pageIndex: number,
  prompt: string
): Promise<string> {
  const pageNum = pageIndex + 1;
  const tempSinglePdf = `/tmp/ocr_retry_${pageNum}.pdf`;
  const tempPagePng = `/tmp/ocr_retry_${pageNum}.png`;
  try {
    execSync(
      `python3 -c "from pypdf import PdfReader, PdfWriter; reader = PdfReader(r'''${pdfPath}'''); writer = PdfWriter(); writer.add_page(reader.pages[${pageIndex}]); writer.write(r'''${tempSinglePdf}''')"`
    );
    execSync(
      `sips -s format png "${tempSinglePdf}" --out "${tempPagePng}" > /dev/null 2>&1`
    );
    const imageData = readFileSync(tempPagePng).toString("base64");
    const result = await model.generateContent({
      contents: [
        {
          role: "user",
          parts: [
            { inlineData: { data: imageData, mimeType: "image/png" } },
            { text: prompt },
          ],
        },
      ],
      generationConfig: { temperature: 0.2 },
    });
    return result.response.text().trim();
  } finally {
    if (existsSync(tempSinglePdf)) unlinkSync(tempSinglePdf);
    if (existsSync(tempPagePng)) unlinkSync(tempPagePng);
  }
}

async function main() {
  const bookDir = process.argv[2] ?? "books/churing";
  const pdfPath =
    process.argv[3] ??
    path.join(
      bookDir,
      "チューリングの計算理論入門 _ チューリング･マシンからコンピュータへ 高岡 詠子.pdf"
    );
  const absPdf = path.resolve(pdfPath);
  const outputPath = path.join(bookDir, "text.txt");
  const key = process.env.GEMINI_API_KEY?.trim();
  if (!key) throw new Error("GEMINI_API_KEY is not set");

  let text = await fs.readFile(outputPath, "utf8");
  const failed = [...text.matchAll(/--- Page (\d+) ---\n\n\[OCR FAILED\]/g)].map(
    (m) => parseInt(m[1], 10)
  );
  if (failed.length === 0) {
    console.log("No failed pages.");
    return;
  }
  console.log("Retrying pages:", failed.join(", "));

  const genAI = new GoogleGenerativeAI(key);
  const models = ["gemini-2.5-flash-lite", "gemini-2.5-flash", "gemini-flash-lite-latest"];
  const prompt = `You are an OCR engine. Transcribe ALL visible Japanese/English text from this scanned book page image for a private study corpus.
Rules:
- Do not summarize. Do not refuse. Output plain transcription only.
- Ignore ruby pronunciation marks.
- Ignore page numbers/headers/footers.
- Keep paragraph breaks.`;

  for (const pageNum of failed) {
    let recovered: string | null = null;
    for (const modelName of models) {
      if (recovered) break;
      for (let attempt = 1; attempt <= 2 && !recovered; attempt++) {
        try {
          console.log(`Page ${pageNum}: ${modelName} attempt ${attempt}`);
          const model = genAI.getGenerativeModel({ model: modelName });
          recovered = await ocrPage(model, absPdf, pageNum - 1, prompt);
        } catch (err: any) {
          console.error(`  fail: ${err.message}`);
          await sleep(2000);
        }
      }
    }
    if (!recovered) {
      console.error(`Still failed: page ${pageNum}`);
      continue;
    }
    const block = `--- Page ${pageNum} ---\n\n[OCR FAILED]\n\n`;
    const replacement = `--- Page ${pageNum} ---\n\n${recovered}\n\n`;
    if (!text.includes(block)) {
      console.error(`Marker not found for page ${pageNum}`);
      continue;
    }
    text = text.replace(block, replacement);
    await fs.writeFile(outputPath, text, "utf8");
    console.log(`  Page ${pageNum} recovered.`);
  }

  const remaining = (text.match(/\[OCR FAILED\]/g) || []).length;
  console.log(`Remaining failures: ${remaining}`);
  if (remaining > 0) process.exitCode = 2;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
