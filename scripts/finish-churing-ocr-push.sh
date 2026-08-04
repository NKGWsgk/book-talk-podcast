#!/bin/bash
set -uo pipefail
cd "$(dirname "$0")/.."

PDF='books/churing/チューリングの計算理論入門 _ チューリング･マシンからコンピュータへ 高岡 詠子.pdf'

echo "[1/3] Running Vision OCR..."
npx tsx scripts/ocr-vision-pdf.mts books/churing "$PDF"

PAGES=$(grep -c '^--- Page ' books/churing/text.txt || true)
FAILED=$(grep -c '\[OCR FAILED\]' books/churing/text.txt || true)
echo "[2/3] OCR pages marked: $PAGES, failed: $FAILED"

echo "[3/3] Commit and push..."
git add \
  books/churing/text.txt \
  books/churing/meta.json \
  scripts/ocr-vision-pdf.mts \
  docs/pdf-vision-ocr-method.md \
  package.json

git commit -m "$(cat <<'EOF'
Add OCR text for Turing computability intro (churing).

Extract scanned PDF pages via the vision OCR workflow and restore package.json so the script can run.
EOF
)" || echo "Nothing new to commit (or commit skipped)."

git -c http.postBuffer=104857600 push origin HEAD
echo "DONE. $(git log -1 --oneline)"
