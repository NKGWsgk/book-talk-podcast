import { loadBookMeta, loadBookText } from "../src/paths.js";
import { chaptersFromMeta, extractChapters } from "../src/chapterExtract.js";

const meta = await loadBookMeta("naval-almanack");
const text = await loadBookText("naval-almanack");
const ch = chaptersFromMeta(meta);
const slices = extractChapters(text, ch);
console.log("expected", ch.length, "got", slices.length);
for (const c of ch) {
  if (!slices.find((s) => s.chapter === c.title)) console.log("missing", c.title);
}
