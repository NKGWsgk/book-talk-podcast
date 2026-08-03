# Book Talk Podcast

名著の全文テキストを題材に、3人の会話形式で Podcast / AI音声用の台本を作るツール。

## このプロジェクトの核心

**本に書いてあること**と**本の外の意見**を、話者で厳密に分ける。

要約 YouTube などがよくやる失敗:

```
本の内容: レバレッジは人・金・コード・メディアの4種類
    ↓（要約者の推論）
付け足し: 「普通の人にはメディアしかない → YouTube/Podcast がいい！」
```

Naval 本には後者は**書いていない**。てりーは付け足さない。世間のその手の言い方はハイピーの領域。

| 話者 | 根拠 | 言えること |
|------|------|------------|
| **よーた** | 本未読 | 本質的な問い・突っ込み（推論への疑い含む） |
| **てりー** | `book` | 本のテキストに書いてあることだけ |
| **ハイピー** | `general` | 一般常識・世間の話・本にない補足 |

## 登場人物

| 名前 | 役割 |
|------|------|
| **よーた** | 本は読んでない。本質的な問い・ロジカルな突っ込み |
| **てりー** | 本のテキストだけ知っている。概要・章ごとの解説 |
| **ハイピー** | 一般教養のみ。本にない背景・比喩・身近な例 |

## 制作フロー

```
books/<id>/text.txt  ──→  [1] てりーが要約
                              ↓
                         [2] よーたが質問・意見
                              ↓
                         [3] 3人の会話台本
                              ↓
                    output/<id>/03-podcast-script.*
                              ↓
                         音声AIで読み上げ → Podcast
```

### 回答の振り分け

- **本の記述・著者の主張** → てりー（`source: book`）
- **本にない推論・一般論・世間の要約の常識** → ハイピー（`source: general`）
- てりーは「本には書いていない」と言ったら、ハイピーが補う（てりーが一般論を言わない）

## セットアップ

```bash
cd /Users/nkgws/book-talk-podcast
cp .env.example .env.local
# GEMINI_API_KEY を設定

npm install
```

## 本データの置き方

`books/<book-id>/` フォルダを作る:

```
books/
  my-book/
    meta.json    # 任意: タイトル・著者・目次
    text.txt     # 必須: 本の全文
```

**meta.json の例:**

```json
{
  "id": "my-book",
  "title": "書籍タイトル",
  "author": "著者名",
  "chapters": ["第1章 …", "第2章 …"]
}
```

## 実行

```bash
# 一括（推奨）
npm run pipeline -- my-book

# 個別
npm run summarize -- my-book   # Step 1: てりー要約
npm run questions -- my-book   # Step 2: よーたの質問
npm run script -- my-book      # Step 3: 台本
```

## 出力

`output/<book-id>/` に生成される:

| ファイル | 内容 |
|----------|------|
| `01-terry-summary.md` | 概要 + 章ごとの要約 |
| `02-yota-questions.md` | よーたの質問・意見一覧 |
| `03-podcast-script.md` | 読みやすい台本 |
| `03-podcast-script.json` | 構造化データ（speaker 付き） |
| `03-podcast-script.tsv` | 音声AIインポート用 TSV |

## 音声生成の次のステップ

1. `03-podcast-script.tsv` または `.json` を ElevenLabs / VOICEVOX / OpenAI TTS 等に渡す
2. 話者ごとに声を割り当て（よーた / てりー / ハイピー）
3. 編集ソフトで結合 → Podcast エピソード

## 注意

- 長い本は自動で truncate されます（API 制限対策）
- 著作権のあるテキストの取り扱いに注意してください
- よーたの質問は AI 生成です。実際の「俺（よーた）」の声を入れたい場合は `02-yota-questions.md` を手編集してから Step 3 を再実行
