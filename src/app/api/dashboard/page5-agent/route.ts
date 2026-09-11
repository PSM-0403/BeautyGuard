import { NextResponse } from "next/server";
import { generateInsights } from "@/lib/generateInsights";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const OPENAI_API_URL = "https://api.openai.com/v1/responses";
const DEFAULT_MODEL = "gpt-4.1-mini";

const SYSTEM_PROMPT = [
  "너는 화장품 MD(상품기획자) 대시보드의 AI 전략 어드바이저다.",
  "사용자의 질문과 함께 제공되는 실제 대시보드 데이터(성분 검색 트렌드, 기능 급상승 순위, 성분 인기도, 리뷰 감성)를 근거로 MD가 바로 실행할 수 있는 전략을 한국어로 제안한다.",
  "없는 수치나 제품명은 절대 만들지 않는다. 데이터에 없는 내용은 '데이터 없음'으로 표기한다.",
  "issues는 핵심 이슈를 2~3개 단어로 짧게, directions는 구체적 실행 방향, actions는 즉시 착수할 수 있는 액션 아이템으로 작성한다.",
].join(" ");

type AgentRequest = {
  question: string;
  context: {
    functionTop5?: unknown[];
    ingredientTop5?: unknown[];
    searchTrend?: unknown;
    concernTable?: unknown[];
    marketProducts?: unknown[];
  };
};

type AgentResponse = {
  title: string;
  level: string;
  summary: string;
  evidence: string;
  strategy: string;
  targetTitle: string;
  issues: string[];
  directions: string[];
  actions: string[];
};

const AGENT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    title: { type: "string" },
    level: { type: "string" },
    summary: { type: "string" },
    evidence: { type: "string" },
    strategy: { type: "string" },
    targetTitle: { type: "string" },
    issues: { type: "array", items: { type: "string" }, minItems: 2, maxItems: 3 },
    directions: { type: "array", items: { type: "string" }, minItems: 3, maxItems: 6 },
    actions: { type: "array", items: { type: "string" }, minItems: 3, maxItems: 5 },
  },
  required: ["title", "level", "summary", "evidence", "strategy", "targetTitle", "issues", "directions", "actions"],
};

export async function POST(request: Request) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "OPENAI_API_KEY 환경변수가 없습니다." }, { status: 500 });
  }

  try {
    const body = (await request.json()) as AgentRequest;
    const { question, context } = body;

    const response = await fetch(OPENAI_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || DEFAULT_MODEL,
        input: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: JSON.stringify({ question, context }),
          },
        ],
        text: {
          format: {
            type: "json_schema",
            name: "agent_response",
            strict: true,
            schema: AGENT_SCHEMA,
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
    const result = JSON.parse(outputText) as AgentResponse;

    return NextResponse.json(result);
  } catch (error) {
    console.error("Page 5 AI Agent 실패", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "전략 생성에 실패했습니다." },
      { status: 500 },
    );
  }
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
