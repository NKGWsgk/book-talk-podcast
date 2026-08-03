import type { BookChapter, BookMeta } from "./types.js";

function normalize(s: string): string {
  return s.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function fuzzyIncludes(haystack: string, needle: string): boolean {
  return normalize(haystack).includes(normalize(needle));
}

/** meta.json の章タイトル → 本文中の検索キーワード */
const SEARCH_ALIASES: Record<string, string[]> = {
  "IMPORTANT NOTES ON THIS BOOK (DISCLAIMER)": [
    "IMPORTANT NOTES ON THIS BOOK",
    "IMPORTANT NOTES ON THIS B OOK",
  ],
  FOREWORD: ["FOREWORD"],
  "ERIC'S NOTE (ABOUT THIS BOOK)": ["ERIC'S NOTE", "ERICS NOTE"],
  "TIMELINE OF NAVAL RAVIKANT": ["TIMELINE OF NAVAL RAVIKANT", "TIMELINE OF"],
  "NOW, HERE IS NAVAL IN HIS OWN WORDS…": ["NOW, HERE IS NAVAL"],
  "PART I: WEALTH — BUILDING WEALTH": ["BUILDING WEALTH"],
  "Understand How Wealth Is Created": ["UNDERSTAND HOW WEALTH IS CREATED"],
  "Find and Build Specific Knowledge": ["FIND AND BUILD SPECIFIC KNOWLEDGE"],
  "Play Long-Term Games with Long-Term People": [
    "PLAY LONG-TERM GAMES WITH LONG-TERM PEOPLE",
  ],
  "Take on Accountability": ["TAKE ON ACCOUNTABILITY"],
  "Build or Buy Equity in a Business": ["BUILD OR BUY EQUITY IN A BUSINESS"],
  "Find a Position of Leverage": ["FIND A POSITION OF LEVERAGE"],
  "Get Paid for Your Judgment": ["GET PAID FOR YOUR JUDGMENT"],
  "Prioritize and Focus": ["PRIORITIZE AND FOCUS"],
  "Find Work That Feels Like Play": ["FIND WORK THAT FEELS LIKE PLAY"],
  "How to Get Lucky": ["HOW TO GET LUCKY"],
  "Be Patient": ["BE PATIENT"],
  "BUILDING JUDGMENT": ["BUILDING JUDGMENT"],
  "How to Think Clearly": ["HOW TO THINK CLEARLY"],
  "Shed Your Identity to See Reality": ["SHED YOUR IDENTITY TO SEE REALITY"],
  "Learn the Skills of Decision-Making": ["LEARN THE SKILLS OF DECISION-MAKING"],
  "Collect Mental Models": ["COLLECT MENTAL MODELS"],
  "Learn to Love to Read": ["LEARN TO LOVE TO READ"],
  "PART II: HAPPINESS — LEARNING HAPPINESS": ["LEARNING HAPPINESS"],
  "Happiness Is Learned": ["HAPPINESS IS LEARNED"],
  "Happiness Is a Choice": ["HAPPINESS IS A CHOICE"],
  "Happiness Requires Presence": ["HAPPINESS REQUIRES PRESENCE"],
  "Happiness Requires Peace": ["HAPPINESS REQUIRES PEACE"],
  "Every Desire Is a Chosen Unhappiness": ["EVERY DESIRE IS A CHOSEN UNHAPPINESS"],
  "Success Does Not Earn Happiness": ["SUCCESS DOES NOT EARN HAPPINESS"],
  "Envy Is the Enemy of Happiness": ["ENVY IS THE ENEMY OF HAPPINESS"],
  "Happiness Is Built by Habits": ["HAPPINESS IS BUILT BY HABITS"],
  "Find Happiness in Acceptance": ["FIND HAPPINESS IN ACCEPTANCE"],
  "SAVING YOURSELF": ["SAVING YOURSELF"],
  "Choosing to Be Yourself": ["CHOOSING TO BE YOURSELF"],
  "Choosing to Care for Yourself": ["CHOOSING TO CARE FOR YOURSELF"],
  "Meditation + Mental Strength": ["MEDITATION + MENTAL STRENGTH", "MEDITATION"],
  "Choosing to Build Yourself": ["CHOOSING TO BUILD YOURSELF"],
  "Choosing to Grow Yourself": ["CHOOSING TO GROW YOURSELF"],
  "Choosing to Free Yourself": ["CHOOSING TO FREE YOURSELF"],
  PHILOSOPHY: ["PHILOSOPHY"],
  "The Meanings of Life": ["THE MEANINGS OF LIFE"],
  "Live by Your Values": ["LIVE BY YOUR VALUES"],
  "Rational Buddhism": ["RATIONAL BUDDHISM"],
  "The Present Is All We Have": ["THE PRESENT IS ALL WE HAVE"],
  "NAVAL'S RECOMMENDED READING": [
    "NAVAL'S RECOMMENDED READING",
    "NAVALS RECOMMENDED READING",
    "RECOMMENDED READING",
  ],
};

function aliasesFor(chapter: string): string[] {
  return SEARCH_ALIASES[chapter] ?? [chapter.toUpperCase()];
}

function headerCore(line: string): string {
  return line.replace(/\s*·\s*[\d\s]+\s*$/, "").trim();
}

function isHeaderLine(line: string, alias: string): boolean {
  const core = headerCore(line);
  if (!fuzzyIncludes(core, alias)) return false;
  if (core.length > 120) return false;
  // 目次ページの行（末尾がページ番号のみ）
  if (/^\s*[A-Z][A-Z\s'…().-]+?\s+\d[\d\s]*$/.test(line) && !line.includes("·")) return false;
  return true;
}

function findChapterStart(text: string, chapter: string, afterPos: number): number {
  const lines = text.split("\n");
  let pos = 0;
  let best = -1;

  for (const alias of aliasesFor(chapter)) {
    pos = 0;
    for (const line of lines) {
      if (pos >= afterPos && isHeaderLine(line, alias)) {
        if (best < 0 || pos < best) best = pos;
        break;
      }
      pos += line.length + 1;
    }
  }

  // TIMELINE は2行に分かれることがある
  if (best < 0 && chapter === "TIMELINE OF NAVAL RAVIKANT") {
    pos = 0;
    for (let i = 0; i < lines.length - 1; i++) {
      const combined = `${lines[i]} ${lines[i + 1]}`;
      if (pos >= afterPos && fuzzyIncludes(combined, "TIMELINE OF NAVAL RAVIKANT")) {
        return pos;
      }
      pos += lines[i]!.length + 1;
    }
  }

  return best;
}

export type ChapterSlice = { chapter: string; level?: number; text: string };

/** meta.json の目次順に本文を切り出す */
export function extractChapters(text: string, chapters: BookChapter[]): ChapterSlice[] {
  const titles = chapters.map((c) => c.title);
  const levelByTitle = new Map(chapters.map((c) => [c.title, c.level]));
  const contentStart =
    text.indexOf("IMPORTANT NOTES ON THIS B OOK") >= 0 ?
      text.indexOf("IMPORTANT NOTES ON THIS B OOK")
    : 0;

  const positions: Array<{ chapter: string; start: number }> = [];
  let cursor = contentStart;

  for (const chapter of titles) {
    const start = findChapterStart(text, chapter, cursor);
    if (start < 0) {
      console.warn(`  ⚠ 章が見つかりません: ${chapter}`);
      continue;
    }
    positions.push({ chapter, start });
    cursor = start + 1;
  }

  const slices: ChapterSlice[] = [];
  for (let i = 0; i < positions.length; i++) {
    const { chapter, start } = positions[i]!;
    const end = positions[i + 1]?.start ?? text.length;
    const slice = text.slice(start, end).trim();
    slices.push({ chapter, level: levelByTitle.get(chapter), text: slice.slice(0, 12_000) });
  }

  return slices;
}

export function chaptersFromMeta(meta: BookMeta): BookChapter[] {
  if (!meta.chapters?.length) throw new Error("meta.json に chapters がありません");
  return meta.chapters;
}
