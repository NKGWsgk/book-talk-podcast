#!/usr/bin/env npx tsx
import { config } from "dotenv";
config({ path: ".env.local" });

import { GoogleGenerativeAI } from "@google/generative-ai";
import fs from "node:fs/promises";
import { existsSync, unlinkSync, readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import path from "node:path";

async function main() {
  const key = process.env.GEMINI_API_KEY?.trim();
  if (!key) throw new Error("GEMINI_API_KEY is not set");

  const genAI = new GoogleGenerativeAI(key);
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

  const pdfPath =
    "/Users/nkgws/Downloads/｢自分だけの答え｣が見つかる13歳からのアート思考 末永 幸歩.pdf";
  const bookDir = "books/art-thinking";
  const outputPath = path.join(bookDir, "text.txt");

  await fs.mkdir(bookDir, { recursive: true });

  const totalPages = parseInt(
    execSync(
      `python3 -c "from pypdf import PdfReader; reader = PdfReader(r'''${pdfPath}'''); print(len(reader.pages))"`
    )
      .toString()
      .trim(),
    10
  );
  console.log(`Total pages: ${totalPages}`);

  let allText = "";
  if (existsSync(outputPath)) {
    allText = await fs.readFile(outputPath, "utf8");
    console.log("Resuming from existing file...");
  }

  for (let p = 0; p < totalPages; p++) {
    const pageNum = p + 1;
    if (allText.includes(`--- Page ${pageNum} ---`)) {
      console.log(`Skipping page ${pageNum} (already done)`);
      continue;
    }

    console.log(`Processing page ${pageNum}/${totalPages}...`);
    const tempSinglePdf = `/tmp/page_${pageNum}.pdf`;
    const tempPagePng = `/tmp/page_${pageNum}.png`;

    try {
      execSync(
        `python3 -c "from pypdf import PdfReader, PdfWriter; reader = PdfReader(r'''${pdfPath}'''); writer = PdfWriter(); writer.add_page(reader.pages[${p}]); writer.write(r'''${tempSinglePdf}''')"`
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
    } catch (err: any) {
      console.error(`Error at page ${pageNum}:`, err.message);
      await new Promise((r) => setTimeout(r, 2000));
    } finally {
      if (existsSync(tempSinglePdf)) unlinkSync(tempSinglePdf);
      if (existsSync(tempPagePng)) unlinkSync(tempPagePng);
    }
  }

  console.log(`OCR complete! Saved to ${outputPath}`);
}

main().catch(console.error);
