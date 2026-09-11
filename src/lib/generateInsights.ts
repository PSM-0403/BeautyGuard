const OPENAI_API_URL = "https://api.openai.com/v1/responses";
const DEFAULT_MODEL = "gpt-4.1-mini";

export async function generateInsights(
  systemPrompt: string,
  data: unknown,
  { minItems = 2, maxItems = 5 }: { minItems?: number; maxItems?: number } = {},
): Promise<string[]> {
  if (process.env.ENABLE_AI_INSIGHTS !== "true") return [];

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY 환경변수가 없습니다.");

  const response = await fetch(OPENAI_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || DEFAULT_MODEL,
      input: [
        { role: "system", content: systemPrompt },
        { role: "user", content: JSON.stringify(data) },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "insights_response",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              insights: {
                type: "array",
                minItems,
                maxItems,
                items: { type: "string" },
              },
            },
            required: ["insights"],
          },
        },
      },
    }),
  });

  const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;

  if (!response.ok) {
    const err = payload as { error?: { message?: string } };
    throw new Error(err.error?.message || `OpenAI API 오류 ${response.status}`);
  }

  const outputText = extractText(payload);
  const parsed = JSON.parse(outputText) as { insights?: unknown };
  const insights = Array.isArray(parsed.insights)
    ? parsed.insights.map((item) => String(item).trim()).filter(Boolean).slice(0, maxItems)
    : [];

  if (!insights.length) throw new Error("OpenAI 응답에 insights 배열이 없습니다.");
  return insights;
}

function extractText(payload: Record<string, unknown>): string {
  if (typeof payload.output_text === "string" && payload.output_text.trim()) {
    return payload.output_text;
  }
  const output = payload.output as Array<{ content?: Array<{ text?: string }> }> | undefined;
  const text = output
    ?.flatMap((item) => item.content || [])
    .map((item) => item.text || "")
    .filter(Boolean)
    .join("\n");
  if (text) return text;
  throw new Error("OpenAI 응답 텍스트를 찾지 못했습니다.");
}
