# 制作フロー（構成案 → 台本 → ElevenLabs）

成果物は段階ごとに1つだけ触る。同じ文言を複数ファイルへ手で同時編集しない。

---

## 段階と編集対象

| 順 | 段階 | 編集してよいファイル | 依るルール | やってはいけないこと |
|----|------|----------------------|------------|----------------------|
| 1 | 構成案 | `output/*-outline.md` | `OUTLINE_GUIDELINES.md` | 本番台本・ElevenLabsを先に書く／直す |
| 2 | 本番台本 | `output/*-script.md` | `GUIDELINES.md` | 構成案とElevenLabsを手で並行修正する |
| 3 | ElevenLabs用 | 生成のみ。手編集しない | 下記コマンド | `*-script.md` を直さずに ElevenLabs だけ直す |

任意の調査メモ（`output/*-source.md` など）は、構成案の前のメモ用。本番の正本ではない。

---

## 各段階のルール

### 1. 構成案

- 話す順番と、各所で言うべき中身だけを決める
- 文体の最終調整はしない（`OUTLINE_GUIDELINES.md`）

### 2. 本番台本化

- 構成案の第三階層を、`GUIDELINES.md` に従って本番台本にする
- **文言の正本は `*-script.md` だけ**
- 推敲・言い回し修正は、必ず `*-script.md` だけを直す
- 構成の順番を変える必要が出たら、先に構成案を直し、そのあと台本へ反映する（台本だけ都合よく組み替えない）

### 3. ElevenLabs用の出力

- 台本が固まったあと、次のコマンドで生成する

```bash
npm run prepare:elevenlabs -- output/<name>-script.md
```

- 出力先は `output/<name>-script-for-elevenlabs.txt` のみ
- 見出しを除き、段落の切れ目に `[pause]` を入れる
- **このファイルを手で直さない。** 直したい内容があれば `*-script.md` を直し、再生成する

---

## エージェント／編集時の禁止

- 同じ修正を outline / script / elevenlabs / for-elevenlabs へコピペで同時適用しない
- ElevenLabs用の別名ファイルを増やさない（正本は `*-script-for-elevenlabs.txt` 一つ）
- 「ついでに構成案も揃える」は、構成を変えたときだけ。言い回し推敲では構成案を触らない

---

## 判断フロー

```
内容・順番を変えたい？
  ├─ はい → 構成案を直す → 台本へ反映 → ElevenLabs再生成
  └─ いいえ（言い回しだけ）
        → 台本だけ直す → ElevenLabs再生成
```
