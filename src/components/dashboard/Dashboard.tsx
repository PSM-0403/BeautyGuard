"use client";

import { Fragment, useEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent, type ReactNode } from "react";
import { dashboardData } from "@/lib/mock-data";
import {
  DEFAULT_DEMAND_SUPPLY_MATRIX_CONFIG,
  fetchDemandSupplyMatrixFromSupabase,
} from "@/lib/demand-supply-matrix";
import {
  ALERT_SEVERITY_LABELS,
  ALERT_TYPE_LABELS,
  type DailyAlertsPayload,
} from "@/lib/alerts";
import { fetchPriceDistributionFromSupabase, getEmptyPriceDistribution } from "@/lib/price-distribution";
import { IngredientSelect } from "@/components/review-analysis/IngredientSelect";
import { getReviewIngredientOptions } from "@/lib/reviewConstants";
import { KeywordCards } from "@/components/review-analysis/KeywordCards";
import { OpportunityInsights } from "@/components/review-analysis/OpportunityInsights";
import { SentimentDonutChart } from "@/components/review-analysis/SentimentDonutChart";
import { SkinTypeSentimentTable } from "@/components/review-analysis/SkinTypeSentimentTable";
import { TopReviewProducts } from "@/components/review-analysis/TopReviewProducts";
import { createClient } from "@/utils/supabase/client";
import { IngredientTooltip } from "@/components/dashboard/IngredientTooltip";
import { getIngredientDescription } from "@/lib/ingredient-descriptions";
import type { ReviewAnalysisResult } from "@/lib/reviewAnalysis";
import type {
  AlertItem,
  ConcernMetric,
  DashboardData,
  DashboardMeta,
  DemandSupplyItem,
  MarketProduct,
  Page1Summary,
  PriceDistributionItem,
  PriceDistributionPoint,
  RankItem,
  SearchTrendSeries,
} from "@/lib/types";

type TabId = "A" | "B" | "C" | "D" | "E";
type PriceType = "sale" | "list";
type ApiState = "idle" | "loading" | "ready" | "error";
type IngredientRankingSource = "naver" | "oliveyoung";
type TrendIngredientSet = "main" | "opportunity";
type Page1Period = "week" | "month";

type DataLoadState = {
  dashboardSignals: ApiState;
  searchTrend: ApiState;
  priceDistribution: ApiState;
  demandSupplyMatrix: ApiState;
  page1Insights: ApiState;
  page2Insights: ApiState;
  dashboardSignalsError: string;
  searchTrendError: string;
  priceDistributionError: string;
  demandSupplyMatrixError: string;
  page1InsightsError: string;
  page2InsightsError: string;
};

type AgentResult = {
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

type DashboardSignalsPayload = Omit<Partial<DashboardData>, "page1" | "page2" | "page1Summary"> & {
  page1Summary?: Partial<Page1Summary>;
  page1?: Partial<DashboardData["page1"]>;
  page2?: Partial<DashboardData["page2"]>;
};

const DATALAB_API_BASE_URL = process.env.NEXT_PUBLIC_DATALAB_API_BASE_URL || "https://cosmetic-api-clae.onrender.com";

const NAV_ITEMS: Array<{ id: TabId; index: string; label: string; badge?: string }> = [
  { id: "A", index: "01", label: "시장 요약" },
  { id: "B", index: "02", label: "검색 트렌드 분석" },
  { id: "C", index: "03", label: "소비자 리뷰 분석" },
  { id: "D", index: "04", label: "경보" },
  { id: "E", index: "05", label: "AI Agent" },
];

const SEARCH_PERIOD_OPTIONS = [
  { key: "snapshot", label: "스냅샷" },
  { key: "1m", label: "1개월" },
  { key: "6m", label: "6개월" },
  { key: "1y", label: "1년" },
  { key: "3y", label: "3년" },
];

import { MAIN_INGREDIENT_LIST } from "@/lib/main-ingredients";

const MAIN_INGREDIENTS = MAIN_INGREDIENT_LIST.map(({ key, label }) => ({ key, label }));



const TREND_INGREDIENT_SET_OPTIONS: Array<{ key: TrendIngredientSet; label: string }> = [
  { key: "main", label: "주요 성분" },
  { key: "opportunity", label: "기회 성분" },
];

type RankingProduct = {
  collected_date?: string;
  sort_type?: string;
  rank?: number;
  brand?: string;
  product_name?: string;
  product_name_clean?: string;
};

type DashboardSummaryResponse = {
  meta?: Partial<DashboardMeta> & { source?: string };
  page1?: Partial<DashboardData["page1"]>;
  page2?: Partial<DashboardData["page2"]>;
  counts?: Array<{ table_name?: string; cnt?: number }>;
  latest_rankings?: RankingProduct[];
  top_review_products?: RankingProduct[];
  review_data_status?: string;
};

type DatalabWeeklyInterestResponse = {
  meta?: Partial<DashboardMeta> & { source?: string };
  page1?: {
    functionRisers?: unknown;
    functionDemand?: unknown;
    ingredientPopularity?: unknown;
    ingredientDemand?: unknown;
  };
  page2?: Partial<DashboardData["page2"]>;
};

const DATALAB_WEEKLY_API_REQUIRED_MESSAGE = "네이버 데이터랩 주간 검색 관심도를 불러오지 못했습니다.";
const NAVER_DEMAND_API_REQUIRED_MESSAGE = "네이버 데이터랩 수요 데이터를 불러오지 못했습니다.";
const INSIGHT_GENERATION_ERROR_MESSAGE = "인사이트 요약을 생성하지 못했습니다.";

// Page 1 DataLab rankings are loaded through the server-only Next route
// /api/dashboard/datalab-weekly-interest so Naver credentials never reach the browser.

const DATALAB_TREND_COLORS: Record<string, string> = {
  "레티놀": "#3B66A6",
  "PDRN": "#2CA6A4",
  "나이아신아마이드": "#E6A23C",
  "히알루론산": "#8B7CC8",
  "병풀/시카": "#5AAA6E",
};

const STATUS_LABELS: Record<DemandSupplyItem["status"], string> = {
  growth: "성장",
  shortage: "기회",
  opportunity: "기회",
  oversupply: "공급 과잉",
  stable: "관찰",
};

const STATUS_COLORS: Record<DemandSupplyItem["status"], string> = {
  growth: "#5AAA6E",
  shortage: "#D96A7A",
  opportunity: "#3FA7B5",
  oversupply: "#C97A9B",
  stable: "#7B8493",
};

const MATRIX_STATUS_KEYS: DemandSupplyItem["status"][] = ["growth", "opportunity", "oversupply", "stable"];

const CHART_COLORS = ["#2563eb", "#14b8a6", "#f59e0b", "#8b5cf6", "#64748b"];
const EXTENDED_TREND_COLORS = [
  "#E6A23C",
  "#8B7CC8",
  "#5AAA6E",
  "#2CA6A4",
  "#3B66A6",
  "#C97A9B",
  "#7B8493",
  "#D96A7A",
];

function getTrendColor(label: string, index = 0) {
  return DATALAB_TREND_COLORS[label] || EXTENDED_TREND_COLORS[index % EXTENDED_TREND_COLORS.length] || "#6B7280";
}

const INITIAL_DASHBOARD_DATA = {
  ...dashboardData,
  page1Summary: {
    analyzedProducts: 0,
    analyzedIngredients: 0,
    totalSearchGrowthRate: 0,
    risingIngredientCount: 0,
    supplyShortageIngredientCount: 0,
  },
  page1: {
    ...dashboardData.page1,
    insights: [],
    priceDistribution: getEmptyPriceDistribution(),
    demandSupplyMatrix: [],
  },
  page4: {
    alertDate: "",
    summary: {
      opportunityCount: 0,
      inventoryRiskCount: 0,
      reviewIssueCount: 0,
    },
    alerts: [],
  },
  page5: {
    ...dashboardData.page5,
    insights: [],
    targetStrategy: {
      title: "",
      issues: [],
      directions: [],
      actions: [],
    },
  },
} satisfies DashboardData;

function buildDatalabApiUrl(path: string) {
  const baseUrl = DATALAB_API_BASE_URL.replace(/\/+$/, "");
  const apiPath = path.startsWith("/") ? path : `/${path}`;
  return `${baseUrl}${apiPath}`;
}

async function fetchDatalabJson<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(buildDatalabApiUrl(path), {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options?.headers || {}),
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = getApiErrorMessage(payload);
    throw new Error(message);
  }
  return payload as T;
}

async function fetchLocalJson<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options?.headers || {}),
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(getApiErrorMessage(payload));
  }
  return payload as T;
}

async function fetchCurrentApiDashboardSignals(period: Page1Period = "week"): Promise<DashboardSignalsPayload> {
  const [summaryResult, weeklyResult, snapshotSummaryResult] = await Promise.allSettled([
    fetchDatalabJson<DashboardSummaryResponse>("/dashboard/summary"),
    fetchLocalJson<DatalabWeeklyInterestResponse>(`/api/dashboard/datalab-weekly-interest?period=${period}`),
    fetchSnapshotPage1SummaryFromSupabase(),
  ]);
  const summary = summaryResult.status === "fulfilled" ? summaryResult.value : {};
  const weekly = weeklyResult.status === "fulfilled" ? weeklyResult.value : {};
  const snapshotSummary = snapshotSummaryResult.status === "fulfilled" ? snapshotSummaryResult.value : null;
  const summaryPayload = normalizeDashboardSummary(summary);
  const weeklyPayload = normalizeDatalabWeeklyInterest(weekly);
  const functionRisers = weeklyPayload.page1?.functionRisers || [];
  const ingredientPopularity = weeklyPayload.page1?.ingredientPopularity || [];
  const functionDemand = normalizeDatalabWeeklyRankItems(
    weekly.page1?.functionDemand || weekly.page1?.functionRisers,
    "growth",
    null,
  );
  const ingredientDemand = normalizeDatalabWeeklyRankItems(
    weekly.page1?.ingredientDemand || weekly.page1?.ingredientPopularity,
    "searchIndex",
    null,
  );

  if (summaryResult.status === "rejected") {
    console.error("FastAPI /dashboard/summary 조회 실패", summaryResult.reason);
  }

  if (weeklyResult.status === "rejected") {
    console.error("Naver DataLab 주간 검색 관심도 직접 조회 실패", weeklyResult.reason);
  }

  if (snapshotSummaryResult.status === "rejected") {
    console.error("Supabase 1페이지 분석 대상 요약 조회 실패", snapshotSummaryResult.reason);
  }

  return {
    ...summaryPayload,
    meta: {
      ...summaryPayload.meta,
      ...(weeklyPayload.meta || {}),
      dataRange: weeklyPayload.meta?.dataRange || summaryPayload.meta?.dataRange || "Naver DataLab 주간 검색 관심도",
      lastUpdated: weeklyPayload.meta?.lastUpdated || summaryPayload.meta?.lastUpdated || "-",
      comparisonLabel: "전주 대비 증감률",
    },
    page1Summary: {
      analyzedProducts: snapshotSummary?.analyzedProducts ?? summaryPayload.page1Summary?.analyzedProducts ?? 0,
      analyzedIngredients: snapshotSummary?.analyzedIngredients ?? summaryPayload.page1Summary?.analyzedIngredients ?? 0,
      totalSearchGrowthRate: getCombinedSearchGrowth([...functionDemand, ...ingredientDemand]),
    },
    page1: {
      ...summaryPayload.page1,
      functionRisers,
      ingredientPopularity,
    },
  };
}

function normalizeDatalabWeeklyInterest(payload: DatalabWeeklyInterestResponse): DashboardSignalsPayload {
  return {
    meta: {
      ...payload.meta,
      apiSource: payload.meta?.apiSource || payload.meta?.source || "naver_datalab",
      dataRange: payload.meta?.dataRange || "Naver DataLab 주간 검색 관심도",
      lastUpdated: payload.meta?.lastUpdated || "-",
      comparisonLabel: "전주 대비 증감률",
    },
    page1: {
      functionRisers: normalizeDatalabWeeklyRankItems(payload.page1?.functionRisers, "pointDiff"),
      ingredientPopularity: normalizeDatalabWeeklyRankItems(payload.page1?.ingredientPopularity, "searchIndex"),
    },
  };
}

function normalizeDashboardSummary(summary: DashboardSummaryResponse): DashboardSignalsPayload {
  const latestDate = getLatestRankingDate(summary.latest_rankings || []);
  const tableCounts = new Map((summary.counts || []).map((row) => [row.table_name || "", Number(row.cnt || 0)]));
  const page1 = summary.page1 || {};
  const page2 = summary.page2 || {};

  return {
    meta: {
      ...summary.meta,
      apiSource: summary.meta?.apiSource || summary.meta?.source || "fastapi_supabase",
      dataRange: summary.meta?.dataRange || (latestDate ? `${latestDate} 랭킹 스냅샷` : "FastAPI Supabase 최신 데이터"),
      lastUpdated: summary.meta?.lastUpdated || latestDate || "-",
      comparisonLabel: summary.meta?.comparisonLabel || "전주 대비 증감률",
    },
    page1Summary: {
      analyzedProducts: tableCounts.get("products") || 0,
      analyzedIngredients: tableCounts.get("product_main_ingredients") || 0,
      totalSearchGrowthRate: 0,
      risingIngredientCount: page1.functionRisers?.length || 0,
      supplyShortageIngredientCount: 0,
    },
    page1: {
      functionRisers: normalizeDatalabWeeklyRankItems(page1.functionRisers, "pointDiff"),
      ingredientPopularity: normalizeDatalabWeeklyRankItems(page1.ingredientPopularity, "searchIndex"),
      insights: [],
    },
    page2: {
      concernMetrics: page2.concernMetrics || [],
      concernTable: page2.concernTable || [],
      marketProducts: page2.marketProducts || [],
      insights: page2.insights || [],
    },
  };
}

function normalizeDatalabWeeklyRankItems(items: unknown, sortBy: "growth" | "searchIndex" | "pointDiff", limit: number | null = 5): RankItem[] {
  if (!Array.isArray(items)) return [];
  const rows: RankItem[] = [];

  items.forEach((item) => {
    const row = item as Partial<RankItem> & {
      rawIndex?: number;
      ingredient_label?: string;
      title?: string;
      currentWeekIndex?: number;
      previousWeekIndex?: number;
      current_week_index?: number;
      previous_week_index?: number;
      this_week_index?: number;
      last_week_index?: number;
      search_index_recent?: number;
      search_index_previous?: number;
      current_index?: number;
      previous_index?: number;
      growth?: number;
    };
    const label = row.label || row.ingredient_label || row.title;
    if (!label) return;
    const currentWeekIndex = getFirstFiniteNumber(row, [
      "currentWeekIndex",
      "current_week_index",
      "this_week_index",
      "search_index_recent",
      "current_index",
    ]);
    const previousWeekIndex = getFirstFiniteNumber(row, [
      "previousWeekIndex",
      "previous_week_index",
      "last_week_index",
      "search_index_previous",
      "previous_index",
    ]);

    if (currentWeekIndex === null || previousWeekIndex === null) {
      console.error("DataLab 주간 검색 관심도 응답에 이번 주/전주 지수가 없습니다.", { label, row });
      return;
    }
    const providedGrowth = getFirstFiniteNumber(row, ["growth"]);
    const growth = providedGrowth ?? calculateWeeklyGrowth(currentWeekIndex, previousWeekIndex);

    rows.push({
      label,
      growth,
      searchIndex: currentWeekIndex,
      currentWeekIndex,
      previousWeekIndex,
    });
  });

  const sortedRows = sortDatalabRankItems(rows, sortBy);
  return limit === null ? sortedRows : sortedRows.slice(0, limit);
}

function sortDatalabRankItems(items: RankItem[], sortBy: "growth" | "searchIndex" | "pointDiff") {
  if (sortBy === "pointDiff") {
    return items.slice().sort((a, b) =>
      (Number(b.currentWeekIndex || 0) - Number(b.previousWeekIndex || 0)) -
      (Number(a.currentWeekIndex || 0) - Number(a.previousWeekIndex || 0))
    );
  }
  return items.slice().sort((a, b) => Number(b[sortBy] || 0) - Number(a[sortBy] || 0));
}

function calculateWeeklyGrowth(currentWeekIndex: number, previousWeekIndex: number) {
  if (previousWeekIndex <= 0) return currentWeekIndex > 0 ? 100 : 0;
  return ((currentWeekIndex - previousWeekIndex) / previousWeekIndex) * 100;
}


function getCombinedSearchGrowth(items: RankItem[]) {
  const totals = items.reduce(
    (sum, item) => {
      const current = Number(item.currentWeekIndex ?? item.searchIndex ?? 0);
      const previous = Number(item.previousWeekIndex ?? 0);
      if (Number.isFinite(current)) sum.current += current;
      if (Number.isFinite(previous)) sum.previous += previous;
      return sum;
    },
    { current: 0, previous: 0 },
  );

  if (totals.previous <= 0) return totals.current > 0 ? 100 : 0;
  return roundNumber(((totals.current - totals.previous) / totals.previous) * 100, 1);
}

function getFirstFiniteNumber(row: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    if (!(key in row)) continue;
    const value = row[key];
    if (value === null || value === undefined || value === "") continue;
    const number = Number(value);
    if (Number.isFinite(number)) return number;
  }

  return null;
}

function getLatestRankingDate(items: RankingProduct[]) {
  return items
    .map((item) => item.collected_date || "")
    .filter(Boolean)
    .sort()
    .at(-1);
}

function getApiErrorMessage(payload: unknown) {
  const row = payload as { message?: unknown; detail?: unknown; error?: unknown };
  if (typeof row.message === "string") return row.message;
  if (typeof row.detail === "string") return row.detail;
  if (typeof row.error === "string") return row.error;
  return "FastAPI 요청에 실패했습니다.";
}

function mergeDashboardSignals(current: DashboardData, payload: DashboardSignalsPayload) {
  const nextMeta = payload.meta as (Partial<DashboardMeta> & { source?: string }) | undefined;
  const hasPage1Payload = Boolean(payload.page1);
  return {
    ...current,
    meta: {
      ...current.meta,
      ...(payload.meta || {}),
      apiSource: nextMeta?.apiSource || nextMeta?.source || current.meta.apiSource,
    } as DashboardMeta,
    page1Summary: {
      ...current.page1Summary,
      ...(payload.page1Summary || {}),
    },
    page1: {
      ...current.page1,
      functionRisers: hasPage1Payload && "functionRisers" in (payload.page1 || {}) ? payload.page1?.functionRisers || [] : current.page1.functionRisers,
      ingredientPopularity: hasPage1Payload && "ingredientPopularity" in (payload.page1 || {}) ? payload.page1?.ingredientPopularity || [] : current.page1.ingredientPopularity,
      insights: current.page1.insights,
    },
    page2: {
      ...current.page2,
      concernMetrics: payload.page2?.concernMetrics?.length ? payload.page2.concernMetrics : current.page2.concernMetrics,
      concernTable: payload.page2?.concernTable?.length ? payload.page2.concernTable : current.page2.concernTable,
      marketProducts: payload.page2?.marketProducts?.length ? payload.page2.marketProducts : current.page2.marketProducts,
      insights: payload.page2?.insights?.length ? payload.page2.insights : current.page2.insights,
    },
  } satisfies DashboardData;
}

function mergeIngredientTrend(current: DashboardData, payload: Partial<DashboardData["page2"]>) {
  const hasSearchTrend = Boolean(payload.searchTrend?.dates?.length && payload.searchTrend?.series?.length);
  const hasConcernTable = Boolean(payload.concernTable?.length && payload.concernMetrics?.length);

  if (!hasSearchTrend && !hasConcernTable) return current;

  return {
    ...current,
    page2: {
      ...current.page2,
      periodLabel: payload.periodLabel || current.page2.periodLabel,
      selectedIngredient: payload.selectedIngredient || current.page2.selectedIngredient,
      selectedSummary: {
        ...current.page2.selectedSummary,
        ...(payload.selectedSummary || {}),
      },
      searchTrend: hasSearchTrend ? payload.searchTrend! : current.page2.searchTrend,
      concernMetrics: hasConcernTable ? payload.concernMetrics! : current.page2.concernMetrics,
      concernTable: hasConcernTable ? payload.concernTable! : current.page2.concernTable,
      insights: payload.insights?.length ? payload.insights : current.page2.insights,
    },
  };
}

function mergePriceDistribution(current: DashboardData, priceDistribution: PriceDistributionItem[]) {
  return {
    ...current,
    page1: {
      ...current.page1,
      priceDistribution,
    },
  } satisfies DashboardData;
}

function mergeDemandSupplyMatrix(current: DashboardData, demandSupplyMatrix: DemandSupplyItem[]) {
  const newProductCandidateCount = demandSupplyMatrix.filter((item) => item.status === "opportunity" || item.status === "shortage").length;
  const inventoryRiskCount = demandSupplyMatrix.filter((item) => item.status === "oversupply").length;

  return {
    ...current,
    page1Summary: {
      ...current.page1Summary,
      risingIngredientCount: newProductCandidateCount,
      supplyShortageIngredientCount: inventoryRiskCount,
    },
    page1: {
      ...current.page1,
      demandSupplyMatrix,
    },
  } satisfies DashboardData;
}

function mergePage1Insights(current: DashboardData, insights: string[]) {
  return {
    ...current,
    page1: {
      ...current.page1,
      insights,
    },
  } satisfies DashboardData;
}

function mergePage2Insights(current: DashboardData, insights: string[]) {
  return {
    ...current,
    page2: {
      ...current.page2,
      insights,
    },
  } satisfies DashboardData;
}

function buildPage2InsightPayload(data: DashboardData, marketProducts: MarketProduct[]) {
  return {
    searchTrend: data.page2.searchTrend,
    concernMetrics: data.page2.concernMetrics,
    concernTable: data.page2.concernTable,
    marketProducts,
  };
}

function mergeAgentResult(current: DashboardData, result: AgentResult): DashboardData {
  const newInsight = {
    id: `agent-${Date.now()}`,
    title: result.title,
    level: result.level,
    summary: result.summary,
    evidence: result.evidence,
    strategy: result.strategy,
  };
  return {
    ...current,
    page5: {
      ...current.page5,
      insights: [newInsight, ...current.page5.insights].slice(0, 5),
      targetStrategy: {
        title: result.targetTitle,
        issues: result.issues,
        directions: result.directions,
        actions: result.actions,
      },
    },
  } satisfies DashboardData;
}

function mergeDailyAlerts(current: DashboardData, payload: DailyAlertsPayload) {
  return {
    ...current,
    page4: {
      alertDate: payload.alertDate,
      summary: payload.summary,
      alerts: payload.alerts,
    },
  } satisfies DashboardData;
}

function formatNumber(value: number | string | undefined) {
  return Number(value || 0).toLocaleString("ko-KR");
}

function formatPct(value: number | string | undefined) {
  const number = Number(value || 0);
  return `${number > 0 ? "+" : ""}${number.toFixed(1)}%`;
}

function calculateSeriesGrowth(series?: SearchTrendSeries, fallback = 0) {
  const values = (series?.values || []).filter((value) => Number.isFinite(Number(value)));
  if (values.length < 2) return fallback;
  const start = Number(values[0]);
  const end = Number(values[values.length - 1]);
  return start ? ((end - start) / start) * 100 : fallback;
}

const MARKET_PRODUCT_TABLE_CANDIDATES = ["product_main_ingredients", "main_ingrdients", "main_ingredients"] as const;
const MARKET_INGREDIENT_SELECT_CANDIDATES = [
  "goods_no, ingredient_name",
  "goods_no, main_ingredients",
  "goods_no, main_ingredient",
  "goods_no, ingredient",
  "goods_no, ingredient_label",
  "goods_no, name",
] as const;
const MARKET_SNAPSHOT_SELECT_CANDIDATES = [
  "goods_no, collected_date",
  "goods_no, snapshot_date",
  "goods_no, created_at",
] as const;
const SUMMARY_PAGE_SIZE = 1000;
const OLIVEYOUNG_RANKING_SELECT_CANDIDATES = [
  "goods_no, ranking_rank:rank, collected_date, sort_type",
  "goods_no, ranking_rank:rank, snapshot_date, sort_type",
  "goods_no, ranking_rank:rank, created_at, sort_type",
  "goods_no, ranking_rank:rank, collected_date",
  "goods_no, ranking_rank:rank",
  "goods_no, rank, collected_date, sort_type",
  "goods_no, rank, snapshot_date, sort_type",
  "goods_no, rank, created_at, sort_type",
  "goods_no, rank, collected_date",
  "goods_no, rank",
] as const;

type MarketIngredientRow = Record<string, unknown> & {
  goods_no?: string | number | null;
};

type MarketSnapshotRow = Record<string, unknown> & {
  goods_no?: string | number | null;
  collected_date?: string | null;
  snapshot_date?: string | null;
  created_at?: string | null;
};

type OliveYoungRankingRow = Record<string, unknown> & {
  goods_no?: string | number | null;
  rank?: string | number | null;
  ranking_rank?: string | number | null;
  collected_date?: string | null;
  snapshot_date?: string | null;
  created_at?: string | null;
  sort_type?: string | null;
};

function normalizeMarketText(value: unknown) {
  return String(value ?? "").trim().toLowerCase().replace(/\s+/g, "");
}

function getMarketIngredientName(row: MarketIngredientRow) {
  return String(
    row.ingredient_name ??
    row.main_ingredients ??
    row.main_ingredient ??
    row.ingredient ??
    row.ingredient_label ??
    row.name ??
    "",
  ).trim();
}

function getSnapshotDate(row: MarketSnapshotRow) {
  return String(row.collected_date ?? row.snapshot_date ?? row.created_at ?? "").slice(0, 10);
}

function getIngredientAliases(label: string) {
  const normalizedLabel = label.toLowerCase();
  const aliasesByLabel: Record<string, string[]> = {
    "나이아신아마이드": ["나이아신아마이드", "니아신아마이드", "나이아신", "niacinamide"],
    "히알루론산": ["히알루론산", "히알루론", "히알루로닉", "hyaluronic"],
    "병풀/시카": ["병풀", "시카", "센텔라", "cica", "centella"],
    "PDRN": ["pdrn", "피디알엔", "피디알앤", "연어 dna"],
    "레티놀": ["레티놀", "레티날", "retinol", "retinal"],
  };

  return aliasesByLabel[label] || [label, normalizedLabel];
}

function isMarketIngredientMatch(name: string, aliases: string[]) {
  const normalized = normalizeMarketText(name);
  return aliases.some((alias) => normalized.includes(normalizeMarketText(alias)));
}

async function selectMarketRows<T extends Record<string, unknown>>(
  table: string,
  selectCandidates: readonly string[],
) {
  const supabase = createClient();

  for (const selectQuery of selectCandidates) {
    const { data, error } = await supabase
      .from(table)
      .select(selectQuery)
      .limit(10000);

    if (!error) return (data || []) as unknown as T[];

    console.error(`Supabase ${table} 조회 실패`, { selectQuery, message: error.message });
  }

  throw new Error(`${table}에서 필요한 컬럼을 찾지 못했습니다.`);
}

async function fetchSnapshotPage1SummaryFromSupabase(): Promise<Pick<Page1Summary, "analyzedProducts" | "analyzedIngredients">> {
  const supabase = createClient();
  const { data: latestRows, error: latestError } = await supabase
    .from("product_snapshots")
    .select("collected_date")
    .order("collected_date", { ascending: false })
    .limit(1);

  if (latestError) throw new Error(`product_snapshots 최신일 조회 실패: ${latestError.message}`);

  const latestDate = String(latestRows?.[0]?.collected_date || "").slice(0, 10);
  if (!latestDate) return { analyzedProducts: 0, analyzedIngredients: 0 };

  const startDate = toDateStringFromDate(addDays(new Date(latestDate), -6));
  const goodsNos = new Set<string>();

  for (let from = 0; ; from += SUMMARY_PAGE_SIZE) {
    const { data, error } = await supabase
      .from("product_snapshots")
      .select("goods_no, collected_date")
      .gte("collected_date", startDate)
      .lte("collected_date", latestDate)
      .range(from, from + SUMMARY_PAGE_SIZE - 1);

    if (error) throw new Error(`product_snapshots 7일 분석 대상 조회 실패: ${error.message}`);

    const page = (data || []) as unknown as Array<{ goods_no?: string | number | null }>;
    page.forEach((row) => {
      const goodsNo = String(row.goods_no ?? "").trim();
      if (goodsNo) goodsNos.add(goodsNo);
    });

    if (page.length < SUMMARY_PAGE_SIZE) break;
  }

  if (!goodsNos.size) return { analyzedProducts: 0, analyzedIngredients: 0 };

  const ingredientRows = await fetchIngredientRowsForGoodsNos(Array.from(goodsNos));
  const ingredientNames = new Set<string>();

  ingredientRows.forEach((row) => {
    const ingredientName = getMarketIngredientName(row);
    if (ingredientName) ingredientNames.add(ingredientName);
  });

  return {
    analyzedProducts: goodsNos.size,
    analyzedIngredients: ingredientNames.size,
  };
}

async function fetchMarketProductsFromSupabase(ingredientLabels: string[]): Promise<MarketProduct[]> {
  const uniqueLabels = Array.from(new Set(ingredientLabels.filter(Boolean)));

  if (!uniqueLabels.length) return [];

  let ingredientRows: MarketIngredientRow[] = [];
  let usedTable = "";

  for (const tableName of MARKET_PRODUCT_TABLE_CANDIDATES) {
    try {
      ingredientRows = await selectMarketRows<MarketIngredientRow>(tableName, MARKET_INGREDIENT_SELECT_CANDIDATES);
      usedTable = tableName;
      if (ingredientRows.length) break;
    } catch (error) {
      console.error(`${tableName} 성분 상품 수 조회 실패`, error);
    }
  }

  if (!ingredientRows.length) return [];

  const goodsByIngredient = new Map<string, Set<string>>();

  uniqueLabels.forEach((label) => {
    const aliases = getIngredientAliases(label);
    const goodsNos = new Set<string>();

    ingredientRows.forEach((row) => {
      const goodsNo = String(row.goods_no ?? "").trim();
      const ingredientName = getMarketIngredientName(row);
      if (!goodsNo || !ingredientName) return;
      if (isMarketIngredientMatch(ingredientName, aliases)) goodsNos.add(goodsNo);
    });

    goodsByIngredient.set(label, goodsNos);
  });

  let snapshotRows: MarketSnapshotRow[] = [];
  try {
    snapshotRows = await selectMarketRows<MarketSnapshotRow>("product_snapshots", MARKET_SNAPSHOT_SELECT_CANDIDATES);
  } catch (error) {
    console.error("product_snapshots 전주 제품 수 조회 실패", error);
  }

  const snapshotDates = snapshotRows.map(getSnapshotDate).filter(Boolean).sort();
  const latestDate = snapshotDates.at(-1);
  const previousDate = latestDate ? toDateStringFromDate(addDays(new Date(latestDate), -7)) : "";
  const snapshotsByGoodsNo = new Map<string, string[]>();

  snapshotRows.forEach((row) => {
    const goodsNo = String(row.goods_no ?? "").trim();
    const date = getSnapshotDate(row);
    if (!goodsNo || !date) return;
    const dates = snapshotsByGoodsNo.get(goodsNo) || [];
    dates.push(date);
    snapshotsByGoodsNo.set(goodsNo, dates);
  });

  return uniqueLabels.map((label) => {
    const goodsNos = goodsByIngredient.get(label) || new Set<string>();
    const productCount = goodsNos.size;
    const previousCount = previousDate
      ? Array.from(goodsNos).filter((goodsNo) => (snapshotsByGoodsNo.get(goodsNo) || []).some((date) => date <= previousDate)).length
      : 0;
    const hasPreviousBaseline = previousCount > 0;
    const safePreviousCount = hasPreviousBaseline ? previousCount : productCount;
    const growthCount = hasPreviousBaseline ? productCount - previousCount : 0;
    const growthRate = hasPreviousBaseline ? (growthCount / previousCount) * 100 : 0;

    return {
      ingredient_key: label,
      ingredient_label: label,
      product_count: productCount,
      previous_product_count: safePreviousCount,
      product_growth_rate: Number.isFinite(growthRate) ? roundNumber(growthRate, 1) : 0,
      product_growth_count: growthCount,
      source: hasPreviousBaseline ? usedTable : `${usedTable}:no_previous_snapshot`,
    };
  });
}

async function fetchOliveYoungIngredientPopularityFromSupabase(): Promise<RankItem[]> {
  const supabase = createClient();
  let rankingRows: OliveYoungRankingRow[] = [];
  let lastRankingError = "";

  for (const selectQuery of OLIVEYOUNG_RANKING_SELECT_CANDIDATES) {
    const { data, error } = await supabase
      .from("product_rankings")
      .select(selectQuery as string)
      .limit(10000);

    if (!error) {
      rankingRows = (data || []) as unknown as OliveYoungRankingRow[];
      break;
    }

    lastRankingError = error.message;
    console.error("Supabase product_rankings 조회 실패", { selectQuery, message: error.message });
  }

  if (!rankingRows.length) {
    throw new Error(lastRankingError || "product_rankings에서 랭킹 데이터를 찾지 못했습니다.");
  }

  const latestRankingRows = filterPreferredRankingRows(filterLatestRankingRows(rankingRows));
  const rankByGoodsNo = new Map<string, number>();

  latestRankingRows.forEach((row) => {
    const goodsNo = String(row.goods_no ?? "").trim();
    const rank = toFiniteRank(row.rank ?? row.ranking_rank);
    if (!goodsNo || rank === null) return;
    const currentRank = rankByGoodsNo.get(goodsNo);
    if (currentRank === undefined || rank < currentRank) rankByGoodsNo.set(goodsNo, rank);
  });

  if (!rankByGoodsNo.size) {
    throw new Error("product_rankings.rank 기준으로 집계할 상품이 없습니다.");
  }

  const ingredientRows = await fetchIngredientRowsForGoodsNos(Array.from(rankByGoodsNo.keys()));
  const maxRank = Math.max(...Array.from(rankByGoodsNo.values()), 1);
  const byIngredient = new Map<string, { ranks: number[]; goodsNos: Set<string>; score: number }>();

  ingredientRows.forEach((row) => {
    const goodsNo = String(row.goods_no ?? "").trim();
    const rank = rankByGoodsNo.get(goodsNo);
    const ingredientName = getMarketIngredientName(row);
    if (!goodsNo || rank === undefined || !ingredientName) return;

    const current = byIngredient.get(ingredientName) || { ranks: [], goodsNos: new Set<string>(), score: 0 };
    if (current.goodsNos.has(goodsNo)) return;

    current.goodsNos.add(goodsNo);
    current.ranks.push(rank);
    current.score += maxRank - rank + 1;
    byIngredient.set(ingredientName, current);
  });

  const rows = Array.from(byIngredient.entries())
    .map(([label, item]) => {
      const averageRank = item.ranks.reduce((sum, rank) => sum + rank, 0) / item.ranks.length;
      return {
        label,
        score: item.score,
        searchIndex: item.score,
        averageRank: roundNumber(averageRank, 1),
        bestRank: Math.min(...item.ranks),
        productCount: item.goodsNos.size,
      } satisfies RankItem;
    })
    .sort((a, b) =>
      Number(b.score || 0) - Number(a.score || 0) ||
      Number(a.averageRank || Number.MAX_SAFE_INTEGER) - Number(b.averageRank || Number.MAX_SAFE_INTEGER) ||
      Number(b.productCount || 0) - Number(a.productCount || 0),
    );

  const maxScore = Math.max(...rows.map((row) => Number(row.score || 0)), 1);
  return rows.slice(0, 5).map((row) => ({
    ...row,
    searchIndex: roundNumber((Number(row.score || 0) / maxScore) * 100, 1),
  }));
}

async function fetchIngredientRowsForGoodsNos(goodsNos: string[]) {
  const supabase = createClient();
  let lastError = "";

  for (const selectQuery of MARKET_INGREDIENT_SELECT_CANDIDATES) {
    const rows: MarketIngredientRow[] = [];
    let hasError = false;

    for (const goodsNoChunk of chunkArray(goodsNos, 180)) {
      const { data, error } = await supabase
        .from("product_main_ingredients")
        .select(selectQuery as string)
        .in("goods_no", goodsNoChunk)
        .limit(10000);

      if (error) {
        lastError = error.message;
        hasError = true;
        console.error("Supabase product_main_ingredients 조인 조회 실패", { selectQuery, message: error.message });
        break;
      }

      rows.push(...((data || []) as unknown as MarketIngredientRow[]));
    }

    if (!hasError) return rows;
  }

  throw new Error(lastError || "product_main_ingredients에서 성분 컬럼을 찾지 못했습니다.");
}

function filterLatestRankingRows(rows: OliveYoungRankingRow[]) {
  const datedRows = rows
    .map((row) => ({ row, date: getRankingDate(row) }))
    .filter((item) => item.date);
  const latestDate = datedRows.map((item) => item.date).sort().at(-1);
  if (!latestDate) return rows;

  return datedRows.filter((item) => item.date === latestDate).map((item) => item.row);
}

function filterPreferredRankingRows(rows: OliveYoungRankingRow[]) {
  const salesRows = rows.filter((row) => /판매|sale/i.test(String(row.sort_type || "")));
  if (salesRows.length) return salesRows;

  const popularityRows = rows.filter((row) => /인기|popular|ranking|랭킹/i.test(String(row.sort_type || "")));
  return popularityRows.length ? popularityRows : rows;
}

function getRankingDate(row: OliveYoungRankingRow) {
  return String(row.collected_date ?? row.snapshot_date ?? row.created_at ?? "").slice(0, 10);
}

function toFiniteRank(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const rank = Number(String(value).replace(/,/g, ""));
  return Number.isFinite(rank) && rank > 0 ? rank : null;
}

function getOpportunityIngredientLabels(items: DemandSupplyItem[]) {
  const byLabel = new Map<string, DemandSupplyItem>();
  const addItems = (rows: DemandSupplyItem[]) => {
    rows.forEach((item) => {
      if (!byLabel.has(item.ingredient)) byLabel.set(item.ingredient, item);
    });
  };

  const priorityScore = (item: DemandSupplyItem) =>
    Number(item.opportunityScore || 0) * 1.4 +
    Math.max(0, Number(item.gap || 0)) +
    Math.max(0, Number(item.demandWow ?? item.growth ?? 0)) * 0.35 +
    Number(item.demand || 0) * 0.2;

  addItems(items.filter((item) => item.status === "opportunity").sort((a, b) => priorityScore(b) - priorityScore(a)));
  addItems(items.slice().sort((a, b) => priorityScore(b) - priorityScore(a)));

  return Array.from(byLabel.keys()).slice(0, 5);
}

function getTrendIngredientLabels(ingredientSet: TrendIngredientSet, matrixItems: DemandSupplyItem[]) {
  if (ingredientSet === "opportunity") {
    const opportunityLabels = getOpportunityIngredientLabels(matrixItems);
    if (opportunityLabels.length) return opportunityLabels;
  }

  return MAIN_INGREDIENTS.map((item) => item.label);
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function toDateStringFromDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function chunkArray<T>(items: T[], size: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function getCustomRankBarWidth(item: RankItem, items: RankItem[], valueGetter: (item: RankItem) => number) {
  const maxValue = Math.max(...items.map((row) => Math.max(0, valueGetter(row))), 1);
  return Math.max(8, Math.min(100, (Math.max(0, valueGetter(item)) / maxValue) * 100));
}

function getRankBarWidth(item: RankItem, items: RankItem[], barMetric: "growth" | "searchIndex") {
  if (barMetric === "growth") {
    const maxGrowth = Math.max(...items.map((row) => Math.max(0, Number(row.growth || 0))), 1);
    return Math.max(8, Math.min(100, (Math.max(0, Number(item.growth || 0)) / maxGrowth) * 100));
  }

  const maxSearchIndex = Math.max(...items.map((row) => Math.max(0, Number(row.searchIndex || 0))), 1);
  return Math.max(8, Math.min(100, (Math.max(0, Number(item.searchIndex || 0)) / maxSearchIndex) * 100));
}

function getPriceValues(item: PriceDistributionItem, priceType: PriceType) {
  const points = priceType === "list" ? item.listPricePoints : item.salePricePoints;
  if (points?.length) return points.map((point) => point.value);
  if (priceType === "list") return item.listPrices || item.prices || item.salePrices || [];
  return item.salePrices || item.prices || item.listPrices || [];
}

function getPricePoints(item: PriceDistributionItem, priceType: PriceType): PriceDistributionPoint[] {
  const points = priceType === "list" ? item.listPricePoints : item.salePricePoints;
  if (points?.length) return points;

  return getPriceValues(item, priceType).map((value) => ({
    value,
    ingredient: item.ingredient,
    productName: "상품명 없음",
    basisPrice: null,
    regularPrice: null,
    salesPrice: null,
    volumeMl: null,
    priceType,
  }));
}

function getPriceAxisRange(values: number[]) {
  const rawMin = Math.min(...values);
  const rawMax = Math.max(...values);
  const spread = Math.max(1000, rawMax - rawMin);
  const min = Math.max(0, Math.floor((rawMin - spread * 0.08) / 1000) * 1000);
  const max = Math.ceil((rawMax + spread * 0.08) / 1000) * 1000;
  return { min, max: Math.max(max, min + 1000) };
}

function getQuantile(values: number[], ratio: number) {
  if (!values.length) return 0;
  return values[Math.min(values.length - 1, Math.floor(values.length * ratio))];
}

function getDisplayPricePoints(values: PriceDistributionPoint[], maxPoints = 70) {
  if (values.length <= maxPoints) return values;
  const step = Math.ceil(values.length / maxPoints);
  return values.filter((_, index) => index % step === 0).slice(0, maxPoints);
}

function getViolinPath(values: number[], x: number, yFor: (value: number) => number, maxWidth: number) {
  const localMin = values[0];
  const localMax = values[values.length - 1];
  const spread = Math.max(1, localMax - localMin);
  const bandwidth = Math.max(spread / 5, 800);
  const densityPoints = Array.from({ length: 30 }, (_, index) => {
    const value = localMin + (spread * index) / 29;
    const density = values.reduce((sum, price) => {
      const distance = (value - price) / bandwidth;
      return sum + Math.exp(-0.5 * distance * distance);
    }, 0) / values.length;

    return { value, density };
  });
  const maxDensity = Math.max(...densityPoints.map((point) => point.density), 1);
  const rightPoints = densityPoints.map((point) => {
    const halfWidth = 4 + (point.density / maxDensity) * maxWidth;
    return `${x + halfWidth},${yFor(point.value)}`;
  });
  const leftPoints = densityPoints.slice().reverse().map((point) => {
    const halfWidth = 4 + (point.density / maxDensity) * maxWidth;
    return `${x - halfWidth},${yFor(point.value)}`;
  });

  return `M ${rightPoints.join(" L ")} L ${leftPoints.join(" L ")} Z`;
}

function formatPriceTooltip(point: PriceDistributionPoint, priceType: PriceType) {
  const basisLabel = priceType === "list" ? "정가" : "판매가";
  const basisPrice = point.basisPrice ? `${formatNumber(point.basisPrice)}원` : "-";
  const volume = point.volumeMl ? `${formatNumber(point.volumeMl)}ml/g` : "-";
  const lines = [
    `제품명: ${point.productName || point.goodsNo || "상품명 없음"}`,
    `성분명: ${point.ingredient}`,
    `10ml당 가격: ${formatNumber(point.value)}원`,
    `${basisLabel}: ${basisPrice}`,
    `용량: ${volume}`,
  ];

  if (point.goodsNo) lines.push(`goods_no: ${point.goodsNo}`);
  return lines.join("\n");
}

function getPriceDistributionHighlights(items: PriceDistributionItem[]) {
  const points = items.flatMap((item) => [
    ...getPricePoints(item, "sale").map((point) => ({ ...point, priceBasis: "판매가" })),
    ...getPricePoints(item, "list").map((point) => ({ ...point, priceBasis: "정가" })),
  ]);

  return points
    .filter((point) => Number.isFinite(point.value))
    .sort((a, b) => b.value - a.value)
    .slice(0, 8)
    .map((point) => ({
      ingredient: point.ingredient,
      productName: point.productName || point.goodsNo || "상품명 없음",
      goodsNo: point.goodsNo || "",
      priceBasis: point.priceBasis,
      pricePer10ml: point.value,
      basisPrice: point.basisPrice,
      volumeMl: point.volumeMl,
    }));
}

function buildPage1InsightPayload(data: DashboardData, loadState: DataLoadState) {
  return {
    functionTop5: data.page1.functionRisers.map((item) => ({
      label: item.label,
      weekOverWeekGrowthRate: roundNumber(Number(item.growth || 0), 1),
      currentWeekSearchIndex: roundNumber(Number(item.searchIndex || 0), 1),
    })),
    ingredientTop5: data.page1.ingredientPopularity.map((item) => ({
      label: item.label,
      weekOverWeekGrowthRate: roundNumber(Number(item.growth || 0), 1),
      currentWeekSearchIndex: roundNumber(Number(item.searchIndex || 0), 1),
    })),
    priceOutliers: getPriceDistributionHighlights(data.page1.priceDistribution),
    demandSupplyMatrix: data.page1.demandSupplyMatrix.map((item) => ({
      ingredient: item.ingredient,
      demandScore: roundNumber(item.demand, 1),
      supplyScore: roundNumber(item.supply, 1),
      weekOverWeekDemandGrowthRate: roundNumber(item.growth, 1),
      quadrant: STATUS_LABELS[item.status],
    })),
    dataAvailability: {
      functionTop5: loadState.dashboardSignalsError || (data.page1.functionRisers.length ? "ready" : DATALAB_WEEKLY_API_REQUIRED_MESSAGE),
      ingredientTop5: loadState.dashboardSignalsError || (data.page1.ingredientPopularity.length ? "ready" : DATALAB_WEEKLY_API_REQUIRED_MESSAGE),
      priceDistribution: loadState.priceDistributionError || (getPriceDistributionHighlights(data.page1.priceDistribution).length ? "ready" : "가격 데이터 없음"),
      demandSupplyMatrix: loadState.demandSupplyMatrixError || (data.page1.demandSupplyMatrix.length ? "ready" : NAVER_DEMAND_API_REQUIRED_MESSAGE),
    },
  };
}

function buildPage1DecisionInsights(payload: ReturnType<typeof buildPage1InsightPayload>) {
  const insights: string[] = [];
  const topFunction = payload.functionTop5[0];
  const topIngredient = payload.ingredientTop5[0];
  const demandOpportunities = payload.demandSupplyMatrix
    .map((item) => ({
      ...item,
      gap: Number(item.demandScore || 0) - Number(item.supplyScore || 0),
    }))
    .sort((a, b) => b.gap - a.gap);
  const strongestOpportunity = demandOpportunities.find((item) => item.gap > 0);
  const oversupplyRisk = demandOpportunities.slice().sort((a, b) => a.gap - b.gap).find((item) => item.gap < 0);
  const priceOutlier = payload.priceOutliers[0];

  if (topFunction) {
    insights.push(`${topFunction.label} 기능 검색이 전주 대비 ${formatPct(topFunction.weekOverWeekGrowthRate)} 움직였습니다. 관련 성분과 효능 카피를 신제품 후보군 또는 기획전 테마로 우선 검토하세요.`);
  }
  if (topIngredient) {
    insights.push(`${withTopicParticle(topIngredient.label)} 현재 성분 관심도 상위권입니다. 같은 효능군의 상품 수와 가격대를 함께 보고 주력 SKU 확대 여부를 판단하는 것이 좋습니다.`);
  }
  if (strongestOpportunity) {
    insights.push(`${strongestOpportunity.ingredient}는 수요 점수(${strongestOpportunity.demandScore})가 공급 점수(${strongestOpportunity.supplyScore})보다 높아 기획 공백이 있습니다. 소싱, 샘플링, 상세페이지 효능 근거를 먼저 점검하세요.`);
  }
  if (oversupplyRisk) {
    insights.push(`${oversupplyRisk.ingredient}는 공급 점수(${oversupplyRisk.supplyScore})가 수요 점수(${oversupplyRisk.demandScore})보다 높습니다. 재고와 광고비를 늘리기보다 차별 포인트가 있는 SKU 중심으로 압축하세요.`);
  }
  if (priceOutlier) {
    insights.push(`${priceOutlier.ingredient} 고가 상품군은 10ml당 ${formatNumber(priceOutlier.pricePer10ml)}원 수준까지 형성되어 있습니다. 프리미엄 포지션은 용량 대비 효능 근거와 리뷰 증거를 함께 제시해야 합니다.`);
  }

  return ensureDashboardInsights(insights, [
    "검색 관심도, 공급 점수, 가격 분포를 함께 보면 지금은 단일 지표보다 성분별 수요-공급 격차가 큰 후보부터 MD 리소스를 배분하는 편이 효율적입니다.",
    "데이터가 일부 비어 있는 지표는 의사결정 확정 근거가 아니라 후보 선별 신호로만 사용하고, 실제 상품 상세와 리뷰 검증을 추가로 붙이세요.",
  ]);
}


function getConcernMetricLabel(metrics: ConcernMetric[], key: string) {
  return metrics.find((metric) => metric.key === key || metric.legacyKey === key)?.label || key;
}

function withTopicParticle(value: string) {
  const text = String(value || "").trim();
  if (!text) return "";
  const lastChar = Array.from(text).at(-1) || "";
  const code = lastChar.charCodeAt(0);
  const hasBatchim = code >= 0xac00 && code <= 0xd7a3 ? (code - 0xac00) % 28 > 0 : false;
  return `${text}${hasBatchim ? "은" : "는"}`;
}

function ensureDashboardInsights(insights: string[], fallback: string[], minItems = 2, maxItems = 5) {
  const unique: string[] = [];

  insights.forEach((item) => {
    const text = String(item || "").trim();
    if (!text || unique.includes(text)) return;
    unique.push(text);
  });
  fallback.forEach((item) => {
    if (unique.length >= minItems) return;
    const text = String(item || "").trim();
    if (!text || unique.includes(text)) return;
    unique.push(text);
  });

  return unique.slice(0, maxItems);
}

function roundNumber(value: number, digits = 0) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function getProductGrowth(item: MarketProduct) {
  const growth = Number(item.product_growth_rate);
  if (Number.isFinite(growth)) return growth;
  const current = Number(item.product_count || 0);
  const previous = Number(item.previous_product_count || 0);
  return previous > 0 ? ((current - previous) / previous) * 100 : 0;
}

function getGrowthDisplay(growthRate: number) {
  const growth = Number(growthRate || 0);
  if (growth > 0) return { text: `▲ +${growth.toFixed(1)}%`, color: "#059669" };
  if (growth < 0) return { text: `▼ ${growth.toFixed(1)}%`, color: "#dc2626" };
  return { text: "― 0.0%", color: "#64748b" };
}


function getSeverityClass(severity: AlertItem["severity"]) {
  if (severity === "high") return "high";
  if (severity === "low") return "low";
  return "medium";
}

function DataStatusCard({
  meta,
  isLoading,
  error,
  onRefresh,
}: {
  meta: DashboardMeta;
  isLoading: boolean;
  error: string;
  onRefresh: () => void;
}) {
  return (
    <div className="data-status-card">
      <div className="data-status-copy">
        <div className="data-status-line">
          <span>마지막 업데이트</span>
          <strong>{meta.lastUpdated}</strong>
        </div>
        <div className="data-status-line">
          <span>데이터 소스</span>
          <strong>{error ? "연결 오류" : isLoading ? "연결 중" : "Naver DataLab"}</strong>
        </div>
      </div>
      <TooltipButton
        tooltip="Naver DataLab 새로고침"
        className="btn btn-outline update-data-button"
        onClick={onRefresh}
      >
        {isLoading ? "…" : "↻"}
      </TooltipButton>
    </div>
  );
}

function SupabaseStatusCard({
  isLoading,
  earliestDate,
  onRefresh,
}: {
  isLoading: boolean;
  earliestDate: string | null;
  onRefresh: () => void;
}) {
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="data-status-card">
      <div className="data-status-copy">
        <div className="data-status-line">
          <span>기준일</span>
          <strong>{earliestDate ? `${earliestDate} ~ ${today}` : "수집 데이터 없음"}</strong>
        </div>
        <div className="data-status-line">
          <span>데이터 소스</span>
          <strong>{isLoading ? "연결 중" : "Supabase"}</strong>
        </div>
      </div>
      <TooltipButton
        tooltip="Supabase 새로고침"
        className="btn update-data-button"
        onClick={onRefresh}
        style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", color: "#16a34a" } as React.CSSProperties}
      >
        {isLoading ? "…" : "↻"}
      </TooltipButton>
    </div>
  );
}

function PageHeader({
  badge,
  title,
  description,
  actions,
  statusCard,
  compact = false,
}: {
  badge: string;
  title: string;
  description: string;
  actions?: ReactNode;
  statusCard: ReactNode;
  compact?: boolean;
}) {
  return (
    <header className={`page-header ${compact ? "compact-page-header" : ""}`}>
      <div>
        <span className="page-badge">{badge}</span>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      <div className="page-header-actions">
        {actions}
        <div className="data-status-slot">
          {statusCard}
        </div>
      </div>
    </header>
  );
}

function SummaryStrip({ summary, page1 }: { summary: Page1Summary; page1: DashboardData["page1"] }) {
  const [showRisingTooltip, setShowRisingTooltip] = useState(false);
  const [showRiskTooltip, setShowRiskTooltip] = useState(false);

  const items = [
    ["분석 제품 수", `${formatNumber(summary.analyzedProducts)}개`, "▯", ""],
    ["분석 성분 수", `${formatNumber(summary.analyzedIngredients)}개`, "◎", "green"],
    ["시장 검색 관심도", formatPct(summary.totalSearchGrowthRate), "▴", "positive"],
    ["신제품 기획 후보", `${formatNumber(summary.risingIngredientCount)}개`, "⚡", "blue"],
    ["재고 리스크 성분", `${formatNumber(summary.supplyShortageIngredientCount)}개`, "△", "warning"],
  ];

  return (
    <div className="summary-strip">
      {items.map(([label, value, icon, tone]) => {
        const isRising = label === "신제품 기획 후보";
        const isRisk = label === "재고 리스크 성분";
        return (
          <div className={`summary-chip ${tone}`} key={label} style={{ position: "relative" }}>
            <div className="summary-icon">{icon}</div>
            <div>
              <span>
                {label}
                {(isRising || isRisk) && (
                  <button
                    type="button"
                    onClick={() => isRising ? setShowRisingTooltip((prev) => !prev) : setShowRiskTooltip((prev) => !prev)}
                    style={{ background: "none", border: "none", cursor: "pointer", padding: "0 2px", fontSize: "0.75em", opacity: 0.6, verticalAlign: "middle" }}
                    aria-label="산출 기준 보기"
                  >
                    ⓘ
                  </button>
                )}
              </span>
              <strong>{value}</strong>
            </div>
            {isRising && showRisingTooltip && (() => {
              const candidates = page1.demandSupplyMatrix.filter(
                (item) => item.status === "opportunity" || item.status === "shortage",
              );
              return (
                <div
                  style={{
                    position: "absolute",
                    top: "calc(100% + 8px)",
                    left: 0,
                    zIndex: 10,
                    background: "#fff",
                    border: "1px solid #d8e0ee",
                    borderRadius: 10,
                    boxShadow: "0 8px 24px rgba(15,23,42,.12)",
                    padding: "12px 14px",
                    minWidth: 220,
                    maxWidth: 280,
                  }}
                >
                  <strong style={{ display: "block", marginBottom: 6, fontSize: "0.8rem" }}>신제품 기획 후보 산출 기준</strong>
                  <p style={{ margin: 0, marginBottom: candidates.length ? 10 : 0, fontSize: "0.75rem", color: "#4b5563", lineHeight: 1.55 }}>
                    네이버 검색 관심도 상승률이 높고 시장 수요 신호가 확인된 성분을 후보로 집계했습니다.
                  </p>
                  {candidates.length > 0 && (
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.75rem" }}>
                      <thead>
                        <tr style={{ background: "#f8fafc" }}>
                          <th style={{ padding: "5px 8px", textAlign: "left", borderBottom: "1px solid #e2e8f0", fontWeight: 600, color: "#64748b" }}>성분</th>
                          <th style={{ padding: "5px 8px", textAlign: "right", borderBottom: "1px solid #e2e8f0", fontWeight: 600, color: "#64748b" }}>수요</th>
                          <th style={{ padding: "5px 8px", textAlign: "right", borderBottom: "1px solid #e2e8f0", fontWeight: 600, color: "#64748b" }}>공급</th>
                        </tr>
                      </thead>
                      <tbody>
                        {candidates.map((item, i) => (
                          <tr key={item.ingredient} style={{ background: i % 2 === 0 ? "#fff" : "#f8fafc" }}>
                            <td style={{ padding: "5px 8px", borderBottom: "1px solid #e2e8f0" }}>{item.ingredient}</td>
                            <td style={{ padding: "5px 8px", textAlign: "right", borderBottom: "1px solid #e2e8f0", color: "#3FA7B5", fontWeight: 600 }}>{item.demand.toFixed(1)}</td>
                            <td style={{ padding: "5px 8px", textAlign: "right", borderBottom: "1px solid #e2e8f0", color: "#64748b" }}>{item.supply.toFixed(1)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                  {!candidates.length && (
                    <p style={{ margin: 0, fontSize: "0.75rem", color: "#9ca3af" }}>매트릭스 데이터 로딩 중입니다.</p>
                  )}
                </div>
              );
            })()}
            {isRisk && showRiskTooltip && (() => {
              const riskItems = page1.demandSupplyMatrix.filter((item) => item.status === "oversupply");
              return (
                <div
                  style={{
                    position: "absolute",
                    top: "calc(100% + 8px)",
                    left: 0,
                    zIndex: 10,
                    background: "#fff",
                    border: "1px solid #d8e0ee",
                    borderRadius: 10,
                    boxShadow: "0 8px 24px rgba(15,23,42,.12)",
                    padding: "12px 14px",
                    minWidth: 220,
                    maxWidth: 280,
                  }}
                >
                  <strong style={{ display: "block", marginBottom: 6, fontSize: "0.8rem" }}>재고 리스크 성분 산출 기준</strong>
                  <p style={{ margin: 0, marginBottom: riskItems.length ? 10 : 0, fontSize: "0.75rem", color: "#4b5563", lineHeight: 1.55 }}>
                    검색 관심도 하락 또는 수급 불균형 가능성이 있는 성분을 재고 리스크 후보로 집계했습니다.
                  </p>
                  {riskItems.length > 0 && (
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.75rem" }}>
                      <thead>
                        <tr style={{ background: "#f8fafc" }}>
                          <th style={{ padding: "5px 8px", textAlign: "left", borderBottom: "1px solid #e2e8f0", fontWeight: 600, color: "#64748b" }}>성분</th>
                          <th style={{ padding: "5px 8px", textAlign: "right", borderBottom: "1px solid #e2e8f0", fontWeight: 600, color: "#64748b" }}>수요</th>
                          <th style={{ padding: "5px 8px", textAlign: "right", borderBottom: "1px solid #e2e8f0", fontWeight: 600, color: "#64748b" }}>공급</th>
                        </tr>
                      </thead>
                      <tbody>
                        {riskItems.map((item, i) => (
                          <tr key={item.ingredient} style={{ background: i % 2 === 0 ? "#fff" : "#f8fafc" }}>
                            <td style={{ padding: "5px 8px", borderBottom: "1px solid #e2e8f0" }}>{item.ingredient}</td>
                            <td style={{ padding: "5px 8px", textAlign: "right", borderBottom: "1px solid #e2e8f0", color: "#64748b" }}>{item.demand.toFixed(1)}</td>
                            <td style={{ padding: "5px 8px", textAlign: "right", borderBottom: "1px solid #e2e8f0", color: "#C97A9B", fontWeight: 600 }}>{item.supply.toFixed(1)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                  {!riskItems.length && (
                    <p style={{ margin: 0, fontSize: "0.75rem", color: "#9ca3af" }}>현재 표시할 세부 성분 데이터가 없습니다.</p>
                  )}
                </div>
              );
            })()}
          </div>
        );
      })}
    </div>
  );
}

function getSearchIndexChangeParts(item: RankItem) {
  const previous = Number(item.previousWeekIndex ?? 0);
  const current = Number(item.currentWeekIndex ?? item.searchIndex ?? 0);
  return `${previous.toFixed(1)} → ${current.toFixed(1)}`;
}

function RankList({
  items,
  barMetric,
  valueMetric = barMetric,
  valueFormatter,
  subValueFormatter,
  displayMode = "pct",
  barValue,
  isLoading,
  error,
  emptyMessage = DATALAB_WEEKLY_API_REQUIRED_MESSAGE,
  loadingMessage,
}: {
  items: RankItem[];
  barMetric: "growth" | "searchIndex";
  valueMetric?: "growth" | "searchIndex";
  valueFormatter?: (item: RankItem) => string;
  subValueFormatter?: (item: RankItem) => string;
  displayMode?: "pct" | "point";
  barValue?: (item: RankItem) => number;
  isLoading: boolean;
  error: string;
  emptyMessage?: string;
  loadingMessage?: string;
}) {
  if (!items.length) {
    return (
      <div className="empty-state api-state">
        {error || (isLoading ? loadingMessage || emptyMessage : emptyMessage)}
      </div>
    );
  }

  return (
    <div className="rank-list">
      {items.map((item, index) => (
        <div className="rank-item" key={`${item.label}-${index}`}>
          <div className="rank-index">{index + 1}</div>
          <div className="rank-body">
            <div className="rank-title">
              <IngredientTooltip label={item.label}>{item.label}</IngredientTooltip>
            </div>
            <div className="rank-bar">
              <span style={{ width: `${barValue ? getCustomRankBarWidth(item, items, barValue) : getRankBarWidth(item, items, barMetric)}%` }} />
            </div>
          </div>
          <div className="rank-value">
            {valueFormatter ? (
              <>
                <strong>{valueFormatter(item)}</strong>
                {subValueFormatter && (
                  <span style={{ fontSize: "0.72em", color: "#94a3b8" }}>{subValueFormatter(item)}</span>
                )}
              </>
            ) : valueMetric === "growth" ? (
              <>
                {displayMode === "point" ? (() => {
                  const diff = Number(item.currentWeekIndex ?? 0) - Number(item.previousWeekIndex ?? 0);
                  return (
                    <strong style={{ color: diff >= 0 ? "#059669" : "#dc2626" }}>
                      {diff >= 0 ? "+" : ""}{diff.toFixed(1)}p
                    </strong>
                  );
                })() : (
                  <strong style={{ color: Number(item.growth) >= 0 ? "#059669" : "#dc2626" }}>
                    {formatPct(item.growth)}
                  </strong>
                )}
                <span style={{ fontSize: "0.72em", color: "#64748b" }}>
                  {getSearchIndexChangeParts(item)}
                </span>
              </>
            ) : (
              <strong>{formatNumber(Math.round(Number(item.searchIndex || 0)))}</strong>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}


function AlertSummaryChip({
  label,
  value,
  tone,
  tooltipTitle,
  tooltipDesc,
  matrixItems,
  alertItems,
  matrixDemandColor,
  matrixSupplyColor,
}: {
  label: string;
  value: string;
  tone: string;
  tooltipTitle?: string;
  tooltipDesc?: string;
  matrixItems?: DemandSupplyItem[];
  alertItems?: AlertItem[];
  matrixDemandColor?: string;
  matrixSupplyColor?: string;
}) {
  const [open, setOpen] = useState(false);
  const hasTooltip = Boolean(tooltipTitle);

  return (
    <div className={`summary-chip ${tone}`} style={{ position: "relative" }}>
      <span>
        {label}
        {hasTooltip && (
          <button
            type="button"
            onClick={() => setOpen((prev) => !prev)}
            style={{ background: "none", border: "none", cursor: "pointer", padding: "0 2px", fontSize: "0.75em", opacity: 0.6, verticalAlign: "middle" }}
            aria-label="산출 기준 보기"
          >
            ⓘ
          </button>
        )}
      </span>
      <strong>{value}</strong>
      {hasTooltip && open && (
        <div style={{
          position: "absolute",
          top: "calc(100% + 8px)",
          left: 0,
          zIndex: 10,
          background: "#fff",
          border: "1px solid #d8e0ee",
          borderRadius: 10,
          boxShadow: "0 8px 24px rgba(15,23,42,.12)",
          padding: "12px 14px",
          minWidth: 220,
          maxWidth: 280,
        }}>
          <strong style={{ display: "block", marginBottom: 6, fontSize: "0.8rem" }}>{tooltipTitle}</strong>
          <p style={{ margin: 0, marginBottom: (matrixItems?.length || alertItems?.length) ? 10 : 0, fontSize: "0.75rem", color: "#4b5563", lineHeight: 1.55 }}>
            {tooltipDesc}
          </p>
          {matrixItems && matrixItems.length > 0 && (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.75rem" }}>
              <thead>
                <tr style={{ background: "#f8fafc" }}>
                  <th style={{ padding: "5px 8px", textAlign: "left", borderBottom: "1px solid #e2e8f0", fontWeight: 600, color: "#64748b" }}>성분</th>
                  <th style={{ padding: "5px 8px", textAlign: "right", borderBottom: "1px solid #e2e8f0", fontWeight: 600, color: "#64748b" }}>수요</th>
                  <th style={{ padding: "5px 8px", textAlign: "right", borderBottom: "1px solid #e2e8f0", fontWeight: 600, color: "#64748b" }}>공급</th>
                </tr>
              </thead>
              <tbody>
                {matrixItems.map((item, i) => (
                  <tr key={item.ingredient} style={{ background: i % 2 === 0 ? "#fff" : "#f8fafc" }}>
                    <td style={{ padding: "5px 8px", borderBottom: "1px solid #e2e8f0" }}>{item.ingredient}</td>
                    <td style={{ padding: "5px 8px", textAlign: "right", borderBottom: "1px solid #e2e8f0", color: matrixDemandColor || "#3FA7B5", fontWeight: 600 }}>{item.demand.toFixed(1)}</td>
                    <td style={{ padding: "5px 8px", textAlign: "right", borderBottom: "1px solid #e2e8f0", color: matrixSupplyColor || "#64748b" }}>{item.supply.toFixed(1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {alertItems && alertItems.length > 0 && (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.75rem" }}>
              <thead>
                <tr style={{ background: "#f8fafc" }}>
                  <th style={{ padding: "5px 8px", textAlign: "left", borderBottom: "1px solid #e2e8f0", fontWeight: 600, color: "#64748b" }}>성분</th>
                  <th style={{ padding: "5px 8px", textAlign: "right", borderBottom: "1px solid #e2e8f0", fontWeight: 600, color: "#64748b" }}>등급</th>
                </tr>
              </thead>
              <tbody>
                {alertItems.map((item, i) => (
                  <tr key={item.id} style={{ background: i % 2 === 0 ? "#fff" : "#f8fafc" }}>
                    <td style={{ padding: "5px 8px", borderBottom: "1px solid #e2e8f0" }}>{item.ingredient_name}</td>
                    <td style={{ padding: "5px 8px", textAlign: "right", borderBottom: "1px solid #e2e8f0", fontWeight: 600, color: item.severity === "high" ? "#dc2626" : item.severity === "medium" ? "#f59e0b" : "#64748b" }}>
                      {ALERT_SEVERITY_LABELS[item.severity]}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {!matrixItems?.length && !alertItems?.length && (
            <p style={{ margin: 0, fontSize: "0.75rem", color: "#9ca3af" }}>현재 표시할 세부 성분 데이터가 없습니다.</p>
          )}
        </div>
      )}
    </div>
  );
}

function TooltipButton({
  children,
  tooltip,
  className,
  onClick,
  style,
}: {
  children: React.ReactNode;
  tooltip?: string;
  className?: string;
  style?: React.CSSProperties;
  onClick?: () => void;
}) {
  const [show, setShow] = useState(false);
  return (
    <div style={{ position: "relative", display: "inline-block" }}
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      <button type="button" className={className} style={style} onClick={onClick}>{children}</button>
      {show && tooltip && (
        <div style={{
          position: "absolute",
          bottom: "calc(100% + 5px)",
          left: "50%",
          transform: "translateX(-50%)",
          background: "#1e293b",
          color: "#f1f5f9",
          borderRadius: 5,
          padding: "3px 8px",
          fontSize: "0.65rem",
          fontWeight: 700,
          whiteSpace: "nowrap",
          zIndex: 30,
          pointerEvents: "none",
        }}>
          {tooltip}
        </div>
      )}
    </div>
  );
}

function OliveYoungStandardNote() {
  const [visible, setVisible] = useState(false);

  return (
    <div
      style={{ position: "relative", textAlign: "right", fontSize: "0.68rem", color: "#9ca3af", marginTop: "auto", paddingTop: 8, cursor: "default", display: "inline-block", width: "100%" }}
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
    >
      * 평균 상품 순위
      {visible && (
        <div style={{
          position: "absolute",
          bottom: "calc(100% + 8px)",
          right: 0,
          background: "#ffffff",
          border: "1px solid #e2e8f0",
          borderRadius: 12,
          padding: "12px 14px",
          width: 272,
          zIndex: 20,
          pointerEvents: "none",
          boxShadow: "0 12px 32px rgba(15,23,42,.10), 0 2px 8px rgba(15,23,42,.06)",
          textAlign: "left",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 7 }}>
            <span style={{ fontSize: "0.65rem", fontWeight: 700, background: "#fff1f2", color: "#e11d48", borderRadius: 4, padding: "2px 6px", letterSpacing: "0.03em" }}>OliveYoung</span>
            <span style={{ fontSize: "0.72rem", fontWeight: 600, color: "#334155" }}>성분 인기 점수 기준</span>
          </div>
          <p style={{ margin: 0, marginBottom: 8, fontSize: "0.72rem", color: "#475569", lineHeight: 1.65 }}>
            최신 랭킹 데이터에서 각 상품의 순위를 역산해 점수를 부여합니다. 높은 순위 상품을 많이 포함한 성분일수록 점수가 높습니다.
          </p>
          <div style={{ background: "#f8fafc", borderRadius: 6, padding: "6px 8px", fontSize: "0.7rem", color: "#64748b", lineHeight: 1.6, marginBottom: 8 }}>
            점수 = Σ (최대순위 − 상품순위 + 1)
          </div>
          <div style={{ borderTop: "1px solid #f1f5f9", paddingTop: 7, fontSize: "0.65rem", color: "#94a3b8" }}>
            표시값 · 해당 성분 포함 상품들의 평균 순위
          </div>
        </div>
      )}
    </div>
  );
}

function NaverStandardNote({ label }: { label: string }) {
  const [visible, setVisible] = useState(false);

  return (
    <div
      style={{ position: "relative", textAlign: "right", fontSize: "0.68rem", color: "#9ca3af", marginTop: "auto", paddingTop: 8, cursor: "default", display: "inline-block", width: "100%" }}
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
    >
      * {label}
      {visible && (
        <div style={{
          position: "absolute",
          bottom: "calc(100% + 8px)",
          right: 0,
          background: "#ffffff",
          border: "1px solid #e2e8f0",
          borderRadius: 12,
          padding: "12px 14px",
          width: 272,
          zIndex: 20,
          pointerEvents: "none",
          boxShadow: "0 12px 32px rgba(15,23,42,.10), 0 2px 8px rgba(15,23,42,.06)",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 7 }}>
            <span style={{ fontSize: "0.65rem", fontWeight: 700, background: "#eff6ff", color: "#2563eb", borderRadius: 4, padding: "2px 6px", letterSpacing: "0.03em" }}>Naver DataLab</span>
            <span style={{ fontSize: "0.72rem", fontWeight: 600, color: "#334155" }}>검색 관심도 지수</span>
          </div>
          <p style={{ margin: 0, marginBottom: 8, fontSize: "0.72rem", color: "#475569", lineHeight: 1.65 }}>
            해당 검색어가 검색된 횟수를 주/월별 각각 합산하여 조회기간 내 최다 검색량을 100으로 설정한 상대 지수입니다.
          </p>
          <div style={{ borderTop: "1px solid #f1f5f9", paddingTop: 7, fontSize: "0.65rem", color: "#94a3b8" }}>
            출처 · developers.naver.com/datalab
          </div>
        </div>
      )}
    </div>
  );
}

function InsightList({ items, fallback }: { items: string[]; fallback?: string }) {
  if (!items.length) {
    return fallback ? <div className="empty-state api-state">{fallback}</div> : null;
  }

  return (
    <div className="insight-list">
      {items.map((item) => (
        <div className="insight-item" key={item}>
          {item}
        </div>
      ))}
    </div>
  );
}

function PriceDistributionPlot({
  items,
  priceType,
  isLoading,
  error,
}: {
  items: PriceDistributionItem[];
  priceType: PriceType;
  isLoading: boolean;
  error: string;
}) {
  const [tooltip, setTooltip] = useState<{ point: PriceDistributionPoint; x: number; y: number } | null>(null);
  const allValues = items
    .flatMap((item) => getPricePoints(item, priceType).map((point) => point.value))
    .filter((value) => Number.isFinite(value));
  const width = 640;
  const height = 276;
  const padding = { top: 24, right: 32, bottom: 52, left: 58 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;

  if (!allValues.length) {
    return (
      <div className="plot-shell chart-shell">
        <div className="empty-state api-state">
          {error ? `Supabase 오류: ${error}` : isLoading ? "Supabase에서 가격 데이터를 불러오는 중입니다." : "표시할 가격 데이터가 없습니다."}
        </div>
      </div>
    );
  }

  const { min, max } = getPriceAxisRange(allValues);
  const yFor = (value: number) => padding.top + ((max - value) / Math.max(1, max - min)) * plotHeight;
  const showTooltip = (event: MouseEvent<SVGElement>, point: PriceDistributionPoint) => {
    const container = event.currentTarget.ownerSVGElement?.parentElement;
    const rect = container?.getBoundingClientRect();
    setTooltip({
      point,
      x: rect ? event.clientX - rect.left + 12 : 16,
      y: rect ? event.clientY - rect.top + 12 : 16,
    });
  };

  return (
    <div className="plot-shell chart-shell" style={{ position: "relative" }}>
      <svg className="chart-svg" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="주요 성분 가격 분포" onMouseLeave={() => setTooltip(null)}>
        {[0, 0.25, 0.5, 0.75, 1].map((tick) => {
          const y = padding.top + tick * plotHeight;
          const value = Math.round(max - tick * (max - min));
          return (
            <g key={tick}>
              <line x1={padding.left} x2={width - padding.right} y1={y} y2={y} className="chart-grid-line" />
              <text x={padding.left - 10} y={y + 4} className="chart-axis-label" textAnchor="end">
                {formatNumber(value)}
              </text>
            </g>
          );
        })}
        {items.map((item, index) => {
          const pricePoints = getPricePoints(item, priceType).slice().sort((a, b) => a.value - b.value);
          const values = pricePoints.map((point) => point.value);
          const x = padding.left + (plotWidth / items.length) * (index + 0.5);
          const color = CHART_COLORS[index % CHART_COLORS.length];

          if (!values.length) {
            return (
              <g key={item.ingredient}>
                <text x={x} y={padding.top + plotHeight / 2} className="chart-axis-label" textAnchor="middle">
                  데이터 없음
                </text>
                <text x={x} y={height - 18} className="chart-axis-label" textAnchor="middle">
                  {item.ingredient}
                </text>
              </g>
            );
          }

          const localMin = values[0];
          const localMax = values[values.length - 1];
          const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
          const q1 = getQuantile(values, 0.25);
          const q3 = getQuantile(values, 0.75);
          const boxY = yFor(q3);
          const boxHeight = Math.max(8, yFor(q1) - boxY);
          const displayPoints = getDisplayPricePoints(pricePoints);
          const representativePoint = pricePoints[pricePoints.length - 1];

          return (
            <g key={item.ingredient}>
              {localMin === localMax ? (
                <ellipse
                  cx={x}
                  cy={yFor(mean)}
                  rx="28"
                  ry="9"
                  fill={color}
                  opacity="0.18"
                  stroke={color}
                  style={{ cursor: "help" }}
                  onMouseEnter={(event) => showTooltip(event, representativePoint)}
                  onMouseMove={(event) => showTooltip(event, representativePoint)}
                />
              ) : (
                <path
                  d={getViolinPath(values, x, yFor, 30)}
                  fill={color}
                  opacity="0.18"
                  stroke={color}
                  strokeWidth="1.5"
                  style={{ cursor: "help" }}
                  onMouseEnter={(event) => showTooltip(event, representativePoint)}
                  onMouseMove={(event) => showTooltip(event, representativePoint)}
                />
              )}
              <line x1={x} x2={x} y1={yFor(localMin)} y2={yFor(localMax)} stroke={color} strokeWidth="2.5" strokeLinecap="round" opacity="0.56" />
              <rect x={x - 10} y={boxY} width="20" height={boxHeight} rx="6" fill="#ffffff" opacity="0.82" stroke={color} strokeWidth="1.4" />
              <line x1={x - 20} x2={x + 20} y1={yFor(mean)} y2={yFor(mean)} stroke={color} strokeWidth="3" strokeLinecap="round" />
              {displayPoints.map((point, valueIndex) => (
                <g
                  key={`${item.ingredient}-${point.value}-${point.goodsNo || valueIndex}`}
                  onMouseEnter={(event) => showTooltip(event, point)}
                  onMouseMove={(event) => showTooltip(event, point)}
                  onMouseLeave={() => setTooltip(null)}
                  style={{ cursor: "help", outline: "none" }}
                >
                  <circle
                    cx={x + ((valueIndex * 19) % 17) - 8}
                    cy={yFor(point.value)}
                    r="7"
                    fill="transparent"
                  />
                  <circle
                    cx={x + ((valueIndex * 19) % 17) - 8}
                    cy={yFor(point.value)}
                    r="2.5"
                    fill={color}
                    opacity="0.58"
                  >
                    <title>{formatPriceTooltip(point, priceType)}</title>
                  </circle>
                </g>
              ))}
              <text x={x} y={padding.top - 7} className="chart-axis-label" textAnchor="middle">
                {values.length}개
              </text>
              <text x={x} y={height - 18} className="chart-axis-label" textAnchor="middle">
                {item.ingredient}
              </text>
            </g>
          );
        })}
      </svg>
      {tooltip ? (
        <div
          role="tooltip"
          style={{
            position: "absolute",
            left: tooltip.x,
            top: tooltip.y,
            maxWidth: 260,
            padding: "10px 12px",
            borderRadius: 10,
            border: "1px solid #d8e0ee",
            background: "#ffffff",
            boxShadow: "0 14px 30px rgba(15, 23, 42, .14)",
            color: "#263244",
            fontSize: 12,
            fontWeight: 800,
            lineHeight: 1.55,
            pointerEvents: "none",
            zIndex: 5,
            whiteSpace: "pre-line",
          }}
        >
          {formatPriceTooltip(tooltip.point, priceType)}
        </div>
      ) : null}
    </div>
  );
}

function MatrixLegend() {
  return (
    <div className="matrix-legend">
      {MATRIX_STATUS_KEYS.map((key) => (
        <div className="legend-pill" key={key}>
          <span className="legend-dot" style={{ background: STATUS_COLORS[key] }} />
          <span>{STATUS_LABELS[key]}</span>
        </div>
      ))}
    </div>
  );
}

type MatrixTooltipState = {
  item: DemandSupplyItem;
  x: number;
  y: number;
};

function formatMatrixScore(value?: number) {
  if (!Number.isFinite(Number(value))) return "-";
  return Number(value).toFixed(1);
}

function formatMatrixChange(value?: number) {
  if (!Number.isFinite(Number(value))) return "-";
  const number = Number(value);
  return `${number > 0 ? "+" : ""}${number.toFixed(1)}%`;
}

function MatrixBubbleTooltip({ tooltip }: { tooltip: MatrixTooltipState }) {
  const { item } = tooltip;
  const desc = getIngredientDescription(item.ingredient);

  return (
    <div
      role="tooltip"
      className="matrix-tooltip"
      style={{ left: tooltip.x, top: tooltip.y }}
    >
      <div className="matrix-tooltip-title">{item.ingredient}</div>
      {desc && (
        <div className="matrix-tooltip-desc">{desc.summary}</div>
      )}
      <div className="matrix-tooltip-grid">
        <span>영역</span>
        <strong>{STATUS_LABELS[item.status]}</strong>
        <span>수요점수</span>
        <strong>{formatMatrixScore(item.demand)}</strong>
        <span>공급점수</span>
        <strong>{formatMatrixScore(item.supply)}</strong>
        <span>이전 수요</span>
        <strong>{formatMatrixScore(item.previousDemand)}</strong>
        <span>이전 공급</span>
        <strong>{formatMatrixScore(item.previousSupply)}</strong>
        <span>수요 증감률</span>
        <strong className={Number(item.demandWow ?? item.growth ?? 0) >= 0 ? "positive" : "negative"}>
          {formatMatrixChange(item.demandWow ?? item.growth)}
        </strong>
        <span>공급 증감률</span>
        <strong className={Number(item.supplyWow ?? 0) >= 0 ? "positive" : "negative"}>
          {formatMatrixChange(item.supplyWow)}
        </strong>
        <span>제품 수</span>
        <strong>{item.supplyCount !== undefined ? `${formatNumber(item.supplyCount)}개` : "-"}</strong>
        <span>수요-공급 격차</span>
        <strong className={Number(item.gap ?? 0) >= 0 ? "positive" : "negative"}>
          {formatMatrixScore(item.gap)}
        </strong>
      </div>
    </div>
  );
}

function DemandSupplyPlot({
  items,
  isLoading,
  error,
  threshold = DEFAULT_DEMAND_SUPPLY_MATRIX_CONFIG.threshold,
}: {
  items: DemandSupplyItem[];
  isLoading: boolean;
  error: string;
  threshold?: number;
}) {
  const [tooltip, setTooltip] = useState<MatrixTooltipState | null>(null);
  const shellRef = useRef<HTMLDivElement | null>(null);
  const width = 720;
  const height = 420;
  const padding = { top: 34, right: 38, bottom: 48, left: 58 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const xFor = (value: number) => padding.left + (value / 100) * plotWidth;
  const yFor = (value: number) => padding.top + ((100 - value) / 100) * plotHeight;

  const clampTooltipPosition = (x: number, y: number) => {
    const rect = shellRef.current?.getBoundingClientRect();
    const maxX = Math.max(12, (rect?.width || 0) - 310);
    const maxY = Math.max(12, (rect?.height || 0) - 250);

    return {
      x: Math.min(Math.max(x, 12), maxX),
      y: Math.min(Math.max(y, 12), maxY),
    };
  };

  const showTooltipFromPointer = (item: DemandSupplyItem, event: MouseEvent<SVGElement>) => {
    const rect = shellRef.current?.getBoundingClientRect();
    if (!rect) return;
    const position = clampTooltipPosition(event.clientX - rect.left + 14, event.clientY - rect.top + 14);
    setTooltip({ item, ...position });
  };

  const showTooltipFromBubble = (item: DemandSupplyItem) => {
    const rect = shellRef.current?.getBoundingClientRect();
    const renderedWidth = rect?.width || width;
    const renderedHeight = rect?.height || height;
    const position = clampTooltipPosition(
      (xFor(item.supply) / width) * renderedWidth + 12,
      (yFor(item.demand) / height) * renderedHeight + 12,
    );
    setTooltip({ item, ...position });
  };

  if (!items.length) {
    return (
      <div className="plot-shell chart-shell">
        <div className="empty-state api-state">
          {error ? error : isLoading ? "수요-공급 데이터를 불러오는 중입니다." : NAVER_DEMAND_API_REQUIRED_MESSAGE}
        </div>
      </div>
    );
  }

  return (
    <div className="plot-shell chart-shell matrix-chart-shell" ref={shellRef}>
      <svg className="chart-svg" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="수요 공급 매트릭스">
        <rect x={xFor(0)} y={yFor(100)} width={xFor(threshold) - xFor(0)} height={yFor(threshold) - yFor(100)} fill="rgba(63, 167, 181, .10)" />
        <rect x={xFor(threshold)} y={yFor(100)} width={xFor(100) - xFor(threshold)} height={yFor(threshold) - yFor(100)} fill="rgba(90, 170, 110, .11)" />
        <rect x={xFor(0)} y={yFor(threshold)} width={xFor(threshold) - xFor(0)} height={yFor(0) - yFor(threshold)} fill="rgba(123, 132, 147, .08)" />
        <rect x={xFor(threshold)} y={yFor(threshold)} width={xFor(100) - xFor(threshold)} height={yFor(0) - yFor(threshold)} fill="rgba(201, 122, 155, .10)" />
        {[0, 20, 40, 60, 80, 100].map((tick) => (
          <g key={`x-${tick}`}>
            <line x1={xFor(tick)} x2={xFor(tick)} y1={padding.top} y2={height - padding.bottom} className="chart-grid-line" />
            <text x={xFor(tick)} y={height - 20} className="chart-axis-label" textAnchor="middle">
              {tick}
            </text>
          </g>
        ))}
        {[0, 20, 40, 60, 80, 100].map((tick) => (
          <g key={`y-${tick}`}>
            <line x1={padding.left} x2={width - padding.right} y1={yFor(tick)} y2={yFor(tick)} className="chart-grid-line" />
            <text x={padding.left - 10} y={yFor(tick) + 4} className="chart-axis-label" textAnchor="end">
              {tick}
            </text>
          </g>
        ))}
        <line x1={xFor(threshold)} x2={xFor(threshold)} y1={padding.top} y2={height - padding.bottom} className="chart-threshold-line" />
        <line x1={padding.left} x2={width - padding.right} y1={yFor(threshold)} y2={yFor(threshold)} className="chart-threshold-line" />

        {items.map((item) => (
          typeof item.previousSupply === "number" && typeof item.previousDemand === "number"
            ? (() => {
              const startX = xFor(item.previousSupply || 0);
              const startY = yFor(item.previousDemand || 0);
              const endX = xFor(item.supply);
              const endY = yFor(item.demand);
              const radius = Math.max(10, item.size / 2);
              const movement = Math.hypot(endX - startX, endY - startY);
              const hasMovement = movement > 6;
              const trailSteps = movement > 42 ? 5 : movement > 24 ? 4 : 3;

              return hasMovement ? (
                <g key={`${item.ingredient}-trajectory`} className="matrix-trajectory" aria-hidden="true">
                  {Array.from({ length: trailSteps }).map((_, index) => {
                    const t = (index + 1) / (trailSteps + 1);
                    const cx = startX + (endX - startX) * t;
                    const cy = startY + (endY - startY) * t;
                    const trailRadius = Math.max(3, radius * (0.22 + t * 0.62));
                    const opacity = 0.12 + t * 0.24;

                    return (
                      <circle
                        key={`${item.ingredient}-trail-${index}`}
                        cx={cx}
                        cy={cy}
                        r={trailRadius}
                        className="matrix-trail-stamp"
                        style={{ fill: STATUS_COLORS[item.status], opacity }}
                      />
                    );
                  })}
                </g>
              ) : null;
            })()
            : null
        ))}

        {items.map((item) => {
          const bubbleX = xFor(item.supply);
          const bubbleY = yFor(item.demand);
          const radius = Math.max(10, item.size / 2);

          return (
            <g
              key={item.ingredient}
              className="matrix-bubble"
              tabIndex={0}
              role="button"
              aria-label={`${item.ingredient} 수요 ${Math.round(item.demand)}, 공급 ${Math.round(item.supply)}, ${STATUS_LABELS[item.status]}`}
              onMouseEnter={(event) => showTooltipFromPointer(item, event)}
              onMouseMove={(event) => showTooltipFromPointer(item, event)}
              onMouseLeave={() => setTooltip(null)}
              onFocus={() => showTooltipFromBubble(item)}
              onBlur={() => setTooltip(null)}
            >
              <circle
                cx={bubbleX}
                cy={bubbleY}
                r={radius}
                fill={STATUS_COLORS[item.status]}
                opacity="0.9"
                stroke="#ffffff"
                strokeWidth="2"
              />
              <text x={bubbleX} y={bubbleY - radius - 10} className="matrix-point-label" textAnchor="middle">
                {item.ingredient}
              </text>
            </g>
          );
        })}
        <text x={width / 2} y={height - 5} className="chart-axis-title" textAnchor="middle">공급 지수</text>
        <text x="16" y={height / 2} className="chart-axis-title" textAnchor="middle" transform={`rotate(-90 16 ${height / 2})`}>수요 지수</text>
      </svg>
      {tooltip ? <MatrixBubbleTooltip tooltip={tooltip} /> : null}
    </div>
  );
}

function formatTrendDateLabel(date: string) {
  const match = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return date;
  const [, , month, day] = match;
  return `${Number(month)}/${Number(day)}`;
}

function getTrendTickIndexes(length: number) {
  if (length <= 1) return [0];

  // 스냅샷처럼 데이터 포인트가 적을 때는 빠지는 날짜 없이 모두 표시한다.
  if (length <= 10) return Array.from({ length }, (_, index) => index);

  const maxTicks = 7;
  const indexes = Array.from({ length: maxTicks }, (_, index) => Math.round((index / Math.max(1, maxTicks - 1)) * (length - 1)));
  return Array.from(new Set(indexes));
}

function getTrendPointIndexes(length: number) {
  if (length <= 32) return Array.from({ length }, (_, index) => index);

  const maxPoints = 18;
  const indexes = Array.from({ length: maxPoints }, (_, index) => Math.round((index / Math.max(1, maxPoints - 1)) * (length - 1)));
  return Array.from(new Set(indexes));
}

function SearchTrendPlot({
  trend,
  isLoading,
  error,
}: {
  trend: DashboardData["page2"]["searchTrend"];
  isLoading: boolean;
  error: string;
}) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [selectedIngredients, setSelectedIngredients] = useState<Set<string>>(new Set());
  const containerRef = useRef<HTMLDivElement>(null);

  function toggleIngredient(ingredient: string) {
    setSelectedIngredients((prev) => {
      const next = new Set(prev);
      if (next.has(ingredient)) next.delete(ingredient);
      else next.add(ingredient);
      return next;
    });
  }

  const visibleSeries = selectedIngredients.size > 0
    ? trend.series.filter((s) => selectedIngredients.has(s.ingredient))
    : trend.series;

  if (!trend.dates.length || !trend.series.length) {
    return (
      <div className="plot-shell js-plot">
        <div className="empty-state api-state">
          {error ? `Naver DataLab 오류: ${error}` : isLoading ? "Naver DataLab API에서 검색 관심도 추이를 불러오는 중입니다." : "표시할 검색 관심도 데이터가 없습니다."}
        </div>
      </div>
    );
  }

  const width = 720;
  const height = 360;
  const padding = { top: 30, right: 30, bottom: 74, left: 58 };
  const plotWidth = width - padding.left - padding.right;
  const values = trend.series.flatMap((item) => item.values).filter((value) => Number.isFinite(Number(value)));
  const min = Math.max(0, Math.floor(Math.min(...values) - 5));
  const max = Math.min(105, Math.ceil(Math.max(...values) + 5));
  const xFor = (index: number) => padding.left + (index / Math.max(1, trend.dates.length - 1)) * plotWidth;
  const yFor = (value: number) => padding.top + ((max - value) / Math.max(1, max - min)) * (height - padding.top - padding.bottom);
  const xTicks = getTrendTickIndexes(trend.dates.length);
  const yTickCount = 5;
  const yTicks = Array.from({ length: yTickCount }, (_, index) => min + ((max - min) * index) / Math.max(1, yTickCount - 1));

  function handleMouseMove(e: MouseEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const svgX = ((e.clientX - rect.left) / rect.width) * width;
    const rawIndex = (svgX - padding.left) / (plotWidth / Math.max(1, trend.dates.length - 1));
    const index = Math.max(0, Math.min(trend.dates.length - 1, Math.round(rawIndex)));
    setHoveredIndex(index);
  }

  const crosshairX = hoveredIndex !== null ? xFor(hoveredIndex) : null;
  const tooltipDate = hoveredIndex !== null ? trend.dates[hoveredIndex] : null;

  return (
    <div className="plot-shell chart-shell trend-plot-shell" ref={containerRef} style={{ position: "relative" }}>
      <div className="trend-legend" aria-label="성분 검색 관심도 추이 범례">
        {trend.series.map((series, index) => {
          const color = series.color || getTrendColor(series.ingredient, index);
          const isSelected = selectedIngredients.has(series.ingredient);
          const isDimmed = selectedIngredients.size > 0 && !isSelected;
          return (
            <span
              className="trend-legend-item"
              key={series.ingredient}
              onClick={() => toggleIngredient(series.ingredient)}
              style={{
                cursor: "pointer",
                opacity: isDimmed ? 0.3 : 1,
                userSelect: "none",
                transition: "opacity .15s",
                fontWeight: isSelected ? 800 : undefined,
              }}
              title={isSelected ? "클릭하여 전체 보기" : "클릭하여 단독 보기"}
            >
              <i style={{ background: color }} />
              <span>{series.ingredient}</span>
            </span>
          );
        })}
      </div>
      <svg
        className="chart-svg"
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="성분 검색 관심도 추이"
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setHoveredIndex(null)}
      >
        {yTicks.map((tick) => {
          const y = yFor(tick);
          return (
            <g key={`trend-y-${tick}`}>
              <line x1={padding.left} x2={width - padding.right} y1={y} y2={y} className="chart-grid-line" />
              <text x={padding.left - 10} y={y + 4} className="chart-axis-label" textAnchor="end">
                {Math.round(tick)}
              </text>
            </g>
          );
        })}

        {xTicks.map((index) => {
          const x = xFor(index);
          return (
            <g key={`trend-x-${index}`}>
              <line x1={x} x2={x} y1={padding.top} y2={height - padding.bottom} className="chart-grid-line subtle" />
              <text x={x} y={height - 42} className="chart-axis-label" textAnchor="middle">
                {formatTrendDateLabel(trend.dates[index])}
              </text>
            </g>
          );
        })}

        <line x1={padding.left} x2={width - padding.right} y1={height - padding.bottom} y2={height - padding.bottom} className="chart-axis-line" />
        <line x1={padding.left} x2={padding.left} y1={padding.top} y2={height - padding.bottom} className="chart-axis-line" />
        <text x={width / 2} y={height - 10} className="chart-axis-title" textAnchor="middle">기간</text>
        <text x="16" y={(height - padding.bottom + padding.top) / 2} className="chart-axis-title" textAnchor="middle" transform={`rotate(-90 16 ${(height - padding.bottom + padding.top) / 2})`}>검색 관심도</text>

        {visibleSeries.map((series) => {
          const color = series.color || getTrendColor(series.ingredient, trend.series.findIndex((s) => s.ingredient === series.ingredient));
          const points = series.values.map((value, index) => `${xFor(index)},${yFor(value)}`).join(" ");
          const pointIndexes = new Set(getTrendPointIndexes(series.values.length));
          return (
            <g key={series.ingredient}>
              <polyline points={points} fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
              {series.values.map((value, index) => pointIndexes.has(index) ? (
                <circle key={`${series.ingredient}-${index}`} cx={xFor(index)} cy={yFor(value)} r="3.5" fill={color} />
              ) : null)}
            </g>
          );
        })}

        {crosshairX !== null && hoveredIndex !== null && (
          <g>
            <line x1={crosshairX} x2={crosshairX} y1={padding.top} y2={height - padding.bottom} stroke="#94a3b8" strokeWidth="1" strokeDasharray="4 3" />
            {visibleSeries.map((series) => {
              const color = series.color || getTrendColor(series.ingredient, trend.series.findIndex((s) => s.ingredient === series.ingredient));
              const val = series.values[hoveredIndex];
              if (!Number.isFinite(val)) return null;
              return (
                <circle key={`hover-${series.ingredient}`} cx={crosshairX} cy={yFor(val)} r="5" fill={color} stroke="#fff" strokeWidth="2" />
              );
            })}
          </g>
        )}

        <rect x={padding.left} y={padding.top} width={plotWidth} height={height - padding.top - padding.bottom} fill="transparent" />
      </svg>

      {hoveredIndex !== null && tooltipDate && (
        <div style={{
          position: "absolute",
          top: padding.top + 8,
          left: Math.min(
            (xFor(hoveredIndex) / width) * 100,
            72,
          ) + "%",
          transform: hoveredIndex > trend.dates.length * 0.6 ? "translateX(-100%)" : "translateX(8px)",
          background: "#ffffff",
          border: "1px solid #e2e8f0",
          borderRadius: 10,
          padding: "10px 12px",
          boxShadow: "0 8px 24px rgba(15,23,42,.10)",
          pointerEvents: "none",
          zIndex: 10,
          minWidth: 160,
        }}>
          <div style={{ fontSize: "0.72rem", fontWeight: 700, color: "#64748b", marginBottom: 8 }}>
            {tooltipDate}
          </div>
          {visibleSeries.map((series) => {
            const color = series.color || getTrendColor(series.ingredient, trend.series.findIndex((s) => s.ingredient === series.ingredient));
            const val = series.values[hoveredIndex];
            const prevVal = hoveredIndex > 0 ? series.values[hoveredIndex - 1] : null;
            const diff = Number.isFinite(val) && Number.isFinite(prevVal) ? val - (prevVal as number) : null;
            return (
              <div key={series.ingredient} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: color, flexShrink: 0 }} />
                <span style={{ fontSize: "0.72rem", color: "#334155", flex: 1 }}>{series.ingredient}</span>
                <span style={{ fontSize: "0.72rem", color: "#0f172a", whiteSpace: "nowrap" }}>
                  <strong>{Number.isFinite(val) ? val.toFixed(1) : "-"}</strong>
                  {diff !== null && (
                    <span style={{ marginLeft: 4, color: diff > 0 ? "#059669" : diff < 0 ? "#dc2626" : "#94a3b8", fontSize: "0.68rem" }}>
                      ({diff > 0 ? "▲" : diff < 0 ? "▼" : "–"}{Math.abs(diff).toFixed(1)})
                    </span>
                  )}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function MarketProductPlot({ products }: { products: MarketProduct[] }) {
  if (!products.length) {
    return <div className="plot-shell compact js-plot"><div className="empty-state api-state">전처리 제품 데이터를 불러오는 중입니다.</div></div>;
  }

  const rows = products.slice(0, 6);
  const maxCount = Math.max(...rows.map((item) => item.product_count), 1);

  return (
    <div className="plot-shell compact bar-chart">
      {rows.map((item, index) => {
        const hasPreviousBaseline = !String(item.source || "").includes("no_previous_snapshot");
        const growth = hasPreviousBaseline
          ? getGrowthDisplay(getProductGrowth(item))
          : { text: "전주 데이터 없음", color: "#64748b" };
        return (
          <div className="bar-chart-row" key={item.ingredient_key}>
            <div className="bar-chart-label">
              <strong>
                <IngredientTooltip label={item.ingredient_label}>{item.ingredient_label}</IngredientTooltip>
              </strong>
              <span style={{ color: growth.color }}>{growth.text}</span>
            </div>
            <div className="bar-track">
              <span
                className="bar-fill"
                style={{
                  width: `${Math.max(8, (item.product_count / maxCount) * 100)}%`,
                  background: getTrendColor(item.ingredient_label, index),
                }}
              />
            </div>
            <strong className="bar-value">{formatNumber(item.product_count)}개</strong>
          </div>
        );
      })}
    </div>
  );
}

function ConcernHeatmap({
  metrics,
  table,
  isLoading,
  error,
}: {
  metrics: ConcernMetric[];
  table: DashboardData["page2"]["concernTable"];
  isLoading: boolean;
  error: string;
}) {
  if (!table.length) {
    return (
      <div className="empty-state api-state">
        {error ? `Naver DataLab 오류: ${error}` : isLoading ? "Naver DataLab API에서 연령대별 피부 고민 데이터를 불러오는 중입니다." : "표시할 피부 고민 데이터가 없습니다."}
      </div>
    );
  }

  const values = table.flatMap((row) => metrics.map((metric) => Number(row[metric.key] ?? row[metric.legacyKey || ""] ?? 0)));
  const maxValue = Math.max(...values, 1);
  const style = { "--heatmap-columns": metrics.length } as CSSProperties;

  return (
    <>
      <div className="heatmap-grid" style={style}>
        <div className="heatmap-head">연령대</div>
        {metrics.map((metric) => (
          <div className="heatmap-head" key={metric.key}>{metric.label}</div>
        ))}
        {table.map((row) => (
          <Fragment key={row.age}>
            <div className="heatmap-age">{row.age}</div>
            {metrics.map((metric) => {
              const value = Number(row[metric.key] ?? row[metric.legacyKey || ""] ?? 0);
              const alpha = 0.1 + Math.max(0.12, value / maxValue) * 0.72;
              return (
                <div className="heatmap-cell" style={{ background: `rgba(9, 95, 233, ${alpha.toFixed(3)})` }} key={`${row.age}-${metric.key}`}>
                  <strong>{formatNumber(value)}</strong>
                </div>
              );
            })}
          </Fragment>
        ))}
      </div>
      <div className="heatmap-legend">
        <span>낮음</span>
        <div />
        <span>높음</span>
      </div>
    </>
  );
}

function getAlertReasons(alert: AlertItem) {
  const reasons = alert.reason_json.reasons;
  if (Array.isArray(reasons)) return reasons.map(String).filter(Boolean);
  return [`${getAlertMetricLabel(alert.detected_metric_name)} 기준값이 감지되었습니다.`];
}

function getAlertActions(alert: AlertItem) {
  return Array.isArray(alert.action_items_json)
    ? alert.action_items_json.map(String).filter(Boolean)
    : [];
}

function getAlertMetricEntries(alert: AlertItem) {
  const metrics = alert.reason_json.metrics;
  const entries: Array<[string, string]> = [
    [getAlertMetricLabel(alert.detected_metric_name), formatAlertMetricValue(alert.detected_metric_value, alert.detected_metric_name)],
  ];

  if (alert.baseline_metric_value !== null && alert.baseline_metric_value !== undefined && alert.baseline_metric_value !== "") {
    entries.push(["비교 기준", formatAlertMetricValue(alert.baseline_metric_value, "baseline")]);
  }

  if (metrics && typeof metrics === "object" && !Array.isArray(metrics)) {
    Object.entries(metrics).forEach(([label, value]) => {
      entries.push([label, String(value)]);
    });
  }

  const seen = new Set<string>();
  return entries.filter(([label]) => {
    if (seen.has(label)) return false;
    seen.add(label);
    return true;
  });
}

function getRelatedLowKeywordText(alert: AlertItem) {
  const related = alert.reason_json.relatedLowKeywords;
  if (!Array.isArray(related)) return "";

  return related
    .map((item) => {
      const row = item as { keyword?: unknown; count?: unknown };
      const keyword = String(row.keyword || "").trim();
      const count = Number(row.count || 0);
      return keyword && count > 0 ? `${keyword} ${count}건` : "";
    })
    .filter(Boolean)
    .join(", ");
}

function getNotificationStatus(alert: AlertItem) {
  if (alert.severity !== "high") return "High 등급만 Slack/email 발송 대상입니다.";
  if (alert.is_sent) return `${alert.sent_channel || "알림"} 발송 완료`;
  return "Slack/email 발송 대기 대상";
}

function getAlertMetricLabel(metricName: string) {
  const labels: Record<string, string> = {
    demand_supply_gap: "수요-공급 격차",
    supply_demand_gap: "공급-수요 격차",
    negative_keyword_count: "부정 키워드 수",
  };

  return labels[metricName] || metricName || "대표 지표";
}

function formatAlertMetricValue(value: number | string | null | undefined, metricName = "") {
  if (value === null || value === undefined || value === "") return "-";
  const number = Number(value);
  if (!Number.isFinite(number)) return String(value);
  if (metricName === "negative_keyword_count") return `${formatNumber(number)}건`;
  if (metricName === "baseline") return number > 0 && number <= 100 ? `${number.toFixed(1)}%` : number.toFixed(1);
  return number.toFixed(1);
}

function formatAlertDate(value: string) {
  if (!value) return "-";
  const datePart = value.slice(0, 10);
  const match = datePart.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return value;
  return `${match[1]}.${match[2]}.${match[3]}`;
}

function AlertDetail({ alert }: { alert: AlertItem }) {
  const metricEntries = getAlertMetricEntries(alert);
  const reasons = getAlertReasons(alert);
  const actions = getAlertActions(alert);
  const relatedLowKeywordText = getRelatedLowKeywordText(alert);

  return (
    <div className="alert-detail">
      <div className="detail-title-row">
        <div>
          <span className="detail-type">{ALERT_TYPE_LABELS[alert.alert_type]}</span>
          <h2>{alert.title}</h2>
        </div>
        <span className={`severity-badge ${getSeverityClass(alert.severity)}`}>{ALERT_SEVERITY_LABELS[alert.severity]}</span>
      </div>
      <p className="detail-description">{alert.summary}</p>

      <div className="detail-meta-grid">
        <div>
          <span>경보 기준일</span>
          <strong>{formatAlertDate(alert.alert_date)}</strong>
        </div>
        <div>
          <span>대표 지표</span>
          <strong>{formatAlertMetricValue(alert.detected_metric_value, alert.detected_metric_name)}</strong>
        </div>
        <div>
          <span>성분/상품</span>
          <strong>{alert.product_name ? `${alert.ingredient_name} · ${alert.product_name}` : alert.ingredient_name}</strong>
        </div>
        <div>
          <span>알림 상태</span>
          <strong>{getNotificationStatus(alert)}</strong>
        </div>
      </div>

      <div className="detail-section">
        <h3>감지 이유</h3>
        <ul>{reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul>
      </div>

      <div className="detail-section">
        <h3>{alert.alert_type === "review_issue" ? "리뷰 이슈 지표" : "수요-공급 지표"}</h3>
        <div className="detail-metrics">
          {metricEntries.map(([label, value]) => (
            <div className="metric-pill" key={label}>
              <span>{label}</span>
              <strong>{value}</strong>
            </div>
          ))}
        </div>
      </div>

      {relatedLowKeywordText ? (
        <div className="detail-section">
          <h3>상세 참고 키워드</h3>
          <p className="detail-description">{relatedLowKeywordText}</p>
        </div>
      ) : null}

      <div className="detail-section">
        <h3>권장 액션</h3>
        {actions.length ? (
          <ul>{actions.map((action) => <li key={action}>{action}</li>)}</ul>
        ) : (
          <div className="empty-state api-state">권장 액션 데이터가 없습니다.</div>
        )}
      </div>
    </div>
  );
}

export default function Dashboard() {
  const [data, setData] = useState<DashboardData>(INITIAL_DASHBOARD_DATA);
  const [loadState, setLoadState] = useState<DataLoadState>({
    dashboardSignals: "loading",
    searchTrend: "loading",
    priceDistribution: "loading",
    demandSupplyMatrix: "loading",
    page1Insights: "loading",
    page2Insights: "idle",
    dashboardSignalsError: "",
    searchTrendError: "",
    priceDistributionError: "",
    demandSupplyMatrixError: "",
    page1InsightsError: "",
    page2InsightsError: "",
  });
  const [activeTab, setActiveTab] = useState<TabId>("A");
  const [activePriceType, setActivePriceType] = useState<PriceType>("sale");
  const [activeSearchPeriodKey, setActiveSearchPeriodKey] = useState("snapshot");
  const [activeIngredientRankingSource, setActiveIngredientRankingSource] = useState<IngredientRankingSource>("naver");
  const [activePage1Period, setActivePage1Period] = useState<Page1Period>("month");
  const [activeTrendIngredientSet, setActiveTrendIngredientSet] = useState<TrendIngredientSet>("main");
  const [oliveYoungIngredientPopularity, setOliveYoungIngredientPopularity] = useState<RankItem[]>([]);
  const [oliveYoungRankingState, setOliveYoungRankingState] = useState<{ status: ApiState; error: string }>({
    status: "idle",
    error: "",
  });
  const [supabaseEarliestDate, setSupabaseEarliestDate] = useState<string | null>(null);
  const [selectedReviewIngredient, setSelectedReviewIngredient] = useState("나이아신아마이드");
  const [reviewAnalysis, setReviewAnalysis] = useState<ReviewAnalysisResult | null>(null);
  const [reviewAnalysisState, setReviewAnalysisState] = useState<{ status: ApiState; error: string }>({
    status: "idle",
    error: "",
  });
  const [alertState, setAlertState] = useState<{ status: ApiState; error: string }>({
    status: "idle",
    error: "",
  });
  const [activeAlertId, setActiveAlertId] = useState("");
  const [agentPrompt, setAgentPrompt] = useState("");
  const [agentState, setAgentState] = useState<{ status: ApiState; error: string }>({
    status: "idle",
    error: "",
  });
  const didRequestInitialData = useRef(false);
  const lastInsightRequestKey = useRef("");
  const lastPage2InsightRequestKey = useRef("");

  async function loadDashboardSignals(period: Page1Period = activePage1Period) {
    setLoadState((current) => ({ ...current, dashboardSignals: "loading", dashboardSignalsError: "" }));
    try {
      const payload = await fetchCurrentApiDashboardSignals(period);
      const hasWeeklyDatalabData = Boolean(payload.page1?.functionRisers?.length && payload.page1?.ingredientPopularity?.length);
      setData((current) => mergeDashboardSignals(current, payload));
      setLoadState((current) => ({
        ...current,
        dashboardSignals: hasWeeklyDatalabData ? "ready" : "error",
        dashboardSignalsError: hasWeeklyDatalabData ? "" : DATALAB_WEEKLY_API_REQUIRED_MESSAGE,
      }));
    } catch (error) {
      console.error("FastAPI 대시보드 신호 조회 실패", error);
      setLoadState((current) => ({
        ...current,
        dashboardSignals: "error",
        dashboardSignalsError: error instanceof Error ? error.message : String(error),
      }));
    }
  }

  async function loadOliveYoungIngredientPopularity() {
    setOliveYoungRankingState({ status: "loading", error: "" });

    try {
      const items = await fetchOliveYoungIngredientPopularityFromSupabase();
      setOliveYoungIngredientPopularity(items);
      setOliveYoungRankingState({ status: "ready", error: "" });
    } catch (error) {
      console.error("Supabase 올리브영 성분 랭킹 조회 실패", error);
      setOliveYoungIngredientPopularity([]);
      setOliveYoungRankingState({
        status: "error",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async function loadIngredientTrend(
    periodKey: string,
    ingredientSet: TrendIngredientSet = activeTrendIngredientSet,
    ingredientLabels = getTrendIngredientLabels(ingredientSet, data.page1.demandSupplyMatrix),
  ) {
    setLoadState((current) => ({ ...current, searchTrend: "loading", searchTrendError: "", page2Insights: "idle" }));
    try {
      const params = new URLSearchParams({
        scope: "page2",
        period: periodKey,
        ingredientSet,
      });
      if (ingredientSet === "opportunity" && ingredientLabels.length) {
        params.set("ingredients", ingredientLabels.join(","));
      }

      const payload = await fetchLocalJson<DatalabWeeklyInterestResponse>(`/api/dashboard/datalab-weekly-interest?${params.toString()}`);
      const trendPayload = payload.page2 || {};

      if (trendPayload.searchTrend || trendPayload.concernTable) {
        setData((current) => mergeIngredientTrend(current, trendPayload));
      }

      const hasTrend = Boolean(trendPayload.searchTrend?.dates?.length && trendPayload.searchTrend?.series?.length);
      const hasConcern = Boolean(trendPayload.concernTable?.length && trendPayload.concernMetrics?.length);
      setLoadState((current) => ({
        ...current,
        searchTrend: hasTrend && hasConcern ? "ready" : "error",
        searchTrendError: hasTrend && hasConcern ? "" : "Naver DataLab에서 2페이지 검색 추이/연령대별 고민 데이터를 불러오지 못했습니다.",
      }));

      if (hasTrend) {
        const labels = trendPayload.searchTrend?.series?.map((series) => series.ingredient) || [];
        setData((current) => ({
          ...current,
          page2: {
            ...current.page2,
            marketProducts: [],
          },
        }));
        void fetchMarketProductsFromSupabase(labels).then((marketProducts) => {
          setData((current) => ({
            ...current,
            page2: {
              ...current.page2,
              marketProducts,
            },
          }));
        }).catch((marketError) => {
          console.error("Supabase 성분별 시장 제품 수 조회 실패", marketError);
        });
      }
    } catch (error) {
      console.error("Naver DataLab 2페이지 검색 추이/히트맵 조회 실패", { periodKey, error });
      setLoadState((current) => ({
        ...current,
        searchTrend: "error",
        searchTrendError: error instanceof Error ? error.message : String(error),
      }));
    }
  }

  async function loadMarketProducts() {
    try {
      const labels = data.page2.searchTrend.series.length
        ? data.page2.searchTrend.series.map((series) => series.ingredient)
        : getTrendIngredientLabels(activeTrendIngredientSet, data.page1.demandSupplyMatrix);
      const marketProducts = await fetchMarketProductsFromSupabase(labels);
      setData((current) => ({
        ...current,
        page2: {
          ...current.page2,
          marketProducts,
        },
      }));
    } catch (error) {
      console.error("Supabase 성분별 시장 제품 수 조회 실패", error);
    }
  }

  async function loadSupabaseEarliestDate() {
    try {
      const supabase = createClient();
      const { data: rows, error } = await supabase
        .from("product_snapshots")
        .select("collected_date")
        .order("collected_date", { ascending: true })
        .limit(1);

      if (error) throw error;
      setSupabaseEarliestDate(rows?.[0]?.collected_date || null);
    } catch (error) {
      console.error("Supabase 최초 수집일 조회 실패", error);
    }
  }

  async function loadPriceDistribution() {
    setLoadState((current) => ({ ...current, priceDistribution: "loading", priceDistributionError: "" }));
    try {
      const priceDistribution = await fetchPriceDistributionFromSupabase();
      setData((current) => mergePriceDistribution(current, priceDistribution));
      setLoadState((current) => ({ ...current, priceDistribution: "ready", priceDistributionError: "" }));
    } catch (error) {
      setData((current) => mergePriceDistribution(current, getEmptyPriceDistribution()));
      setLoadState((current) => ({
        ...current,
        priceDistribution: "error",
        priceDistributionError: error instanceof Error ? error.message : String(error),
      }));
    }
  }

  async function loadDemandSupplyMatrix() {
    setLoadState((current) => ({ ...current, demandSupplyMatrix: "loading", demandSupplyMatrixError: "" }));
    const result = await fetchDemandSupplyMatrixFromSupabase(DEFAULT_DEMAND_SUPPLY_MATRIX_CONFIG);
    setData((current) => mergeDemandSupplyMatrix(current, result.items));
    setLoadState((current) => ({
      ...current,
      demandSupplyMatrix: result.isUnavailable ? "error" : "ready",
      demandSupplyMatrixError: result.error,
    }));

    if (activeTrendIngredientSet === "opportunity" && result.items.length) {
      const labels = getTrendIngredientLabels("opportunity", result.items);
      void loadIngredientTrend(activeSearchPeriodKey, "opportunity", labels);
    }
  }

  async function loadPage1Insights(payload: ReturnType<typeof buildPage1InsightPayload>) {
    setLoadState((current) => ({ ...current, page1Insights: "loading", page1InsightsError: "" }));

    try {
      const response = await fetch("/api/dashboard/page1-insights", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await response.json().catch(() => ({}));

      if (!response.ok || !Array.isArray(result.insights)) {
        throw new Error(typeof result.error === "string" ? result.error : INSIGHT_GENERATION_ERROR_MESSAGE);
      }

      const aiInsights = result.insights.map((item: unknown) => String(item)).filter(Boolean);
      setData((current) => mergePage1Insights(current, aiInsights));
      setLoadState((current) => ({ ...current, page1Insights: "ready", page1InsightsError: "" }));
    } catch (error) {
      console.error("Page 1 인사이트 생성 실패", error);
      setData((current) => mergePage1Insights(current, buildPage1DecisionInsights(payload)));
      setLoadState((current) => ({ ...current, page1Insights: "ready", page1InsightsError: "" }));
    }
  }

  async function loadPage2Insights(payload: ReturnType<typeof buildPage2InsightPayload>) {
    setLoadState((current) => ({ ...current, page2Insights: "loading", page2InsightsError: "" }));

    try {
      const response = await fetch("/api/dashboard/page2-insights", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await response.json().catch(() => ({}));

      if (!response.ok || !Array.isArray(result.insights)) {
        throw new Error(typeof result.error === "string" ? result.error : INSIGHT_GENERATION_ERROR_MESSAGE);
      }

      const aiInsights = result.insights.map((item: unknown) => String(item)).filter(Boolean);
      setData((current) => mergePage2Insights(current, aiInsights));
      setLoadState((current) => ({ ...current, page2Insights: "ready", page2InsightsError: "" }));
    } catch (error) {
      console.error("Page 2 인사이트 생성 실패", error);
      setLoadState((current) => ({ ...current, page2Insights: "ready", page2InsightsError: "" }));
    }
  }

  async function loadReviewAnalysis(ingredient: string) {
    setReviewAnalysisState({ status: "loading", error: "" });

    try {
      const payload = await fetchLocalJson<ReviewAnalysisResult>(`/api/review-analysis?ingredient=${encodeURIComponent(ingredient)}`);
      setReviewAnalysis(payload);
      setReviewAnalysisState({ status: "ready", error: "" });
    } catch (error) {
      console.error("소비자 리뷰 분석 조회 실패", error);
      setReviewAnalysis(null);
      setReviewAnalysisState({
        status: "error",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async function loadDailyAlerts(force = false) {
    setAlertState({ status: "loading", error: "" });

    try {
      const payload = await fetchLocalJson<DailyAlertsPayload>(force ? "/api/alerts/daily?force=true" : "/api/alerts/daily");
      setData((current) => mergeDailyAlerts(current, payload));
      setActiveAlertId(payload.alerts[0]?.id || "");
      setAlertState({ status: "ready", error: "" });
    } catch (error) {
      console.error("일일 경보 조회 실패", error);
      setData((current) => mergeDailyAlerts(current, {
        alertDate: "",
        summary: {
          opportunityCount: 0,
          inventoryRiskCount: 0,
          reviewIssueCount: 0,
        },
        alerts: [],
        notificationTargets: [],
      }));
      setActiveAlertId("");
      setAlertState({
        status: "error",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async function callAgent() {
    const question = agentPrompt.trim();
    if (!question || agentState.status === "loading") return;

    setAgentState({ status: "loading", error: "" });

    try {
      const context = {
        functionTop5: data.page1.functionRisers.slice(0, 5),
        ingredientTop5: data.page1.ingredientPopularity.slice(0, 5),
        searchTrend: data.page2.searchTrend,
        concernTable: data.page2.concernTable.slice(0, 10),
        marketProducts: data.page2.marketProducts.slice(0, 10),
      };

      const result = await fetchLocalJson<AgentResult>("/api/dashboard/page5-agent", {
        method: "POST",
        body: JSON.stringify({ question, context }),
      });

      setData((current) => mergeAgentResult(current, result));
      setAgentState({ status: "ready", error: "" });
      setAgentPrompt("");
    } catch (error) {
      console.error("AI Agent 호출 실패", error);
      setAgentState({
        status: "error",
        error: error instanceof Error ? error.message : "전략 생성에 실패했습니다.",
      });
    }
  }

  async function handlePage1PeriodChange(period: Page1Period) {
    setActivePage1Period(period);
    await loadDashboardSignals(period);
  }


  async function refreshDatalabData(periodKey = activeSearchPeriodKey) {
    await loadDashboardSignals(activePage1Period);
    await loadIngredientTrend(periodKey);
  }

  async function refreshSupabaseData() {
    await Promise.all([
      loadPriceDistribution(),
      loadDemandSupplyMatrix(),
      loadOliveYoungIngredientPopularity(),
      loadSupabaseEarliestDate(),
    ]);
  }

  useEffect(() => {
    if (didRequestInitialData.current) return;
    didRequestInitialData.current = true;
    void refreshDatalabData("snapshot");
    void loadOliveYoungIngredientPopularity();
    void loadPriceDistribution();
    void loadMarketProducts();
    void loadDemandSupplyMatrix();
    void loadDailyAlerts();
    void loadSupabaseEarliestDate();
  }, []);

  useEffect(() => {
    void loadReviewAnalysis(selectedReviewIngredient);
  }, [selectedReviewIngredient]);

  useEffect(() => {
    const stillLoading = loadState.dashboardSignals === "loading" ||
      loadState.priceDistribution === "loading" ||
      loadState.demandSupplyMatrix === "loading";

    if (stillLoading) return;

    const payload = buildPage1InsightPayload(data, loadState);
    const requestKey = JSON.stringify(payload);
    if (requestKey === lastInsightRequestKey.current) return;

    lastInsightRequestKey.current = requestKey;
    void loadPage1Insights(payload);
  }, [
    data.page1.functionRisers,
    data.page1.ingredientPopularity,
    data.page1.priceDistribution,
    data.page1.demandSupplyMatrix,
    loadState.dashboardSignals,
    loadState.dashboardSignalsError,
    loadState.priceDistribution,
    loadState.priceDistributionError,
    loadState.demandSupplyMatrix,
    loadState.demandSupplyMatrixError,
  ]);

  useEffect(() => {
    const stillLoading = loadState.searchTrend === "loading" || loadState.dashboardSignals === "loading";
    if (stillLoading || loadState.page2Insights !== "idle") return;
    if (!data.page2.searchTrend.series.length && !data.page2.concernTable.length) return;

    const payload = buildPage2InsightPayload(data, data.page2.marketProducts.slice().sort((a, b) => b.product_count - a.product_count));
    const requestKey = JSON.stringify(payload);
    if (requestKey === lastPage2InsightRequestKey.current) return;

    lastPage2InsightRequestKey.current = requestKey;
    void loadPage2Insights(payload);
  }, [
    data.page2.searchTrend,
    data.page2.concernTable,
    data.page2.marketProducts,
    loadState.searchTrend,
    loadState.dashboardSignals,
    loadState.page2Insights,
  ]);

  const isDashboardLoading = loadState.dashboardSignals === "loading";
  const isTrendLoading = loadState.searchTrend === "loading";
  const isPriceLoading = loadState.priceDistribution === "loading";
  const isDemandSupplyLoading = loadState.demandSupplyMatrix === "loading";
  const isPage1InsightsLoading = loadState.page1Insights === "loading";
  const isPage2InsightsLoading = loadState.page2Insights === "loading";
  const marketProducts = useMemo(
    () => data.page2.marketProducts.slice().sort((a, b) => b.product_count - a.product_count),
    [data.page2.marketProducts],
  );
  const opportunityIngredientLabels = useMemo(
    () => getOpportunityIngredientLabels(data.page1.demandSupplyMatrix),
    [data.page1.demandSupplyMatrix],
  );
  const opportunityLabelKey = opportunityIngredientLabels.join("|");
  const activeTrendIngredientLabels = activeTrendIngredientSet === "opportunity" && opportunityIngredientLabels.length
    ? opportunityIngredientLabels
    : MAIN_INGREDIENTS.map((item) => item.label);
  const ingredientPopularityItems = activeIngredientRankingSource === "naver"
    ? data.page1.ingredientPopularity
    : oliveYoungIngredientPopularity;
  const isIngredientPopularityLoading = activeIngredientRankingSource === "naver"
    ? isDashboardLoading
    : oliveYoungRankingState.status === "loading";
  const ingredientPopularityError = activeIngredientRankingSource === "naver"
    ? loadState.dashboardSignalsError
    : oliveYoungRankingState.error;
  const activeAlert = data.page4.alerts.find((alert) => alert.id === activeAlertId) || data.page4.alerts[0] || null;
  const isSupabaseLoading = isPriceLoading || isDemandSupplyLoading || oliveYoungRankingState.status === "loading";
  const statusCard = (
    <div style={{ display: "flex", gap: 8 }}>
      <DataStatusCard
        meta={data.meta}
        isLoading={isDashboardLoading || isTrendLoading}
        error={loadState.dashboardSignalsError || loadState.searchTrendError}
        onRefresh={() => void refreshDatalabData()}
      />
      <SupabaseStatusCard
        isLoading={isSupabaseLoading}
        earliestDate={supabaseEarliestDate}
        onRefresh={() => void refreshSupabaseData()}
      />
    </div>
  );

  useEffect(() => {
    if (activeTrendIngredientSet !== "opportunity" || !opportunityIngredientLabels.length) return;

    const currentTrendLabelKey = data.page2.searchTrend.series.map((series) => series.ingredient).join("|");
    if (currentTrendLabelKey === opportunityLabelKey) return;

    void loadIngredientTrend(activeSearchPeriodKey, "opportunity", opportunityIngredientLabels);
  }, [activeTrendIngredientSet, opportunityLabelKey]);

  const isReviewAnalysisLoading = reviewAnalysisState.status === "loading";
  const isAlertsLoading = alertState.status === "loading";

  return (
    <div className="dash">
      <nav className="sidebar">
        <div className="sidebar-logo">
          <img className="sidebar-brand-logo" src="/beauty-guard-logo-transparent.png" alt="Beauty Guard" />
          <div className="logo-title">Beauty Guard</div>
          <div className="logo-sub">Ingredient Trend Dashboard</div>
        </div>
        <div className="nav-section">
          <div className="nav-label">대시보드</div>
          {NAV_ITEMS.map((item) => {
            const badge = item.id === "D" && data.page4.alerts.length ? String(data.page4.alerts.length) : item.badge;

            return (
              <button
                className={`nav-item ${activeTab === item.id ? "active" : ""}`}
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
              >
                <span className="nav-icon">{item.index}</span>
                {item.label}
                {badge ? <span className="nav-badge">{badge}</span> : null}
              </button>
            );
          })}
        </div>
        <div className="sidebar-footer">떡잎마을 방범대</div>
      </nav>

      <main className="main">
        <section className="content">
          <article className={`panel ${activeTab === "A" ? "active" : ""}`}>
            <PageHeader
              badge="Page 1"
              title="1. 성분 시장 스냅샷"
              description="수요·공급·가격·검색 데이터를 기반으로 지금 주목해야 할 성분 시장 구조를 한눈에 파악합니다."
              statusCard={statusCard}
            />
            <SummaryStrip summary={data.page1Summary} page1={data.page1} />
            <div className="dashboard-grid market-grid">
              <section className="card rank-card">
                <div className="card-header">
                  <span>기능(급상승 순위) TOP 5</span>
                  <div className="rank-source-toggle" aria-label="기간 선택">
                    {(["week", "month"] as Page1Period[]).map((p) => (
                      <button
                        key={p}
                        type="button"
                        className={`period-button ${activePage1Period === p ? "active" : ""}`}
                        onClick={() => void handlePage1PeriodChange(p)}
                      >
                        {p === "week" ? "주간" : "월간"}
                      </button>
                    ))}
                  </div>
                </div>
                <RankList
                  items={data.page1.functionRisers}
                  barMetric="growth"
                  valueMetric="growth"
                  displayMode="point"
                  barValue={(item) => Math.max(0, Number(item.currentWeekIndex || 0) - Number(item.previousWeekIndex || 0))}
                  isLoading={isDashboardLoading}
                  error={loadState.dashboardSignalsError}
                  loadingMessage="Naver DataLab API에서 데이터를 불러오는 중입니다."
                />
                <NaverStandardNote label={`${activePage1Period === "month" ? "전월" : "전주"} 대비 관심도 변화`} />
              </section>

              <section className="card rank-card">
                <div className="card-header">
                  <span style={{ whiteSpace: "nowrap" }}>성분 인기 순위 TOP 5</span>
                  <div className="rank-source-toggle" aria-label="성분 인기 순위 데이터 기준 선택">
                    <TooltipButton
                      tooltip="네이버"
                      className={`period-button ${activeIngredientRankingSource === "naver" && activePage1Period === "week" ? "active" : ""}`}
                      onClick={() => { setActiveIngredientRankingSource("naver"); void handlePage1PeriodChange("week"); }}
                    >주간</TooltipButton>
                    <TooltipButton
                      tooltip="네이버"
                      className={`period-button ${activeIngredientRankingSource === "naver" && activePage1Period === "month" ? "active" : ""}`}
                      onClick={() => { setActiveIngredientRankingSource("naver"); void handlePage1PeriodChange("month"); }}
                    >월간</TooltipButton>
                    <button
                      type="button"
                      className={`period-button ${activeIngredientRankingSource === "oliveyoung" ? "active" : ""}`}
                      onClick={() => { setActiveIngredientRankingSource("oliveyoung"); if (oliveYoungRankingState.status === "idle") void loadOliveYoungIngredientPopularity(); }}
                    >올리브영</button>
                  </div>
                </div>
                <RankList
                  items={ingredientPopularityItems}
                  barMetric="searchIndex"
                  valueMetric={activeIngredientRankingSource === "naver" ? "growth" : "searchIndex"}
                  displayMode={activeIngredientRankingSource === "naver" ? "point" : "pct"}
                  valueFormatter={activeIngredientRankingSource === "oliveyoung"
                    ? (item) => item.averageRank ? `#${Number(item.averageRank).toFixed(1)}` : "-"
                    : undefined}
                  subValueFormatter={activeIngredientRankingSource === "oliveyoung"
                    ? (item) => item.score ? `점수 ${formatNumber(Math.round(Number(item.score)))}` : ""
                    : undefined}
                  isLoading={isIngredientPopularityLoading}
                  error={ingredientPopularityError}
                  emptyMessage={activeIngredientRankingSource === "naver"
                    ? DATALAB_WEEKLY_API_REQUIRED_MESSAGE
                    : "표시할 올리브영 성분 랭킹 데이터가 없습니다."}
                  loadingMessage={activeIngredientRankingSource === "naver"
                    ? "Naver DataLab API에서 데이터를 불러오는 중입니다."
                    : "Supabase에서 올리브영 성분 랭킹을 불러오는 중입니다."}
                />
                {activeIngredientRankingSource === "naver"
                  ? <NaverStandardNote label="네이버 검색 관심도 기준" />
                  : <OliveYoungStandardNote />
                }
              </section>

              <section className="card price-card">
                <div className="card-header">
                  <span>주요 성분 가격 분포</span>
                  <div className="price-toggle-control" aria-label="가격 기준 선택">
                    <button className={`period-button ${activePriceType === "sale" ? "active" : ""}`} type="button" onClick={() => setActivePriceType("sale")}>판매가</button>
                    <button className={`period-button ${activePriceType === "list" ? "active" : ""}`} type="button" onClick={() => setActivePriceType("list")}>정가</button>
                  </div>
                </div>
                <PriceDistributionPlot
                  items={data.page1.priceDistribution}
                  priceType={activePriceType}
                  isLoading={isPriceLoading}
                  error={loadState.priceDistributionError}
                />
                <div style={{ textAlign: "right", fontSize: "0.68rem", color: "#9ca3af", marginTop: "auto", paddingTop: 8 }}>* 10ml 기준</div>
              </section>

              <section className="card market-matrix-card">
                <div className="card-header">
                  <span>수요-공급 매트릭스</span>
                  <span className="card-meta">{isDemandSupplyLoading ? "Supabase 원천 데이터 연결 중" : loadState.demandSupplyMatrixError ? "수요 API 필요" : "원천 데이터 계산"}</span>
                </div>
                <div className="status-note">공급은 성분 포함 상품 수, 수요는 네이버 데이터랩 검색 관심도를 0~100 지수로 환산합니다.</div>
                {loadState.demandSupplyMatrixError ? (
                  <div className="empty-state">{loadState.demandSupplyMatrixError}</div>
                ) : null}
                <MatrixLegend />
                <DemandSupplyPlot
                  items={data.page1.demandSupplyMatrix}
                  isLoading={isDemandSupplyLoading}
                  error={loadState.demandSupplyMatrixError}
                  threshold={DEFAULT_DEMAND_SUPPLY_MATRIX_CONFIG.threshold}
                />
              </section>

              <section className="card insight-card market-insight-card">
                <div className="card-header">핵심 인사이트 요약</div>
                <InsightList
                  items={data.page1.insights}
                  fallback={isPage1InsightsLoading ? "인사이트 요약을 생성 중입니다." : loadState.page1InsightsError || INSIGHT_GENERATION_ERROR_MESSAGE}
                />
              </section>
            </div>
          </article>

          <article className={`panel ${activeTab === "B" ? "active" : ""}`}>
            <PageHeader
              badge="Page 2"
              title="2. 검색 트렌드 분석"
              description="성분 검색 관심도 변화가 시장 제품 수와 연령대별 피부 고민 맥락에 어떻게 연결되는지 분석합니다."
              statusCard={statusCard}
              actions={(
                <>
                  <div className="control-chip">
                    <span>기간 선택</span>
                    <strong>{data.page2.periodLabel}</strong>
                  </div>
                  <div className="control-chip muted">
                    <span>성분 선택</span>
                    <strong>{activeTrendIngredientSet === "opportunity" ? `기회 성분 ${activeTrendIngredientLabels.length}개` : `주요 성분 ${MAIN_INGREDIENTS.length}개`}</strong>
                  </div>
                </>
              )}
            />

            <div className="dashboard-grid search-grid">
              <section className="card trend-card">
                <div className="card-header">
                  <span>성분 검색 관심도 추이</span>
                  <span className="card-meta">Naver DataLab ratio</span>
                </div>
                <div className="trend-control-stack">
                  <div className="period-control-row" aria-label="검색 관심도 기간 선택">
                    {SEARCH_PERIOD_OPTIONS.map((option) => (
                      <button
                        className={`period-button ${option.key === activeSearchPeriodKey ? "active" : ""}`}
                        key={option.key}
                        type="button"
                        onClick={() => {
                          const labels = getTrendIngredientLabels(activeTrendIngredientSet, data.page1.demandSupplyMatrix);
                          setActiveSearchPeriodKey(option.key);
                          void loadIngredientTrend(option.key, activeTrendIngredientSet, labels);
                        }}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                  <div className="period-control-row trend-set-control" aria-label="검색 관심도 성분 그룹 선택">
                    {TREND_INGREDIENT_SET_OPTIONS.map((option) => (
                      <button
                        className={`period-button ${option.key === activeTrendIngredientSet ? "active" : ""}`}
                        key={option.key}
                        type="button"
                        onClick={() => {
                          const labels = getTrendIngredientLabels(option.key, data.page1.demandSupplyMatrix);
                          setActiveTrendIngredientSet(option.key);
                          void loadIngredientTrend(activeSearchPeriodKey, option.key, labels);
                        }}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>
                <SearchTrendPlot trend={data.page2.searchTrend} isLoading={isTrendLoading} error={loadState.searchTrendError} />
              </section>

              <section className="card market-products-card">
                <div className="card-header">
                  <span>성분별 시장 제품 수 현황</span>
                  <span className="card-meta">전처리 리테일 데이터 기준</span>
                </div>
                <p className="card-helper">검색 관심도와 함께 시장 공급 규모를 비교해 볼 수 있는 보조 지표입니다.</p>
                <MarketProductPlot products={marketProducts} />
              </section>

              <section className="card concern-card">
                <div className="card-header">
                  <span>연령대별 피부 고민 집중도</span>
                  <span className="card-meta">Naver DataLab age ratio</span>
                </div>
                <p className="card-helper">주름/탄력, 잡티/톤, 트러블/진정, 건조/장벽, 모공/피지 키워드 집중도로 타겟 맥락을 해석합니다.</p>
                <div className="heatmap-wrap">
                  <ConcernHeatmap
                    metrics={data.page2.concernMetrics}
                    table={data.page2.concernTable}
                    isLoading={isTrendLoading}
                    error={loadState.searchTrendError}
                  />
                </div>
              </section>

              <section className="card search-insight-card">
                <div className="card-header">
                  <span>검색 트렌드 인사이트</span>
                  <span className="card-meta">summary</span>
                </div>
                <p className="card-helper">검색 관심도, 제품 수, 피부 고민 집중도를 함께 읽어 핵심 해석을 요약합니다.</p>
                <InsightList
                  items={data.page2.insights}
                  fallback={isPage2InsightsLoading ? "인사이트 요약을 생성 중입니다." : INSIGHT_GENERATION_ERROR_MESSAGE}
                />
              </section>
            </div>
          </article>

          <article className={`panel ${activeTab === "C" ? "active" : ""}`}>
            <PageHeader
              badge="Page 3"
              title="3. 소비자 리뷰 분석"
              description="성분별 소비자 리뷰를 분석하여 감정, 의향과 타깃 기회를 파악합니다."
              statusCard={statusCard}
              actions={(
                <>
                  <div className="control-chip">
                    <span>성분 선택</span>
                    <IngredientSelect
                      value={selectedReviewIngredient}
                      onChange={setSelectedReviewIngredient}
                      options={getReviewIngredientOptions(opportunityIngredientLabels)}
                    />
                  </div>
                  <div className="control-chip muted">
                    <span>분석 리뷰</span>
                    <strong>{reviewAnalysis ? `${formatNumber(reviewAnalysis.totalReviews)}개` : isReviewAnalysisLoading ? "분석 중" : "-"}</strong>
                  </div>
                </>
              )}
            />

            <div className="dashboard-grid review-grid">
              <section className="card sentiment-card">
                <div className="card-header">리뷰 감정 분석</div>
                {reviewAnalysis ? (
                  <SentimentDonutChart sentiment={reviewAnalysis.sentiment} />
                ) : (
                  <div className="empty-state api-state">
                    {reviewAnalysisState.error || (isReviewAnalysisLoading ? "리뷰 감정 분석을 실행 중입니다." : "표시할 리뷰 분석 데이터가 없습니다.")}
                  </div>
                )}
              </section>

              <section className="card keyword-card">
                <div className="card-header">주요 키워드 분석</div>
                {reviewAnalysis ? (
                  <KeywordCards positive={reviewAnalysis.keywords.positive} negative={reviewAnalysis.keywords.negative} />
                ) : (
                  <div className="empty-state api-state">{isReviewAnalysisLoading ? "키워드를 추출 중입니다." : "표시할 키워드가 없습니다."}</div>
                )}
              </section>

              <section className="card product-card">
                <div className="card-header">리뷰 반응 상위 제품 TOP 3</div>
                {reviewAnalysis ? (
                  <TopReviewProducts products={reviewAnalysis.topProducts} />
                ) : (
                  <div className="empty-state api-state">{isReviewAnalysisLoading ? "제품 반응을 계산 중입니다." : "표시할 제품 데이터가 없습니다."}</div>
                )}
              </section>

              <section className="card skin-table-card">
                <div className="card-header">피부 타입별 감정 비율 & 주요 이슈 요약</div>
                {reviewAnalysis ? (
                  <SkinTypeSentimentTable rows={reviewAnalysis.skinTypeAnalysis} />
                ) : (
                  <div className="empty-state api-state">{isReviewAnalysisLoading ? "피부 타입별 감정을 계산 중입니다." : "표시할 피부 타입 데이터가 없습니다."}</div>
                )}
              </section>

              <section className="card review-insight-card">
                <div className="card-header">기회 인사이트</div>
                {reviewAnalysis ? (
                  <OpportunityInsights insights={reviewAnalysis.insights} />
                ) : (
                  <div className="empty-state api-state">{isReviewAnalysisLoading ? "인사이트를 생성 중입니다." : "표시할 인사이트가 없습니다."}</div>
                )}
              </section>
            </div>
          </article>

          <article className={`panel ${activeTab === "D" ? "active" : ""}`}>
            <div className="compact-page-layout alert-page-layout">
              <PageHeader
                badge="Page 4"
                title="4. 경보"
                description="매일 1회 갱신된 계산 결과를 기준으로 성분 기회, 재고 리스크, 리뷰 이슈를 감지합니다."
                statusCard={statusCard}
                compact
              />

              <div className="summary-strip alert-summary">
                <AlertSummaryChip
                  label="신제품 기획 후보"
                  value={`${formatNumber(data.page4.summary.opportunityCount)}건`}
                  tone="up"
                  tooltipTitle="신제품 기획 후보 산출 기준"
                  tooltipDesc="수요 점수 ≥ 60 AND 공급 점수 ≤ 40 조건을 충족한 성분을 경보 DB에서 집계합니다."
                  alertItems={data.page4.alerts.filter((a) => a.alert_type === "opportunity")}
                />
                <AlertSummaryChip
                  label="재고 리스크 성분"
                  value={`${formatNumber(data.page4.summary.inventoryRiskCount)}건`}
                  tone="warn"
                  tooltipTitle="재고 리스크 성분 산출 기준"
                  tooltipDesc="공급 점수 ≥ 60 AND 수요 점수 ≤ 40 조건을 충족한 성분을 경보 DB에서 집계합니다."
                  alertItems={data.page4.alerts.filter((a) => a.alert_type === "inventory_risk")}
                />
                <AlertSummaryChip
                  label="부정 리뷰 이슈"
                  value={`${formatNumber(data.page4.summary.reviewIssueCount)}건`}
                  tone="down"
                  tooltipTitle="부정 리뷰 이슈 산출 기준"
                  tooltipDesc="성분별 부정 키워드 등장 횟수와 부정 리뷰 비율이 임계값을 초과한 경우 이슈로 집계합니다."
                  alertItems={data.page4.alerts.filter((a) => a.alert_type === "review_issue")}
                />
              </div>

              <div className="alert-main-grid">
                <section className="card alert-list-card">
                  <div className="card-header">
                    <span>일일 경보 리스트</span>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span className="card-meta">
                        {isAlertsLoading ? "계산 중…" : data.page4.alertDate ? `${formatAlertDate(data.page4.alertDate)} 갱신 결과` : "조회 대기"}
                      </span>
                      <TooltipButton
                        tooltip="경보 조건 재계산 (느림)"
                        className="btn btn-outline update-data-button"
                        onClick={() => void loadDailyAlerts(true)}
                        style={{ width: 28, height: 28, minHeight: 28, fontSize: 14 } as React.CSSProperties}
                      >
                        {isAlertsLoading ? "…" : "↻"}
                      </TooltipButton>
                    </div>
                  </div>
                  <div className="alert-list">
                    {alertState.error ? (
                      <div className="empty-state api-state">{alertState.error}</div>
                    ) : isAlertsLoading ? (
                      <div className="empty-state api-state">daily_metric_snapshot과 alerts 데이터를 조회하는 중입니다.</div>
                    ) : data.page4.alerts.length ? (
                      data.page4.alerts.map((alert) => (
                        <button
                          className={`alert-item ${getSeverityClass(alert.severity)} ${activeAlert && alert.id === activeAlert.id ? "active" : ""}`}
                          key={alert.id}
                          type="button"
                          onClick={() => setActiveAlertId(alert.id)}
                        >
                          <span className="alert-marker">{ALERT_TYPE_LABELS[alert.alert_type]}</span>
                          <span className="alert-body">
                            <span className="alert-title-row">
                              <strong>{alert.title}</strong>
                              <span>{ALERT_SEVERITY_LABELS[alert.severity]}</span>
                            </span>
                            <p>{alert.summary}</p>
                          </span>
                          <span className="alert-metric">{formatAlertMetricValue(alert.detected_metric_value, alert.detected_metric_name)}</span>
                        </button>
                      ))
                    ) : (
                      <div className="empty-state api-state">표시할 일일 경보가 없습니다.</div>
                    )}
                  </div>
                </section>

                <aside className="card alert-detail-card">
                  <div className="card-header">경보 상세</div>
                  {activeAlert ? (
                    <AlertDetail alert={activeAlert} />
                  ) : (
                    <div className="empty-state api-state">
                      {alertState.error || (isAlertsLoading ? "경보 상세 데이터를 불러오는 중입니다." : "선택된 경보가 없습니다.")}
                    </div>
                  )}
                </aside>
              </div>
            </div>
          </article>

          <article className={`panel ${activeTab === "E" ? "active" : ""}`}>
            <div className="compact-page-layout agent-page-layout">
              <PageHeader
                badge="Page 5"
                title="5. AI Agent"
                description="앞선 분석 결과를 바탕으로 MD가 바로 활용할 수 있는 전략 초안을 제안합니다."
                statusCard={statusCard}
                compact
              />

              <div className="agent-top-grid">
                <div className="agent-input-card agent-equal-card">
                  <label htmlFor="agentPrompt">무엇을 도와드릴까요?</label>
                  <p className="agent-input-help">이번 주 성분 신호와 리뷰 이슈를 바탕으로 바로 실행할 전략을 물어보세요.</p>
                  <div className="agent-input-row">
                    <input
                      id="agentPrompt"
                      type="text"
                      placeholder={data.page5.promptPlaceholder}
                      value={agentPrompt}
                      onChange={(event) => setAgentPrompt(event.target.value)}
                      onKeyDown={(event) => { if (event.key === "Enter") void callAgent(); }}
                      disabled={agentState.status === "loading"}
                    />
                    <button
                      className="btn btn-primary agent-send-button"
                      type="button"
                      aria-label="전략 제안 받기"
                      onClick={() => void callAgent()}
                      disabled={agentState.status === "loading" || !agentPrompt.trim()}
                    >
                      {agentState.status === "loading" ? "…" : "➤"}
                    </button>
                  </div>
                  {agentState.status === "error" && (
                    <p className="agent-error">{agentState.error}</p>
                  )}
                </div>
                <div className="card suggestion-card agent-equal-card">
                  <div className="card-header">추천 질문</div>
                  <div className="suggestion-list">
                    {data.page5.suggestions.map((suggestion) => (
                      <button className="question-chip" type="button" key={suggestion} onClick={() => setAgentPrompt(suggestion)}>
                        {suggestion}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="agent-main-grid">
                <section className="agent-left-column">
                  <section className="card">
                    <div className="card-header">
                      <span>AI 추천 인사이트</span>
                    </div>
                    <div className="recommendation-grid">
                      {data.page5.insights.length === 0 ? (
                        <div className="empty-state api-state">위 질문을 입력하면 AI 인사이트가 생성됩니다.</div>
                      ) : (
                        data.page5.insights.map((item) => (
                          <article className="recommendation-card" key={item.id}>
                            <div className="recommendation-top">
                              <strong>{item.title}</strong>
                              <span>{item.level}</span>
                            </div>
                            <p className="recommendation-overview">{item.summary}</p>
                            <div className="recommendation-details">
                              <div className="action-box">
                                <span>근거 데이터</span>
                                <strong>{item.evidence}</strong>
                              </div>
                              <div className="action-box">
                                <span>추천 전략</span>
                                <strong>{item.strategy}</strong>
                              </div>
                            </div>
                          </article>
                        ))
                      )}
                    </div>
                  </section>
                </section>

                <aside className="agent-side-column">
                  <section className="card">
                    <div className="card-header">타겟 전략 카드</div>
                    {data.page5.targetStrategy.title ? (
                      <div className="target-strategy">
                        <h2>{data.page5.targetStrategy.title}</h2>
                        <div className="strategy-block">
                          <span>부정 포인트</span>
                          <div className="strategy-tags">
                            {data.page5.targetStrategy.issues.map((item) => <em key={item}>{item}</em>)}
                          </div>
                        </div>
                        <div className="strategy-block">
                          <span>제안 방향</span>
                          <ul>{data.page5.targetStrategy.directions.map((item) => <li key={item}>{item}</li>)}</ul>
                        </div>
                        <div className="strategy-block">
                          <span>추천 액션</span>
                          <ul>{data.page5.targetStrategy.actions.map((item) => <li key={item}>{item}</li>)}</ul>
                        </div>
                      </div>
                    ) : (
                      <div className="empty-state api-state">AI에게 질문하면 타겟 전략이 생성됩니다.</div>
                    )}
                  </section>
                </aside>
              </div>
            </div>
          </article>
        </section>
      </main>
    </div>
  );
}
