/** 発言の根拠: 本の中 / 本の外 */
export type ClaimSource = "book" | "general";

export type Speaker = "yota" | "terry" | "happy";

/** 目次の階層: 0=前置き, 1=部, 2=セクション, 3=章 */
export type TocLevel = 0 | 1 | 2 | 3;

export type BookChapter = {
  title: string;
  level: TocLevel;
};

export type BookMeta = {
  id: string;
  title: string;
  author?: string;
  chapters?: BookChapter[];
};

export type ChapterSummary = {
  chapter: string;
  level: TocLevel;
  summary: string;
};

/** 部（PART I / II / BONUS）レベルの俯瞰 */
export type PartSummary = {
  id: string;
  title: string;
  summary: string;
};

export type TerrySummary = {
  overview: string;
  /** 3部構成の俯瞰（任意） */
  parts?: PartSummary[];
  chapterSummaries: ChapterSummary[];
  keyThemes: string[];
};

export type YotaReaction = {
  /** どの章・テーマへの反応か */
  context: string;
  /** よーたの質問または意見 */
  text: string;
  /** 本の中に答えがありそうか（後段で再判定もする） */
  likelyInBook: boolean;
};

export type ScriptLine = {
  speaker: Speaker;
  text: string;
  /** 本の内容か、一般論か（話者と一致させる） */
  source: ClaimSource;
  /** 音声生成用の感情・トーン指示（任意） */
  direction?: string;
};

export type PodcastScript = {
  bookId: string;
  title: string;
  episodeTitle: string;
  lines: ScriptLine[];
};

export const SPEAKER_LABELS: Record<Speaker, string> = {
  yota: "よーた",
  terry: "てりー",
  happy: "ハイピー",
};

export const SPEAKER_DISPLAY: Record<Speaker, string> = {
  yota: "よーた",
  terry: "てりー",
  happy: "ハイピー",
};
