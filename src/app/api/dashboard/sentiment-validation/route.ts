import { NextResponse } from "next/server";
import { computeSentimentValidation } from "@/lib/sentimentValidation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const result = await computeSentimentValidation();
    return NextResponse.json(result);
  } catch (error) {
    console.error("감성분석 모델 검증 실패", error);
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "감성분석 모델 검증에 실패했습니다." },
      { status: 500 },
    );
  }
}
