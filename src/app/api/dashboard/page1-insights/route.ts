import { NextResponse } from "next/server";
import { generateInsights } from "@/lib/generateInsights";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SYSTEM_PROMPT = [
  "너는 화장품 MD 대시보드의 Page 1 데이터를 요약하는 분석가다.",
  "제공된 실제 데이터만 근거로 한국어 인사이트를 2~5개 작성한다.",
  "각 문장은 화장품 MD가 성분 기획, 소싱, 재고, 가격 포지션, 상세페이지 메시지 중 하나를 결정하는 데 바로 쓸 수 있어야 한다.",
  "데이터가 비어 있거나 필요한 API가 없으면 그 한계를 명확히 말한다.",
  "없는 수치나 제품명은 만들지 않는다.",
].join(" ");

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const insights = await generateInsights(SYSTEM_PROMPT, body);
    return NextResponse.json({ insights });
  } catch (error) {
    console.error("Page 1 인사이트 생성 실패", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "인사이트 생성에 실패했습니다." },
      { status: 500 },
    );
  }
}
