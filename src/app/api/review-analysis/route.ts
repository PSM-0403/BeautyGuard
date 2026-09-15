import { NextResponse } from "next/server";
import { REVIEW_INGREDIENT_OPTIONS } from "@/lib/reviewConstants";
import { analyzeIngredientReviews, debugFetchReviewRows } from "@/lib/reviewAnalysis";
import { generateInsights } from "@/lib/generateInsights";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SYSTEM_PROMPT = [
  "너는 화장품 MD 대시보드의 Page 3 소비자 리뷰 데이터를 분석하는 전문가다.",
  "성분별 감성 분석 결과, 긍정/부정 키워드, 피부 타입별 반응 비율, 상위 제품 데이터를 기반으로 한국어 기회 인사이트를 2~5개 작성한다.",
  "각 문장은 MD가 상세페이지 메시지 개선, 타겟 피부 타입 설정, 성분 조합 기획에 바로 쓸 수 있어야 한다.",
  "없는 수치나 제품명은 만들지 않는다.",
].join(" ");

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const ingredient = url.searchParams.get("ingredient") || REVIEW_INGREDIENT_OPTIONS[0];

    if (!ingredient.trim()) {
      return NextResponse.json({ message: "성분명이 필요합니다." }, { status: 400 });
    }

    if (url.searchParams.get("debug") === "1") {
      const debugResult = await debugFetchReviewRows(ingredient);
      return NextResponse.json(debugResult);
    }

    const result = await analyzeIngredientReviews(ingredient);

    try {
      const { insights: _ruleInsights, ...dataForAI } = result;
      const aiInsights = await generateInsights(SYSTEM_PROMPT, dataForAI);
      return NextResponse.json({ ...result, insights: aiInsights });
    } catch {
      return NextResponse.json(result);
    }
  } catch (error) {
    console.error("리뷰 분석 API 실패", error);
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "리뷰 분석에 실패했습니다." },
      { status: 500 },
    );
  }
}
