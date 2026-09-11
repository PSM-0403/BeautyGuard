import { NextResponse } from "next/server";
import { ensureDailyAlerts } from "@/lib/daily-alert-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const alertDate = url.searchParams.get("date") || undefined;
    const forceRefresh = url.searchParams.get("force") === "true";
    const payload = await ensureDailyAlerts({
      alertDate,
      forceRefresh,
      requestUrl: request.url,
    });

    return NextResponse.json(payload);
  } catch (error) {
    console.error("일일 경보 조회/생성 실패", error);
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "일일 경보 데이터를 불러오지 못했습니다." },
      { status: 500 },
    );
  }
}
