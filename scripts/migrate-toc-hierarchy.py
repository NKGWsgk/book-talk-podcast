#!/usr/bin/env python3
"""既存のフラット要約を3階層目次に移行し、md/json を再生成"""
import json
from pathlib import Path

ROOT = Path("/Users/nkgws/book-talk-podcast")
META = json.loads((ROOT / "books/naval-almanack/meta.json").read_text())
OLD = json.loads((ROOT / "output/naval-almanack/01-terry-summary.json").read_text())

LEVEL_LABEL = {0: "前置き", 1: "部", 2: "セクション", 3: "章"}
HEADING = {0: "###", 1: "####", 2: "#####", 3: "######"}

# 旧タイトル → 新タイトルへのエイリアス
ALIASES = {
    "PART I: WEALTH — BUILDING WEALTH": None,  # split below
    "PART II: HAPPINESS — LEARNING HAPPINESS": None,
}

NEW_SUMMARIES = {
    "PART I: WEALTH": "運に頼らず富を得るための第一部。「How to get rich without getting lucky」というテーマが掲げられ、これから富の構築に関する原則が語られることが示される。",
    "BUILDING WEALTH": "お金を稼ぐことは行為ではなく学べるスキルだと定義される。富の創造はハードワークだけではなく、何を・誰と・いつ行うかを理解することにかかっているという、セクション全体の出発点が示される。",
    "Judgment": "富を得るにはトレンドの最先端に留まり、テクノロジー・デザイン・アートで卓越することが重要だと示される。ハードワークより過小評価されている「判断力」とは何か、その定義とレバレッジ時代における価値が語られる。",
    "PART II: HAPPINESS": "人生の三大目標は富・健康・幸福だが、その重要度は追う順番とは逆だと示される。第二部では幸福についての原則が語られる。",
    "LEARNING HAPPINESS": "自分を深刻に受け取りすぎないこと。幸福は学習可能な個人的スキルであり、幸福の定義は人それぞれで探求すべきだという、幸福パートの出発点が示される。",
    "BONUS": "テクノロジーの民主化が誰もが創造者・起業家・科学者になれる時代をもたらし、未来は明るいと示される。地球外文明の存在についての短い考察も含まれる。",
    "Books": "ノンフィクションを中心とした推薦図書リストと、各書の簡潔なコメントが得られる。好奇心と興味から読むという読書観のもと、科学・歴史・哲学などで深く学ぶための具体的な書籍が示される。",
    "Other Recommendations": "書籍以外の推薦コンテンツ（ブログ、ポッドキャスト、ツイートなど）が紹介される。ナヴァルが影響を受けた情報源を辿り、さらに学びを広げる手がかりが得られる。",
    "NAVAL'S WRITING": "ナヴァル自身の執筆・発信への導線が示される。本書以外で彼の考えを追うための入口が得られる。",
    "NEXT ON NAVAL": "ナヴァルの今後の活動や関連プロジェクトへの案内が示される。",
    "APPRECIATION": "本書の制作に関わった人々への感謝が述べられる。",
    "SOURCES": "本書の引用元・情報源の一覧が示され、各発言の出典をたどる手がかりが得られる。",
    "ABOUT THE AUTHOR": "編者エリック・ジョーゲンソンのプロフィールが示される。",
}

old_by_title = {c["chapter"]: c["summary"] for c in OLD["chapterSummaries"]}

# split legacy combined entries into parts for fallback
combined_i = old_by_title.get("PART I: WEALTH — BUILDING WEALTH", "")
combined_ii = old_by_title.get("PART II: HAPPINESS — LEARNING HAPPINESS", "")

def resolve_summary(title: str, level: int) -> str:
    if title in NEW_SUMMARIES:
        return NEW_SUMMARIES[title]
    if title in old_by_title:
        return old_by_title[title]
    # fallback from combined
    if title == "PART I: WEALTH" and combined_i:
        return NEW_SUMMARIES["PART I: WEALTH"]
    if title == "BUILDING WEALTH" and combined_i:
        return NEW_SUMMARIES["BUILDING WEALTH"]
    if title == "PART II: HAPPINESS" and combined_ii:
        return NEW_SUMMARIES["PART II: HAPPINESS"]
    if title == "LEARNING HAPPINESS" and combined_ii:
        return NEW_SUMMARIES["LEARNING HAPPINESS"]
    if title == "NAVAL'S RECOMMENDED READING" and "NAVAL'S RECOMMENDED READING" in old_by_title:
        return old_by_title["NAVAL'S RECOMMENDED READING"]
    return f"（要約未作成: {title}）"

chapters = []
for ch in META["chapters"]:
    title = ch["title"]
    level = ch["level"]
    chapters.append({
        "chapter": title,
        "level": level,
        "summary": resolve_summary(title, level),
    })

out = {
    "overview": OLD["overview"],
    "keyThemes": OLD["keyThemes"],
    "chapterSummaries": chapters,
}

def render_md(data):
    lines = [
        "# The Almanack of Naval Ravikant — てりーの要約\n",
        "## 概要\n",
        data["overview"] + "\n",
        "## 主要テーマ\n",
    ]
    for t in data["keyThemes"]:
        lines.append(f"- {t}\n")
    lines.append("\n## 目次ごとの内容\n\n")
    lines.append("> 階層: **部** → **セクション** → **章**（前置きは本編前の導入）\n\n")
    for c in data["chapterSummaries"]:
        lv = c["level"]
        lines.append(f"{HEADING[lv]} {c['chapter']}（{LEVEL_LABEL[lv]}）\n\n{c['summary']}\n\n")
    return "".join(lines)

out_path = ROOT / "output/naval-almanack/01-terry-summary.json"
md_path = ROOT / "output/naval-almanack/01-terry-summary.md"
out_path.write_text(json.dumps(out, ensure_ascii=False, indent=2))
md_path.write_text(render_md(out))

missing = [c["chapter"] for c in chapters if c["summary"].startswith("（要約未作成")]
print(f"chapters: {len(chapters)}")
print(f"missing: {len(missing)}")
if missing:
    for m in missing:
        print(" -", m)
print("written:", md_path)
