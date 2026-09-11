import { NextResponse } from "next/server";
import {
  AGE_GROUPS,
  ANCHOR_GROUP,
  CONCERN_SIGNAL_GROUPS,
  FUNCTION_SIGNAL_GROUPS,
  PAGE2_MAIN_INGREDIENT_GROUPS,
  buildIngredientKeywordGroups,
  type NaverDatalabKeywordGroup,
} from "@/lib/naver-datalab-groups";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type DatalabPoint = {
  period?: string;
  ratio?: number;
};

type DatalabResult = {
  title?: string;
  data?: DatalabPoint[];
};

type DatalabResponse = {
  results?: DatalabResult[];
};

type WeeklyInterestRow = {
  key: string;
  label: string;
  currentWeekIndex: number;
  previousWeekIndex: number;
  growth: number;
  searchIndex: number;
};

type DatalabTimeUnit = "date" | "week" | "month";

const NAVER_DATALAB_URL = "https://openapi.naver.com/v1/datalab/search";
const KEYWORD_GROUPS_PER_REQUEST = 4;
const KEYWORDS_PER_GROUP = Number(process.env.NAVER_DATALAB_KEYWORDS_PER_GROUP || 8);

export async function GET(request: Request) {
  try {
    const clientId = process.env.NAVER_CLIENT_ID;
    const clientSecret = process.env.NAVER_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      return NextResponse.json(
        { message: "NAVER_CLIENT_ID 또는 NAVER_CLIENT_SECRET 서버 환경변수가 필요합니다." },
        { status: 500 },
      );
    }

    const url = new URL(request.url);
    const scope = url.searchParams.get("scope") || "page1";

    if (scope === "page2") {
      const periodKey = url.searchParams.get("period") || "snapshot";
      const ingredientSet = url.searchParams.get("ingredientSet") || "main";
      const requestedIngredients = splitIngredientLabels(url.searchParams.get("ingredients") || "");
      const trendGroups = resolvePage2TrendGroups(ingredientSet, requestedIngredients);
      const { startDate, endDate, label, timeUnit } = getPeriodRange(periodKey);
      const [searchTrend, concernPayload] = await Promise.all([
        fetchTrendSeries(trendGroups, startDate, endDate, clientId, clientSecret, timeUnit),
        fetchConcernHeatmap(startDate, endDate, clientId, clientSecret, timeUnit),
      ]);

      const leadSeries = searchTrend.series[0];
      const leadValues = leadSeries?.values || [];
      const startValue = leadValues[0] || 0;
      const endValue = leadValues.at(-1) || 0;
      const growthRate = startValue > 0 ? ((endValue - startValue) / startValue) * 100 : 0;

      return NextResponse.json({
        meta: {
          source: "naver_datalab",
          dataRange: `${startDate} ~ ${endDate}`,
          lastUpdated: endDate,
          comparisonLabel: "기간 내 검색 관심도",
          timeUnit,
        },
        page2: {
          periodLabel: label,
          selectedIngredient: leadSeries?.ingredient || trendGroups[0]?.label || "",
          selectedSummary: {
            growthRate: round(growthRate, 1),
            startIndex: round(startValue, 1),
            endIndex: round(endValue, 1),
            periodKey,
            ingredientSet,
          },
          searchTrend,
          concernMetrics: concernPayload.concernMetrics,
          concernTable: concernPayload.concernTable,
          insights: buildPage2Insights(searchTrend, concernPayload.concernTable),
        },
      });
    }

    const page1Period = (url.searchParams.get("period") || "month") as "week" | "month";
    const { startDate, endDate, splitDate, comparisonLabel } = getWeeklyRange(page1Period);
    const [functionRows, ingredientRows] = await Promise.all([
      fetchWeeklyInterestRows(FUNCTION_SIGNAL_GROUPS, startDate, endDate, clientId, clientSecret, splitDate),
      fetchWeeklyInterestRows(buildIngredientKeywordGroups(), startDate, endDate, clientId, clientSecret, splitDate),
    ]);

    return NextResponse.json({
      meta: {
        source: "naver_datalab",
        dataRange: `${startDate} ~ ${endDate}`,
        lastUpdated: endDate,
        comparisonLabel,
      },
      page1: {
        functionRisers: functionRows
          .slice()
          .sort((a, b) => (b.currentWeekIndex - b.previousWeekIndex) - (a.currentWeekIndex - a.previousWeekIndex))
          .slice(0, 5),
        functionDemand: functionRows,
        ingredientPopularity: ingredientRows
          .slice()
          .sort((a, b) => b.currentWeekIndex - a.currentWeekIndex)
          .slice(0, 5),
        ingredientDemand: ingredientRows,
      },
    });
  } catch (error) {
    console.error("Naver DataLab 검색 관심도 조회 실패", error);
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "네이버 데이터랩 검색 관심도 조회에 실패했습니다." },
      { status: 500 },
    );
  }
}

async function fetchWeeklyInterestRows(
  groups: NaverDatalabKeywordGroup[],
  startDate: string,
  endDate: string,
  clientId: string,
  clientSecret: string,
  splitDate?: string,
  timeUnit: DatalabTimeUnit = "date",
) {
  const rows: WeeklyInterestRow[] = [];

  for (const chunk of chunkGroups(groups, KEYWORD_GROUPS_PER_REQUEST)) {
    const response = await requestNaverDatalab([...chunk, ANCHOR_GROUP], startDate, endDate, clientId, clientSecret);
    rows.push(...rowsFromDatalabResults(response, chunk, splitDate));
  }

  return normalizeSearchIndexes(rows);
}

async function fetchTrendSeries(
  groups: NaverDatalabKeywordGroup[],
  startDate: string,
  endDate: string,
  clientId: string,
  clientSecret: string,
  timeUnit: DatalabTimeUnit = "date",
) {
  const rawByLabel = new Map<string, Map<string, number>>();
  const orderedDates = new Set<string>();

  for (const chunk of chunkGroups(groups, KEYWORD_GROUPS_PER_REQUEST)) {
    const response = await requestNaverDatalab([...chunk, ANCHOR_GROUP], startDate, endDate, clientId, clientSecret, undefined, timeUnit);
    const normalized = normalizedSeriesFromDatalabResults(response, chunk);

    normalized.forEach((points, label) => {
      const current = rawByLabel.get(label) || new Map<string, number>();
      points.forEach((value, date) => {
        current.set(date, value);
        orderedDates.add(date);
      });
      rawByLabel.set(label, current);
    });
  }

  const dates = Array.from(orderedDates).sort();
  const maxValue = Math.max(
    1,
    ...Array.from(rawByLabel.values()).flatMap((points) => dates.map((date) => points.get(date) || 0)),
  );

  return {
    dates,
    series: groups.map((group) => {
      const points = rawByLabel.get(group.label) || new Map<string, number>();
      return {
        ingredient: group.label,
        values: dates.map((date) => round(((points.get(date) || 0) / maxValue) * 100, 1)),
      };
    }),
  };
}

async function fetchConcernHeatmap(
  startDate: string,
  endDate: string,
  clientId: string,
  clientSecret: string,
  timeUnit: DatalabTimeUnit = "date",
) {
  const rawRows = AGE_GROUPS.map((ageGroup) => ({
    age: ageGroup.label,
    values: new Map<string, number>(),
  }));

  for (const row of rawRows) {
    const ageGroup = AGE_GROUPS.find((item) => item.label === row.age);
    if (!ageGroup) continue;

    for (const chunk of chunkGroups(CONCERN_SIGNAL_GROUPS, KEYWORD_GROUPS_PER_REQUEST)) {
      const response = await requestNaverDatalab([...chunk, ANCHOR_GROUP], startDate, endDate, clientId, clientSecret, ageGroup.ages, timeUnit);
      const normalized = normalizedSeriesFromDatalabResults(response, chunk);
      normalized.forEach((points, label) => {
        row.values.set(label, average(Array.from(points.values())));
      });
    }
  }

  const maxValue = Math.max(1, ...rawRows.flatMap((row) => Array.from(row.values.values())));

  return {
    concernMetrics: CONCERN_SIGNAL_GROUPS.map((group) => ({
      key: group.key,
      label: group.label,
    })),
    concernTable: rawRows.map((row) => {
      const tableRow: Record<string, string | number> = { age: row.age };
      CONCERN_SIGNAL_GROUPS.forEach((group) => {
        tableRow[group.key] = round(((row.values.get(group.label) || 0) / maxValue) * 100, 1);
      });
      return tableRow;
    }),
  };
}

async function requestNaverDatalab(
  groups: NaverDatalabKeywordGroup[],
  startDate: string,
  endDate: string,
  clientId: string,
  clientSecret: string,
  ages?: string[],
  timeUnit: DatalabTimeUnit = "date",
) {
  const response = await fetch(NAVER_DATALAB_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Naver-Client-Id": clientId,
      "X-Naver-Client-Secret": clientSecret,
    },
    body: JSON.stringify({
      startDate,
      endDate,
      timeUnit,
      ...(ages?.length ? { ages } : {}),
      keywordGroups: groups.map((group) => ({
        groupName: group.label,
        keywords: Array.from(new Set(group.keywords.map((keyword) => keyword.trim()).filter(Boolean))).slice(0, KEYWORDS_PER_GROUP),
      })),
    }),
  });
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message = typeof payload?.errorMessage === "string"
      ? payload.errorMessage
      : typeof payload?.message === "string"
        ? payload.message
        : "네이버 데이터랩 API 요청에 실패했습니다.";
    throw new Error(message);
  }

  return payload as DatalabResponse;
}

function rowsFromDatalabResults(response: DatalabResponse, sourceGroups: NaverDatalabKeywordGroup[], splitDate?: string) {
  const results = response.results || [];
  const byTitle = new Map(results.map((item) => [item.title || "", item]));
  const anchor = byTitle.get(ANCHOR_GROUP.label);
  const anchorByDate = new Map(
    (anchor?.data || []).map((point) => [point.period || "", Math.max(Number(point.ratio || 0), 0.0001)]),
  );

  return sourceGroups.flatMap((group) => {
    const result = byTitle.get(group.label);
    const points = result?.data || [];

    const previousPoints: number[] = [];
    const currentPoints: number[] = [];

    points.forEach((point) => {
      const ratio = Number(point.ratio || 0);
      const anchorValue = anchorByDate.get(point.period || "") || 1;
      const value = ratio / anchorValue;
      const date = point.period || "";

      if (splitDate) {
        if (date < splitDate) previousPoints.push(value);
        else currentPoints.push(value);
      } else {
        currentPoints.push(value);
      }
    });

    const allValues = [...previousPoints, ...currentPoints];
    if (allValues.length < 2) return [];

    const previousWeekIndex = previousPoints.length ? average(previousPoints) : average(allValues.slice(0, Math.floor(allValues.length / 2)));
    const currentWeekIndex = currentPoints.length ? average(currentPoints) : average(allValues.slice(Math.floor(allValues.length / 2)));

    return [{
      key: group.key,
      label: group.label,
      currentWeekIndex,
      previousWeekIndex,
      growth: calculateGrowth(currentWeekIndex, previousWeekIndex),
      searchIndex: currentWeekIndex,
    }];
  });
}

function normalizedSeriesFromDatalabResults(response: DatalabResponse, sourceGroups: NaverDatalabKeywordGroup[]) {
  const results = response.results || [];
  const byTitle = new Map(results.map((item) => [item.title || "", item]));
  const anchor = byTitle.get(ANCHOR_GROUP.label);
  const anchorByDate = new Map(
    (anchor?.data || []).map((point) => [point.period || "", Math.max(Number(point.ratio || 0), 0.0001)]),
  );
  const output = new Map<string, Map<string, number>>();

  sourceGroups.forEach((group) => {
    const points = new Map<string, number>();
    const result = byTitle.get(group.label);
    (result?.data || []).forEach((point) => {
      const date = point.period || "";
      if (!date) return;
      const anchorValue = anchorByDate.get(date) || 1;
      points.set(date, Number(point.ratio || 0) / anchorValue);
    });
    output.set(group.label, points);
  });

  return output;
}

function normalizeSearchIndexes(rows: WeeklyInterestRow[]) {
  const maxCurrent = Math.max(1, ...rows.map((row) => row.currentWeekIndex));

  return rows.map((row) => {
    const normalizedCurrent = (row.currentWeekIndex / maxCurrent) * 100;
    const normalizedPrevious = (row.previousWeekIndex / maxCurrent) * 100;
    return {
      ...row,
      currentWeekIndex: round(normalizedCurrent, 1),
      previousWeekIndex: round(normalizedPrevious, 1),
      growth: round(row.growth, 1),
      searchIndex: round(normalizedCurrent, 1),
    };
  });
}

function getWeeklyRange(period: "week" | "month" = "month") {
  if (process.env.DASHBOARD_START_DATE && process.env.DASHBOARD_END_DATE) {
    return {
      startDate: process.env.DASHBOARD_START_DATE,
      endDate: process.env.DASHBOARD_END_DATE,
      splitDate: undefined as string | undefined,
      comparisonLabel: period === "month" ? "전월 대비 증감률" : "전주 대비 증감률",
    };
  }

  const today = new Date();
  const endDate = toDateString(today);
  let startDate: string;
  let splitDate: string;

  if (period === "week") {
    const dayOfWeek = today.getDay();
    const daysFromMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    const thisMonday = new Date(today);
    thisMonday.setDate(today.getDate() - daysFromMonday);
    const lastMonday = new Date(thisMonday);
    lastMonday.setDate(thisMonday.getDate() - 7);
    startDate = toDateString(lastMonday);
    splitDate = toDateString(thisMonday);
  } else {
    const thisMonthStart = new Date(today.getFullYear(), today.getMonth(), 1);
    const lastMonthStart = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    startDate = toDateString(lastMonthStart);
    splitDate = toDateString(thisMonthStart);
  }

  return {
    startDate,
    endDate,
    splitDate,
    comparisonLabel: period === "month" ? "전월 대비 증감률" : "전주 대비 증감률",
  };
}

function getPeriodRange(periodKey: string) {
  const end = new Date();
  end.setDate(end.getDate() - 1);

  const dayMap: Record<string, { days: number; label: string; timeUnit: DatalabTimeUnit }> = {
    snapshot: { days: 7, label: "스냅샷", timeUnit: "date" },
    "1m": { days: 30, label: "1개월", timeUnit: "date" },
    "6m": { days: 180, label: "6개월", timeUnit: "week" },
    "1y": { days: 365, label: "1년", timeUnit: "week" },
    "3y": { days: 1095, label: "3년", timeUnit: "month" },
  };
  const option = dayMap[periodKey] || dayMap.snapshot;
  const start = new Date(end);
  start.setDate(start.getDate() - option.days + 1);

  return {
    startDate: toDateString(start),
    endDate: toDateString(end),
    label: option.label,
    timeUnit: option.timeUnit,
  };
}

function resolvePage2TrendGroups(ingredientSet: string, requestedLabels: string[]) {
  if (ingredientSet !== "opportunity") return PAGE2_MAIN_INGREDIENT_GROUPS;

  const allGroups = [...PAGE2_MAIN_INGREDIENT_GROUPS, ...buildIngredientKeywordGroups()];
  const seen = new Set<string>();
  const groups = requestedLabels.flatMap((label) => {
    const normalized = normalizeGroupLabel(label);
    if (!normalized || seen.has(normalized)) return [];

    const matchedGroup = allGroups.find((group) => {
      const groupLabel = normalizeGroupLabel(group.label);
      const groupKey = normalizeGroupLabel(group.key);
      return groupLabel === normalized ||
        groupKey === normalized ||
        groupLabel.includes(normalized) ||
        normalized.includes(groupLabel);
    });

    seen.add(normalized);

    return [{
      key: matchedGroup?.key || normalized,
      label,
      keywords: matchedGroup?.keywords?.length ? matchedGroup.keywords : buildFallbackIngredientKeywords(label),
    }];
  });

  return groups.length ? groups.slice(0, 5) : PAGE2_MAIN_INGREDIENT_GROUPS;
}

function splitIngredientLabels(value: string) {
  return value
    .split(",")
    .map((label) => label.trim())
    .filter(Boolean)
    .slice(0, 5);
}

function buildFallbackIngredientKeywords(label: string) {
  return [
    label,
    `${label} 세럼`,
    `${label} 앰플`,
    `${label} 에센스`,
    `${label} 세럼 추천`,
    `${label} 앰플 추천`,
  ];
}

function normalizeGroupLabel(value: string) {
  return value.toLocaleLowerCase("ko-KR").replace(/[\s/_-]+/g, "");
}

function buildPage2Insights(
  searchTrend: { dates: string[]; series: Array<{ ingredient: string; values: number[] }> },
  concernTable: Array<Record<string, string | number>>,
) {
  const strongestIngredient = searchTrend.series
    .slice()
    .sort((a, b) => Number(b.values.at(-1) || 0) - Number(a.values.at(-1) || 0))[0];
  const fastestGrowthIngredient = searchTrend.series
    .map((series) => ({ ...series, growth: calculateSeriesGrowth(series.values) }))
    .sort((a, b) => b.growth - a.growth)[0];
  const concernLabels = new Map(CONCERN_SIGNAL_GROUPS.map((group) => [group.key, group.label]));
  const strongestConcern = concernTable.flatMap((row) =>
    Object.entries(row)
      .filter(([key]) => key !== "age")
      .map(([key, value]) => ({
        age: String(row.age),
        label: concernLabels.get(key) || key,
        value: Number(value || 0),
      })),
  ).sort((a, b) => b.value - a.value)[0];
  const insights: string[] = [];

  if (strongestIngredient) {
    insights.push(`${strongestIngredient.ingredient}의 현재 검색 관심도가 주요 성분 중 가장 높습니다. MD는 대표 노출 상품과 비교 콘텐츠를 이 성분 중심으로 우선 배치할 만합니다.`);
  }
  if (fastestGrowthIngredient) {
    insights.push(`${withTopicParticle(fastestGrowthIngredient.ingredient)} 선택 기간 초 대비 ${round(fastestGrowthIngredient.growth, 1)}% 변화했습니다. 상승 성분이면 소량 테스트 SKU와 광고 소재 A/B 테스트로 초기 반응을 빠르게 확인하세요.`);
  }
  if (strongestConcern) {
    insights.push(`${strongestConcern.age}에서 ${strongestConcern.label} 고민 집중도가 상대적으로 높습니다. 타깃 카피는 성분명보다 고민 해결 장면과 사용감 중심으로 설계하는 것이 좋습니다.`);
  }

  return ensureInsightRange(insights, [
    "검색 추이 데이터가 부족하면 신규 기획 확정 근거로 쓰기보다 후보 성분을 좁히는 신호로만 활용하세요.",
    "연령대별 피부 고민 데이터가 부족하면 상세페이지 메시지는 범용 효능보다 리뷰에서 검증된 사용감 표현을 우선 적용하세요.",
  ], 2, 5);
}

function calculateSeriesGrowth(values: number[]) {
  const finiteValues = values.filter((value) => Number.isFinite(Number(value)));
  if (finiteValues.length < 2) return 0;
  const start = Number(finiteValues[0]);
  const end = Number(finiteValues.at(-1) || 0);
  return start > 0 ? ((end - start) / start) * 100 : 0;
}

function withTopicParticle(value: string) {
  const text = String(value || "").trim();
  if (!text) return "";
  const lastChar = Array.from(text).at(-1) || "";
  const code = lastChar.charCodeAt(0);
  const hasBatchim = code >= 0xac00 && code <= 0xd7a3 ? (code - 0xac00) % 28 > 0 : false;
  return `${text}${hasBatchim ? "은" : "는"}`;
}

function ensureInsightRange(insights: string[], fallback: string[], minItems: number, maxItems: number) {
  const unique: string[] = [];

  insights.forEach((item) => {
    const text = item.trim();
    if (!text || unique.includes(text)) return;
    unique.push(text);
  });
  fallback.forEach((item) => {
    if (unique.length >= minItems) return;
    const text = item.trim();
    if (!text || unique.includes(text)) return;
    unique.push(text);
  });

  return unique.slice(0, maxItems);
}

function toDateString(date: Date) {
  return date.toISOString().slice(0, 10);
}

function average(values: number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function calculateGrowth(current: number, previous: number) {
  if (previous <= 0) return current > 0 ? 100 : 0;
  return ((current - previous) / previous) * 100;
}

function round(value: number, digits = 0) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function chunkGroups<T>(items: T[], size: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}
