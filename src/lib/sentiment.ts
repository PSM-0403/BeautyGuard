const FASTAPI_BASE_URL = process.env.NEXT_PUBLIC_DATALAB_API_BASE_URL || "http://localhost:8000";
const BATCH_SIZE = 16;

export type SentimentLabel = "positive" | "neutral" | "negative";

export async function analyzeSentiment(text: string): Promise<SentimentLabel> {
  const results = await analyzeSentiments([text]);
  return results[0];
}

export async function analyzeSentiments(texts: string[]): Promise<SentimentLabel[]> {
  try {
    const labels: SentimentLabel[] = [];
    for (let i = 0; i < texts.length; i += BATCH_SIZE) {
      const batch = texts.slice(i, i + BATCH_SIZE);
      const response = await fetch(`${FASTAPI_BASE_URL}/sentiment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ texts: batch }),
      });
      if (!response.ok) throw new Error(`FastAPI /sentiment 오류: ${response.status}`);
      const data = await response.json() as { labels: string[] };
      labels.push(...data.labels.map(toSentimentLabel));
    }
    return labels.length === texts.length ? labels : texts.map(analyzeSentimentFallback);
  } catch (error) {
    console.error("감성 분석 실패, fallback 사용", error instanceof Error ? error.message : error);
    return texts.map(analyzeSentimentFallback);
  }
}

function toSentimentLabel(label: string): SentimentLabel {
  if (label === "negative") return "negative";
  if (label === "positive") return "positive";
  return "neutral";
}

function analyzeSentimentFallback(text: string): SentimentLabel {
  const normalized = text.toLowerCase();
  const positiveWords = ["좋", "촉촉", "진정", "흡수", "산뜻", "매끈", "광채", "재구매", "만족", "편안"];
  const negativeWords = ["건조", "자극", "따가", "트러블", "끈적", "밀림", "무거", "답답", "붉", "가려"];
  const positive = positiveWords.filter((word) => normalized.includes(word)).length;
  const negative = negativeWords.filter((word) => normalized.includes(word)).length;
  if (positive > negative) return "positive";
  if (negative > positive) return "negative";
  return "neutral";
}
