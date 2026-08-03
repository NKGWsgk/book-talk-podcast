import { readFile, writeFile, mkdir, access } from "node:fs/promises";
import path from "node:path";
import type { BookMeta } from "./types.js";

const ROOT = path.resolve(import.meta.dirname, "..");

export function projectPath(...segments: string[]): string {
  return path.join(ROOT, ...segments);
}

export async function loadBookMeta(bookId: string): Promise<BookMeta> {
  const metaPath = projectPath("books", bookId, "meta.json");
  try {
    const raw = await readFile(metaPath, "utf8");
    const meta = JSON.parse(raw) as BookMeta;
    if (!meta.id) meta.id = bookId;
    return meta;
  } catch {
    return { id: bookId, title: bookId };
  }
}

export async function loadBookText(bookId: string): Promise<string> {
  const textPath = projectPath("books", bookId, "text.txt");
  await access(textPath);
  return readFile(textPath, "utf8");
}

export async function ensureOutputDir(bookId: string): Promise<string> {
  const dir = projectPath("output", bookId);
  await mkdir(dir, { recursive: true });
  return dir;
}

export async function writeOutput(
  bookId: string,
  filename: string,
  content: string
): Promise<string> {
  const dir = await ensureOutputDir(bookId);
  const filePath = path.join(dir, filename);
  await writeFile(filePath, content, "utf8");
  return filePath;
}

export async function readOutput(bookId: string, filename: string): Promise<string> {
  const filePath = projectPath("output", bookId, filename);
  return readFile(filePath, "utf8");
}

/** 長い本テキストを API 制限内に収める（ざっくり文字数ベース） */
export function truncateBookText(text: string, maxChars = 400_000): string {
  if (text.length <= maxChars) return text;
  const head = text.slice(0, Math.floor(maxChars * 0.7));
  const tail = text.slice(-Math.floor(maxChars * 0.25));
  return `${head}\n\n[... 中略 (${text.length - maxChars} 文字) ...]\n\n${tail}`;
}

export function bookIdFromArgs(defaultId = "sample"): string {
  const arg = process.argv[2]?.trim();
  return arg || defaultId;
}

/** 長文を段落境界で分割（API 1回分の目安: 30k 文字） */
export function splitBookText(text: string, maxChunkChars = 30_000): string[] {
  if (text.length <= maxChunkChars) return [text];

  const chunks: string[] = [];
  let start = 0;

  while (start < text.length) {
    let end = Math.min(start + maxChunkChars, text.length);
    if (end < text.length) {
      const slice = text.slice(start, end);
      const lastBreak = slice.lastIndexOf("\n\n");
      if (lastBreak > maxChunkChars * 0.5) end = start + lastBreak;
    }
    chunks.push(text.slice(start, end).trim());
    start = end;
  }

  return chunks.filter(Boolean);
}
