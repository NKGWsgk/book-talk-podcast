import { GoogleGenAI } from "@google/genai";

const DEFAULT_MODEL = "gemini-2.5-flash";

export function modelId(): string {
  return process.env.GEMINI_TEXT_MODEL?.trim() || DEFAULT_MODEL;
}

export function getClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) throw new Error("GEMINI_API_KEY が未設定です (.env.local を作成してください)");
  return new GoogleGenAI({ apiKey });
}

async function sleep(ms: number): Promise<void> {
  await new Promise((r) => setTimeout(r, ms));
}

export async function generateText(params: {
  systemInstruction: string;
  userPrompt: string;
  temperature?: number;
  maxRetries?: number;
}): Promise<string> {
  const ai = getClient();
  const maxRetries = params.maxRetries ?? 4;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await ai.models.generateContent({
        model: modelId(),
        contents: params.userPrompt,
        config: {
          systemInstruction: params.systemInstruction,
          temperature: params.temperature ?? 0.7,
        },
      });

      const text = response.text?.trim();
      if (!text) throw new Error("Gemini から空の応答が返りました");
      return text;
    } catch (err) {
      const retryable =
        err instanceof Error &&
        (err.message.includes("503") ||
          err.message.includes("429") ||
          err.message.includes("UNAVAILABLE") ||
          err.message.includes("RESOURCE_EXHAUSTED"));
      if (!retryable || attempt === maxRetries) throw err;
      const waitMs = 3000 * 2 ** attempt;
      console.log(`  … API retry ${attempt + 1}/${maxRetries} (${waitMs}ms)`);
      await sleep(waitMs);
    }
  }

  throw new Error("Gemini 呼び出しに失敗しました");
}

/** JSON ブロックを抽出してパース（```json ... ``` 対応） */
export function parseJsonBlock<T>(raw: string): T {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fenced?.[1]?.trim() ?? raw.trim();
  return JSON.parse(body) as T;
}
