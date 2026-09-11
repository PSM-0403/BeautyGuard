import { NextResponse } from "next/server";
import { generateInsights } from "@/lib/generateInsights";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SYSTEM_PROMPT = [
  "너는 화장품 MD 대시보드의 Page 2 검색 트렌드 데이터를 분석하는 전문가다.",
  "네이버 DataLab 성분별 검색 관심도 추이, 연령대별 피부 고민 집중도, 성분별 시장 제품 수 실제 데이터를 기반으로 한국어 인사이트를 2~5개 작성한다.",
  "각 문장은 MD가 트렌드 타이밍 판단, 타겟 연령대 설정, 콘텐츠 방향 수립에 바로 쓸 수 있어야 한다.",
  "없는 수치는 만들지 않는다. 데이터가 비어 있으면 그 한계를 명확히 말한다.",
].join(" ");

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const insights = await generateInsights(SYSTEM_PROMPT, body);
    return NextResponse.json({ insights });
  } catch (error) {
    console.error("Page 2 인사이트 생성 실패", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "인사이트 생성에 실패했습니다." },
      { status: 500 },
    );
  }
}
