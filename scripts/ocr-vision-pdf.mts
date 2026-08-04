#!/usr/bin/env npx tsx
/**
 * Vision OCR for scanned PDFs (see docs/pdf-vision-ocr-method.md)
 *
 * Usage:
 *   npx tsx scripts/ocr-vision-pdf.mts <book-dir> <pdf-path>
 *
 * Example:
 *   npx tsx scripts/ocr-vision-pdf.mts books/churing "books/churing/book.pdf"
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

async function main() {
  const bookDir = process.argv[2];
  const pdfPath = process.argv[3];

  if (!bookDir || !pdfPath) {
    console.error(
      'Usage: npx tsx scripts/ocr-vision-pdf.mts <book-dir> <pdf-path>'
    );
    process.exit(1);
  }

  const absPdf = path.resolve(pdfPath);
  if (!existsSync(absPdf)) {
    throw new Error(`PDF not found: ${absPdf}`);
  }

  const key = process.env.GEMINI_API_KEY?.trim();
  if (!key) throw new Error("GEMINI_API_KEY is not set");

  const genAI = new GoogleGenerativeAI(key);
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

  const outputPath = path.join(bookDir, "text.txt");
  await fs.mkdir(bookDir, { recursive: true });

  const totalPages = parseInt(
    execSync(
      `python3 -c "from pypdf import PdfReader; reader = PdfReader(r'''${absPdf}'''); print(len(reader.pages))"`
    )
      .toString()
      .trim(),
    10
  );
  console.log(`PDF: ${absPdf}`);
  console.log(`Output: ${outputPath}`);
  console.log(`Total pages: ${totalPages}`);

  let allText = "";
  if (existsSync(outputPath)) {
    allText = await fs.readFile(outputPath, "utf8");
    console.log("Resuming from existing file...");
  }

  let done = 0;
  let failed = 0;

  for (let p = 0; p < totalPages; p++) {
    const pageNum = p + 1;
    if (allText.includes(`--- Page ${pageNum} ---`)) {
      done++;
      continue;
    }

    console.log(`Processing page ${pageNum}/${totalPages}...`);
    const tempSinglePdf = `/tmp/ocr_${path.basename(bookDir)}_${pageNum}.pdf`;
    const tempPagePng = `/tmp/ocr_${path.basename(bookDir)}_${pageNum}.png`;

    let success = false;
    for (let attempt = 1; attempt <= 3 && !success; attempt++) {
      try {
        execSync(
          `python3 -c "from pypdf import PdfReader, PdfWriter; reader = PdfReader(r'''${absPdf}'''); writer = PdfWriter(); writer.add_page(reader.pages[${p}]); writer.write(r'''${tempSinglePdf}''')"`
        );
        execSync(
          `sips -s format png "${tempSinglePdf}" --out "${tempPagePng}" > /dev/null 2>&1`
        );

        const imageData = readFileSync(tempPagePng).toString("base64");
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

        const text = result.response.text().trim();
        allText += `--- Page ${pageNum} ---\n\n${text}\n\n`;
        await fs.writeFile(outputPath, allText, "utf8");
        console.log(`  Page ${pageNum} saved.`);
        success = true;
        done++;
      } catch (err: any) {
        console.error(
          `  Error at page ${pageNum} (attempt ${attempt}/3):`,
          err.message
        );
        if (attempt < 3) await sleep(3000 * attempt);
      } finally {
        if (existsSync(tempSinglePdf)) unlinkSync(tempSinglePdf);
        if (existsSync(tempPagePng)) unlinkSync(tempPagePng);
      }
    }

    if (!success) {
      failed++;
      allText += `--- Page ${pageNum} ---\n\n[OCR FAILED]\n\n`;
      await fs.writeFile(outputPath, allText, "utf8");
      console.error(`  Page ${pageNum} marked as FAILED.`);
    }

    // light pacing to reduce rate-limit risk
    await sleep(200);
  }

  console.log(`OCR complete! Saved to ${outputPath}`);
  console.log(`Done: ${done}/${totalPages}, Failed: ${failed}`);
  if (failed > 0) process.exitCode = 2;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
