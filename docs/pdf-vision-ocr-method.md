# PDF Vision OCR メソッド

画像ベース（スキャナ保存など）でテキストレイヤーがないPDFから、Gemini APIを使用してテキストを抽出する方法。

## 背景

- `pdftotext` では空になる（テキストレイヤーなし）
- Gemini File API にPDFを直接渡すと `INVALID_ARGUMENT` になることがある
- 対策として「1ページずつ画像化 → Vision OCR」が安定する

## 仕組み

1. **画像変換**: 1ページずつPNG化
   - Linux: `pdftoppm`（poppler-utils）
   - macOS: `pypdf` で1ページPDF分割 → `sips` でPNG化
2. **Vision OCR**: Gemini（例: `gemini-2.5-flash`）に画像を渡してテキスト抽出
3. **自動継続**: 出力済みの `--- Page N ---` を見て未処理ページから再開

## 必要な環境

- Node.js / `tsx`
- Python 3 + `pypdf`
- Linux: `poppler-utils`（`pdftoppm`） / macOS: `sips`
- `.env.local` に `GEMINI_API_KEY`
- `@google/generative-ai`

## スクリプト

- 汎用: `scripts/ocr-pdf-vision.mts`
- 旧・特定本向け: `scripts/ocr-ep7-vision.mts`

## 実行

```bash
npx tsx scripts/ocr-pdf-vision.mts <book-id> [pdf-path]
# 例
npx tsx scripts/ocr-pdf-vision.mts churing
```

出力先: `books/<book-id>/text.txt`

## プロンプト方針（Podcast用）

- 日本語本文を抽出
- ルビ（振り仮名）は無視
- ページ番号・ヘッダー/フッターは無視
- 段落構造はできるだけ維持
- 出力は抽出テキストのみ

## メリット

- 縦書き・日本語の読み取り精度が高い
- ルビ除外など台本向けの整形ができる
- ページ単位なので途中再開しやすい
