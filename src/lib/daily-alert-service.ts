import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildDemandSupplyMetrics,
  DEFAULT_DEMAND_SUPPLY_MATRIX_CONFIG,
  toDemandSupplyItem,
  type DemandRawDatum,
  type SupplyRawDatum,
} from "@/lib/demand-supply-matrix";
import { REVIEW_INGREDIENT_OPTIONS } from "@/lib/reviewConstants";
import { analyzeIngredientReviews } from "@/lib/reviewAnalysis";
import {
  buildAlertSummary,
  buildDailyAlerts,
  buildDailyAlertsPayload,
  buildReviewIssueSummary,
  type DailyAlertsPayload,
  type DailyMetricSnapshot,
} from "@/lib/alerts";
import type { AlertsRepository } from "@/lib/alert-repository";
import { createServerSupabaseClient, SupabaseAlertsRepository } from "@/lib/alert-repository";

type EnsureDailyAlertsOptions = {
  alertDate?: string;
  requestUrl: string;
  forceRefresh?: boolean;
  repository?: AlertsRepository;
};

type IngredientRow = {
  goods_no: string | number | null;
  ingredient_name: string | null;
};

type SnapshotRow = {
  goods_no: string | number | null;
  collected_date?: string | null;
  snapshot_date?: string | null;
  created_at?: string | null;
};

type DatalabDemandResponse = {
  page1?: {
    ingredientDemand?: unknown;
    ingredientPopularity?: unknown;
  };
};

const PAGE_SIZE = 1000;
const QUERY_CHUNK_SIZE = 180;
const SNAPSHOT_SELECT_CANDIDATES = [
  "goods_no, collected_date, snapshot_date, created_at",
  "goods_no, collected_date",
  "goods_no, snapshot_date",
  "goods_no, created_at",
  "goods_no",
] as const;
const ALERT_MATRIX_CONFIG = {
  ...DEFAULT_DEMAND_SUPPLY_MATRIX_CONFIG,
  maxBubbles: 500,
  topPerQuadrant: 500,
  minChangeRate: 0,
};

export async function ensureDailyAlerts({
  alertDate,
  requestUrl,
  forceRefresh = false,
  repository = new SupabaseAlertsRepository(),
}: EnsureDailyAlertsOptions): Promise<DailyAlertsPayload> {
  // "기준일"은 실제로 계산을 실행한 달력 날짜가 아니라, 크롤링된 데이터가 실제로
  // 존재하는 가장 최근 날짜를 의미해야 한다. 크롤링이 며칠 멈춰도 오늘 날짜로
  // 표시되면 "데이터가 매일 갱신되고 있다"는 오해를 준다.
  alertDate ??= (await fetchLatestSnapshotDate()) ?? getKoreaDateString();

  if (!forceRefresh) {
    const existingAlerts = await repository.listAlertsByDate(alertDate);
    if (existingAlerts.length) return buildDailyAlertsPayload(alertDate, existingAlerts);
  }

  const snapshot = await buildDailyMetricSnapshot(alertDate, requestUrl);
  await repository.saveDailyMetricSnapshot(snapshot);

  const generatedAlerts = buildDailyAlerts(snapshot);
  await repository.replaceDailyAlerts(alertDate, generatedAlerts);

  const persistedAlerts = await repository.listAlertsByDate(alertDate);
  return {
    ...buildDailyAlertsPayload(alertDate, persistedAlerts),
    summary: buildAlertSummary(persistedAlerts),
  };
}

async function buildDailyMetricSnapshot(alertDate: string, requestUrl: string): Promise<DailyMetricSnapshot> {
  const createdAt = new Date().toISOString();
  // 경보는 집계된 감성 비율/키워드만 필요하고 원본 리뷰 목록은 쓰지 않으므로,
  // 3페이지의 최대 300건 대신 훨씬 적은 표본으로 충분하다. Render 백엔드가 단일 워커라
  // 5개 성분을 병렬로 300건씩 돌리면 감성분석 배치가 순서대로 쌓여 Vercel 함수
  // 타임아웃을 넘기는 문제가 있었다 (성분당 최소 30건 필요 기준보다 넉넉하게 50건).
  const ALERT_REVIEW_SAMPLE_SIZE = 50;
  const [ingredientMatrix, reviewResults] = await Promise.all([
    fetchActualIngredientMatrix(requestUrl),
    Promise.all(
      REVIEW_INGREDIENT_OPTIONS.map((ingredient) => analyzeIngredientReviews(ingredient, ALERT_REVIEW_SAMPLE_SIZE)),
    ),
  ]);

  return {
    snapshotDate: alertDate,
    ingredientMatrix,
    reviewIssueSummary: buildReviewIssueSummary(reviewResults),
    createdAt,
  };
}

async function fetchActualIngredientMatrix(requestUrl: string) {
  const [supplyRows, demandRows] = await Promise.all([
    fetchSupplyRowsForAlerts(),
    fetchDemandRowsForAlerts(requestUrl),
  ]);
  const metrics = buildDemandSupplyMetrics(supplyRows, demandRows, ALERT_MATRIX_CONFIG);
  const items = metrics.map(toDemandSupplyItem);

  if (!items.length) {
    throw new Error("ingredient_matrix 계산 결과가 없습니다.");
  }

  return items;
}

async function fetchLatestSnapshotDate(): Promise<string | null> {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("product_snapshots")
    .select("collected_date")
    .not("collected_date", "is", null)
    .order("collected_date", { ascending: false })
    .limit(1);

  if (error) {
    console.error("최신 크롤링 날짜 조회 실패", error);
    return null;
  }

  return data?.[0]?.collected_date ?? null;
}

async function fetchSupplyRowsForAlerts() {
  const supabase = createServerSupabaseClient();
  const ingredientRows = await fetchAllIngredientRows(supabase);
  const goodsNos = Array.from(new Set(ingredientRows.map((row) => normalizeGoodsNo(row.goods_no)).filter(Boolean)));

  if (!ingredientRows.length || !goodsNos.length) {
    throw new Error("product_main_ingredients에서 경보 계산용 성분 데이터를 찾지 못했습니다.");
  }

  const snapshotRows = await fetchSnapshotRows(supabase, goodsNos);
  const datesByGoodsNo = new Map<string, string[]>();

  snapshotRows.forEach((row) => {
    const goodsNo = normalizeGoodsNo(row.goods_no);
    const date = getSnapshotDate(row);
    if (!goodsNo || !date) return;
    const dates = datesByGoodsNo.get(goodsNo) || [];
    dates.push(date);
    datesByGoodsNo.set(goodsNo, dates);
  });

  return ingredientRows.flatMap((row): SupplyRawDatum[] => {
    const goodsNo = normalizeGoodsNo(row.goods_no);
    const ingredientName = normalizeText(row.ingredient_name);
    if (!goodsNo || !ingredientName) return [];

    return [{
      ingredientName,
      goodsNo,
      brand: "",
      category: "",
      collectedDates: Array.from(new Set(datesByGoodsNo.get(goodsNo) || [])),
    }];
  });
}

async function fetchAllIngredientRows(supabase: SupabaseClient) {
  const rows: IngredientRow[] = [];

  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("product_main_ingredients")
      .select("goods_no, ingredient_name")
      .range(from, from + PAGE_SIZE - 1);

    if (error) throw new Error(`product_main_ingredients 조회 실패: ${error.message}`);

    const page = (data || []) as unknown as IngredientRow[];
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
  }

  return rows;
}

async function fetchSnapshotRows(supabase: SupabaseClient, goodsNos: string[]) {
  let lastError = "";

  for (const selectQuery of SNAPSHOT_SELECT_CANDIDATES) {
    const rows: SnapshotRow[] = [];
    let hasError = false;

    for (const goodsNoChunk of chunk(goodsNos, QUERY_CHUNK_SIZE)) {
      for (let from = 0; ; from += PAGE_SIZE) {
        const { data, error } = await supabase
          .from("product_snapshots")
          .select(selectQuery as string)
          .in("goods_no", goodsNoChunk)
          .range(from, from + PAGE_SIZE - 1);

        if (error) {
          lastError = error.message;
          hasError = true;
          break;
        }

        const page = (data || []) as unknown as SnapshotRow[];
        rows.push(...page);
        if (page.length < PAGE_SIZE) break;
      }

      if (hasError) break;
    }

    if (!hasError) return rows;
  }

  throw new Error(`product_snapshots 조회 실패: ${lastError || "필요한 컬럼을 찾지 못했습니다."}`);
}

async function fetchDemandRowsForAlerts(requestUrl: string): Promise<DemandRawDatum[]> {
  const response = await fetch(new URL("/api/dashboard/datalab-weekly-interest", requestUrl), {
    cache: "no-store",
  });
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(getApiErrorMessage(payload));
  }

  const body = payload as DatalabDemandResponse;
  const sourceRows = Array.isArray(body.page1?.ingredientDemand)
    ? body.page1.ingredientDemand as Record<string, unknown>[]
    : Array.isArray(body.page1?.ingredientPopularity)
      ? body.page1.ingredientPopularity as Record<string, unknown>[]
      : [];
  const demandRows = sourceRows.flatMap((row): DemandRawDatum[] => {
    const ingredientName = getDemandRowLabel(row);
    const recent = getFirstNumber(row, ["currentWeekIndex", "current_week_index", "search_index_recent", "searchIndex", "search_index"]);
    const previous = getFirstNumber(row, ["previousWeekIndex", "previous_week_index", "search_index_previous"]);
    const previousMonth = getFirstNumber(row, ["previousMonthIndex", "previous_month_index", "searchIndexPreviousMonth"]);

    if (!ingredientName || recent === null) return [];

    return [{
      ingredientName,
      searchIndexRecent: recent,
      searchIndexPrevious: previous ?? recent,
      searchIndexPreviousMonth: previousMonth ?? previous ?? recent,
      source: "naver_datalab",
    }];
  });

  if (!demandRows.length) {
    throw new Error("네이버 데이터랩 수요 데이터를 불러오지 못했습니다.");
  }

  return demandRows;
}

function getDemandRowLabel(row: Record<string, unknown>) {
  return String(
    row.label ||
    row.ingredient_label ||
    row.ingredientName ||
    row.ingredient_name ||
    row.keyword ||
    row.title ||
    "",
  ).trim();
}

function getFirstNumber(row: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = row[key];
    if (value === null || value === undefined || value === "") continue;
    const number = Number(value);
    if (Number.isFinite(number)) return number;
  }

  return null;
}

function getApiErrorMessage(payload: unknown) {
  const row = payload as { message?: unknown; detail?: unknown; error?: unknown };
  if (typeof row.message === "string") return row.message;
  if (typeof row.detail === "string") return row.detail;
  if (typeof row.error === "string") return row.error;
  return "네이버 데이터랩 수요 데이터를 불러오지 못했습니다.";
}

function getSnapshotDate(row: SnapshotRow) {
  return String(row.collected_date || row.snapshot_date || row.created_at || "").slice(0, 10);
}

function normalizeGoodsNo(value: unknown) {
  return String(value ?? "").trim();
}

function normalizeText(value: unknown) {
  return String(value ?? "").trim();
}

function getKoreaDateString(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value || "0000";
  const month = parts.find((part) => part.type === "month")?.value || "00";
  const day = parts.find((part) => part.type === "day")?.value || "00";

  return `${year}-${month}-${day}`;
}

function chunk<T>(items: T[], size: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}
