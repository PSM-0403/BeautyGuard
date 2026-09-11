import type { DemandSupplyItem, IngredientMetric } from "@/lib/types";
import { createClient } from "@/utils/supabase/client";

type MatrixIngredientTarget = {
  id: string;
  label: string;
  aliases: string[];
};

type ProductIngredientRow = {
  goods_no: string | number | null;
  ingredient_name: string | null;
};

type SupplyProductRow = {
  goods_no: string | number | null;
  brand?: string | null;
  category?: string | null;
  category_name?: string | null;
  display_category_name?: string | null;
  disp_cat_name?: string | null;
};

type SupplySnapshotRow = {
  goods_no: string | number | null;
  collected_date: string | null;
};

export type SupplyRawDatum = {
  ingredientName: string;
  goodsNo: string;
  brand: string;
  category: string;
  collectedDates: string[];
};

export type DemandRawDatum = {
  ingredientName: string;
  searchIndexRecent: number;
  searchIndexPrevious: number;
  searchIndexPreviousMonth?: number;
  source: "naver_datalab";
};

type DemandRawDataResult = {
  rows: DemandRawDatum[];
  source: DemandRawDatum["source"];
  error: string;
};

type FlexibleDemandRow = Record<string, unknown>;

type DashboardSummaryResponse = {
  page1?: {
    ingredientPopularity?: unknown;
    ingredientDemand?: unknown;
  };
};

export type DemandSupplyMatrixConfig = {
  threshold: number;
  maxBubbles: number;
  topPerQuadrant: number;
  minChangeRate: number;
  selectedIngredients: string[];
};

export type DemandSupplyMatrixResult = {
  items: DemandSupplyItem[];
  error: string;
  isUnavailable: boolean;
  dataSource: DemandRawDatum["source"] | "missing_naver_datalab";
};

const PAGE_SIZE = 1000;
const QUERY_CHUNK_SIZE = 180;
const INGREDIENT_NAME_COLUMN = "ingredient_name";
const NAVER_DEMAND_API_REQUIRED_MESSAGE = "네이버 데이터랩 수요 데이터를 불러오지 못했습니다.";
const SUPPLY_PRODUCT_SELECT_CANDIDATES = [
  "goods_no, brand, category, category_name, display_category_name, disp_cat_name",
  "goods_no, brand, category_name",
  "goods_no, brand",
  "goods_no",
] as const;

// Empty selectedIngredients means: calculate candidates from all main ingredients in Supabase,
// then show only strategically important bubbles (large change, opportunity, oversupply, quadrant representatives, alerts).
export const DEFAULT_SELECTED_INGREDIENTS: string[] = [];

export const DEFAULT_DEMAND_SUPPLY_MATRIX_CONFIG: DemandSupplyMatrixConfig = {
  threshold: 60,
  maxBubbles: 12,
  topPerQuadrant: 3,
  minChangeRate: 10,
  selectedIngredients: DEFAULT_SELECTED_INGREDIENTS,
};

const MATRIX_INGREDIENT_TARGETS: MatrixIngredientTarget[] = [
  { id: "retinol", label: "레티놀", aliases: ["레티놀", "retinol"] },
  { id: "pdrn", label: "PDRN", aliases: ["PDRN", "피디알엔", "pdrn"] },
  { id: "niacinamide", label: "나이아신아마이드", aliases: ["나이아신아마이드", "나이아신 아마이드", "niacinamide"] },
  { id: "ceramide", label: "세라마이드", aliases: ["세라마이드", "ceramide"] },
  { id: "panthenol", label: "판테놀", aliases: ["판테놀", "panthenol"] },
  { id: "hyaluronic_acid", label: "히알루론산", aliases: ["히알루론산", "히알루론", "hyaluronic acid", "hyaluronic_acid", "HA"] },
  { id: "centella", label: "병풀/시카", aliases: ["병풀/시카", "병풀", "시카", "centella", "cica"] },
];

export async function fetchSupplyRawData(config: Partial<DemandSupplyMatrixConfig> = {}): Promise<SupplyRawDatum[]> {
  const resolvedConfig = resolveConfig(config);
  const configuredTargets = getSelectedTargets(resolvedConfig.selectedIngredients);
  const ingredientFilter = configuredTargets.length ? buildIngredientFilter(configuredTargets) : "";
  const supabase = createClient();
  const ingredientRows = await fetchIngredientRows(supabase, ingredientFilter);
  const targets = configuredTargets.length ? configuredTargets : buildTargetsFromIngredientRows(ingredientRows);
  const goodsNos = Array.from(new Set(ingredientRows.map((row) => normalizeGoodsNo(row.goods_no)).filter(Boolean)));

  if (!goodsNos.length) return [];

  const [productRows, snapshotRows] = await Promise.all([
    fetchSupplyProductRows(supabase, goodsNos),
    fetchSupplySnapshotRows(supabase, goodsNos),
  ]);

  return buildSupplyRawRows(ingredientRows, productRows, snapshotRows, targets);
}

export async function fetchNaverDemandData(config: Partial<DemandSupplyMatrixConfig> = {}): Promise<DemandRawDataResult> {
  const resolvedConfig = resolveConfig(config);
  const configuredTargets = getSelectedTargets(resolvedConfig.selectedIngredients);

  try {
    const response = await fetch("/api/dashboard/datalab-weekly-interest");
    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(getApiErrorMessage(payload));
    }

    const summary = payload as DashboardSummaryResponse;
    const sourceRows = Array.isArray(summary.page1?.ingredientDemand)
      ? (summary.page1.ingredientDemand as FlexibleDemandRow[])
      : Array.isArray(summary.page1?.ingredientPopularity)
        ? (summary.page1.ingredientPopularity as FlexibleDemandRow[])
        : [];
    const targets = configuredTargets.length ? configuredTargets : buildTargetsFromDemandRows(sourceRows);
    const rows = normalizeFlexibleDemandRows(sourceRows, targets);
    if (rows.length) {
      return { rows, source: "naver_datalab", error: "" };
    }
  } catch (error) {
    console.error("Naver DataLab 수요 데이터 조회 실패", error);
  }

  console.error("네이버 데이터랩 수요 API가 필요합니다.", {
    requiredEndpoint: "/api/dashboard/datalab-weekly-interest",
    requiredShape: {
      ingredientDemand: [{
        label: "string",
        currentWeekIndex: "number",
        previousWeekIndex: "number",
        previousMonthIndex: "number(optional)",
      }],
    },
  });

  return {
    rows: [],
    source: "naver_datalab",
    error: NAVER_DEMAND_API_REQUIRED_MESSAGE,
  };
}

export async function fetchDemandSupplyMatrixFromSupabase(
  config: Partial<DemandSupplyMatrixConfig> = {},
): Promise<DemandSupplyMatrixResult> {
  const resolvedConfig = resolveConfig(config);

  try {
    const [supplyRawData, demandRawData] = await Promise.all([
      fetchSupplyRawData(resolvedConfig),
      fetchNaverDemandData(resolvedConfig),
    ]);

    if (demandRawData.error || !demandRawData.rows.length) {
      return {
        items: [],
        error: demandRawData.error || NAVER_DEMAND_API_REQUIRED_MESSAGE,
        isUnavailable: true,
        dataSource: "missing_naver_datalab",
      };
    }

    const metrics = buildDemandSupplyMetrics(supplyRawData, demandRawData.rows, resolvedConfig);

    if (!metrics.length) {
      throw new Error("표시 조건에 해당하는 수요-공급 성분 데이터가 없습니다.");
    }

    return {
      items: metrics.map(toDemandSupplyItem),
      error: "",
      isUnavailable: false,
      dataSource: demandRawData.source,
    };
  } catch (error) {
    console.error("수요-공급 매트릭스 원천 데이터 계산 실패", error);

    return {
      items: [],
      error: error instanceof Error ? error.message : NAVER_DEMAND_API_REQUIRED_MESSAGE,
      isUnavailable: true,
      dataSource: "missing_naver_datalab",
    };
  }
}

export function buildDemandSupplyMetrics(
  supplyRows: SupplyRawDatum[],
  demandRows: DemandRawDatum[],
  config: Partial<DemandSupplyMatrixConfig> = {},
): IngredientMetric[] {
  const resolvedConfig = resolveConfig(config);
  const targets = resolveAnalysisTargets(supplyRows, demandRows, resolvedConfig.selectedIngredients);
  const supplyMetrics = buildSupplyMetrics(supplyRows, targets);
  const demandByIngredient = new Map<string, DemandRawDatum>();

  demandRows.forEach((row) => {
    const target = findTargetByName(row.ingredientName, targets);
    if (!target) return;
    demandByIngredient.set(target.label, row);
  });

  const demandMax = Math.max(
    1,
    ...Array.from(demandByIngredient.values()).flatMap((row) => [
      row.searchIndexRecent,
      row.searchIndexPrevious,
      row.searchIndexPreviousMonth || 0,
    ]),
  );
  const shouldNormalizeDemand = demandMax > 100;
  const productMax = Math.max(1, ...Array.from(supplyMetrics.values()).map((row) => row.productCount));

  const metrics = targets.flatMap((target) => {
    const demand = demandByIngredient.get(target.label);
    if (!demand) return [];

    const supply = supplyMetrics.get(target.label) || {
      productCount: 0,
      previousProductCount: 0,
      brandCount: 0,
      categoryCount: 0,
      supplyGrowthRate: 0,
      supplyGrowthCount: 0,
    };
    const demandScore = valueToScore(demand.searchIndexRecent, demandMax, shouldNormalizeDemand);
    const previousDemandScore = valueToScore(demand.searchIndexPrevious, demandMax, shouldNormalizeDemand);
    const previousMonthDemandScore = valueToScore(demand.searchIndexPreviousMonth ?? demand.searchIndexPrevious, demandMax, shouldNormalizeDemand);
    const demandGrowthRate = calculateGrowthRate(demandScore, previousDemandScore);
    const demandMonthOverMonthRate = calculateGrowthRate(demandScore, previousMonthDemandScore);
    const supplyScore = clampScore((supply.productCount / productMax) * 100);
    const previousSupplyScore = clampScore((supply.previousProductCount / productMax) * 100);
    const gap = demandScore - supplyScore;
    const previousGap = previousDemandScore - previousSupplyScore;
    const gapDelta = gap - previousGap;
    const quadrant = getQuadrant(demandScore, supplyScore, resolvedConfig.threshold);
    const opportunityScore = clampScore(
      Math.max(0, gap) * 0.7 + Math.max(0, gapDelta) * 0.2 + Math.max(0, demandGrowthRate) * 0.1,
    );
    const oversupplyScore = clampScore(
      Math.max(0, -gap) * 0.65 + Math.max(0, supply.supplyGrowthRate) * 0.2 + Math.max(0, -demandGrowthRate) * 0.15,
    );
    const bubbleSize = clamp(18 + Math.sqrt(Math.max(0, supply.productCount)) * 1.6 + demandScore * 0.12, 18, 52);

    return [{
      ingredientId: target.id,
      ingredientName: target.label,
      demandScore,
      supplyScore,
      demandGrowthRate: round(demandGrowthRate, 1),
      demandMonthOverMonthRate: round(demandMonthOverMonthRate, 1),
      supplyGrowthRate: round(supply.supplyGrowthRate, 1),
      supplyGrowthCount: supply.supplyGrowthCount,
      opportunityScore: round(opportunityScore, 1),
      oversupplyScore: round(oversupplyScore, 1),
      quadrant,
      bubbleSize: round(bubbleSize),
      previousDemandScore,
      previousSupplyScore,
      gap: round(gap, 1),
      previousGap: round(previousGap, 1),
      gapDelta: round(gapDelta, 1),
      productCount: supply.productCount,
      previousProductCount: supply.previousProductCount,
    } satisfies IngredientMetric];
  });

  return limitMetrics(metrics, resolvedConfig);
}

async function fetchIngredientRows(supabase: ReturnType<typeof createClient>, ingredientFilter: string) {
  const rows: ProductIngredientRow[] = [];

  for (let from = 0; ; from += PAGE_SIZE) {
    let query = supabase
      .from("product_main_ingredients")
      .select(`goods_no, ${INGREDIENT_NAME_COLUMN}`)
      .range(from, from + PAGE_SIZE - 1);

    if (ingredientFilter) {
      query = query.or(ingredientFilter);
    }

    const { data, error } = await query;

    if (error) throw new Error(`product_main_ingredients 조회 실패: ${error.message}`);

    const page = (data || []) as ProductIngredientRow[];
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
  }

  return rows;
}

async function fetchSupplyProductRows(supabase: ReturnType<typeof createClient>, goodsNos: string[]) {
  const rows: SupplyProductRow[] = [];

  for (const goodsNoChunk of chunk(goodsNos, QUERY_CHUNK_SIZE)) {
    for (let from = 0; ; from += PAGE_SIZE) {
      const { data, error } = await selectWithFallback<SupplyProductRow>(
        supabase,
        "products",
        SUPPLY_PRODUCT_SELECT_CANDIDATES,
        (query) => query.in("goods_no", goodsNoChunk).range(from, from + PAGE_SIZE - 1),
      );

      if (error) throw new Error(`products 조회 실패: ${error.message}`);

      const page = (data || []) as SupplyProductRow[];
      rows.push(...page);
      if (page.length < PAGE_SIZE) break;
    }
  }

  return rows;
}

async function fetchSupplySnapshotRows(supabase: ReturnType<typeof createClient>, goodsNos: string[]) {
  const rows: SupplySnapshotRow[] = [];

  for (const goodsNoChunk of chunk(goodsNos, QUERY_CHUNK_SIZE)) {
    for (let from = 0; ; from += PAGE_SIZE) {
      const { data, error } = await supabase
        .from("product_snapshots")
        .select("goods_no, collected_date")
        .in("goods_no", goodsNoChunk)
        .range(from, from + PAGE_SIZE - 1);

      if (error) throw new Error(`product_snapshots 조회 실패: ${error.message}`);

      const page = (data || []) as SupplySnapshotRow[];
      rows.push(...page);
      if (page.length < PAGE_SIZE) break;
    }
  }

  return rows;
}

function buildSupplyRawRows(
  ingredientRows: ProductIngredientRow[],
  productRows: SupplyProductRow[],
  snapshotRows: SupplySnapshotRow[],
  targets: MatrixIngredientTarget[],
) {
  const productInfo = new Map<string, { brand: string; category: string }>();
  const snapshotDates = new Map<string, Set<string>>();
  const rows: SupplyRawDatum[] = [];

  productRows.forEach((row) => {
    const goodsNo = normalizeGoodsNo(row.goods_no);
    if (!goodsNo) return;
    productInfo.set(goodsNo, {
      brand: normalizeText(row.brand),
      category: getCategoryName(row),
    });
  });

  snapshotRows.forEach((row) => {
    const goodsNo = normalizeGoodsNo(row.goods_no);
    if (!goodsNo || !row.collected_date) return;
    const dates = snapshotDates.get(goodsNo) || new Set<string>();
    dates.add(row.collected_date);
    snapshotDates.set(goodsNo, dates);
  });

  ingredientRows.forEach((row) => {
    const goodsNo = normalizeGoodsNo(row.goods_no);
    const target = findTargetByName(row.ingredient_name, targets);
    if (!goodsNo || !target) return;
    const product = productInfo.get(goodsNo);

    rows.push({
      ingredientName: target.label,
      goodsNo,
      brand: product?.brand || "",
      category: product?.category || "",
      collectedDates: Array.from(snapshotDates.get(goodsNo) || []),
    });
  });

  return rows;
}

function normalizeFlexibleDemandRows(
  rows: FlexibleDemandRow[],
  targets: MatrixIngredientTarget[],
) {
  const grouped = new Map<string, FlexibleDemandRow[]>();

  rows.forEach((row) => {
    const label = getDemandRowLabel(row);
    const target = findTargetByName(label, targets);
    if (!target) return;
    const currentRows = grouped.get(target.label) || [];
    currentRows.push(row);
    grouped.set(target.label, currentRows);
  });

  return targets.flatMap((target) => {
    const targetRows = grouped.get(target.label) || [];
    if (!targetRows.length) return [];

    const direct = normalizeDirectDemandRow(targetRows[0], target.label);
    if (direct) return [direct];

    const sortedRows = targetRows.slice().sort((a, b) => getDemandRowTime(a).localeCompare(getDemandRowTime(b)));
    const recentRows = sortedRows.slice(-7);
    const previousRows = sortedRows.slice(-14, -7);
    const previousMonthRows = sortedRows.slice(-37, -7);
    const recentIndex = averageNumbers(recentRows.map(getDemandRowIndex));
    const previousIndex = averageNumbers(previousRows.map(getDemandRowIndex));
    const previousMonthIndex = averageNumbers(previousMonthRows.map(getDemandRowIndex));

    if (recentIndex === null) return [];

    return [{
      ingredientName: target.label,
      searchIndexRecent: recentIndex,
      searchIndexPrevious: previousIndex ?? recentIndex,
      searchIndexPreviousMonth: previousMonthIndex ?? previousIndex ?? recentIndex,
      source: "naver_datalab" as const,
    }];
  });
}

function normalizeDirectDemandRow(
  row: FlexibleDemandRow,
  ingredientName: string,
): DemandRawDatum | null {
  const recent = getFirstNumber(row, [
    "currentWeekIndex",
    "current_week_index",
    "this_week_index",
    "search_index_recent",
    "demand_score",
    "current_index",
    "recent_index",
    "searchIndexRecent",
    "searchIndex",
  ]);
  const previous = getFirstNumber(row, [
    "previousWeekIndex",
    "previous_week_index",
    "last_week_index",
    "search_index_previous",
    "prev_demand_score",
    "previous_index",
    "searchIndexPrevious",
  ]);
  const previousMonth = getFirstNumber(row, [
    "previousMonthIndex",
    "previous_month_index",
    "last_month_index",
    "previous_30d_index",
    "previous30DayIndex",
    "searchIndexPreviousMonth",
  ]);

  if (recent === null) return null;

  return {
    ingredientName,
    searchIndexRecent: recent,
    searchIndexPrevious: previous ?? recent,
    searchIndexPreviousMonth: previousMonth ?? previous ?? recent,
    source: "naver_datalab",
  };
}

function buildSupplyMetrics(rows: SupplyRawDatum[], targets: MatrixIngredientTarget[]) {
  const grouped = new Map<string, {
    goodsNos: Set<string>;
    brands: Set<string>;
    categories: Set<string>;
    latestGoodsNos: Set<string>;
    previousGoodsNos: Set<string>;
  }>();
  const dates = Array.from(new Set(rows.flatMap((row) => row.collectedDates))).filter(Boolean).sort();
  const latestDate = dates.at(-1) || "";
  const previousDate = dates.at(-2) || "";

  targets.forEach((target) => {
    grouped.set(target.label, {
      goodsNos: new Set<string>(),
      brands: new Set<string>(),
      categories: new Set<string>(),
      latestGoodsNos: new Set<string>(),
      previousGoodsNos: new Set<string>(),
    });
  });

  rows.forEach((row) => {
    const target = findTargetByName(row.ingredientName, targets);
    if (!target) return;
    const bucket = grouped.get(target.label);
    if (!bucket) return;

    bucket.goodsNos.add(row.goodsNo);
    if (row.brand) bucket.brands.add(row.brand);
    if (row.category) bucket.categories.add(row.category);
    if (!latestDate || row.collectedDates.includes(latestDate)) bucket.latestGoodsNos.add(row.goodsNo);
    if (previousDate && row.collectedDates.includes(previousDate)) bucket.previousGoodsNos.add(row.goodsNo);
  });

  return new Map(Array.from(grouped.entries()).map(([label, bucket]) => {
    const currentProductCount = bucket.latestGoodsNos.size || bucket.goodsNos.size;
    const previousProductCount = previousDate ? bucket.previousGoodsNos.size : currentProductCount;
    const supplyGrowthCount = currentProductCount - previousProductCount;

    return [label, {
      productCount: currentProductCount,
      previousProductCount,
      brandCount: bucket.brands.size,
      categoryCount: bucket.categories.size,
      supplyGrowthRate: calculateGrowthRate(currentProductCount, previousProductCount),
      supplyGrowthCount,
    }];
  }));
}

function resolveConfig(config: Partial<DemandSupplyMatrixConfig>): DemandSupplyMatrixConfig {
  return {
    ...DEFAULT_DEMAND_SUPPLY_MATRIX_CONFIG,
    ...config,
    selectedIngredients: config.selectedIngredients || DEFAULT_DEMAND_SUPPLY_MATRIX_CONFIG.selectedIngredients,
  };
}

function getSelectedTargets(selectedIngredients: string[]) {
  if (!selectedIngredients.length) return [];

  const selectedNames = new Set(selectedIngredients.map(normalizeIngredientName));
  const knownTargets = MATRIX_INGREDIENT_TARGETS.filter((target) =>
    selectedNames.has(normalizeIngredientName(target.label)) ||
    target.aliases.some((alias) => selectedNames.has(normalizeIngredientName(alias))),
  );
  const knownLabels = new Set(knownTargets.map((target) => normalizeIngredientName(target.label)));
  const customTargets = selectedIngredients
    .filter((name) => !knownLabels.has(normalizeIngredientName(name)))
    .map((name) => makeTarget(name));

  return [...knownTargets, ...customTargets];
}

function resolveAnalysisTargets(supplyRows: SupplyRawDatum[], demandRows: DemandRawDatum[], selectedIngredients: string[]) {
  const selectedTargets = getSelectedTargets(selectedIngredients);
  if (selectedTargets.length) return selectedTargets;

  const labels = new Set<string>();
  demandRows.forEach((row) => labels.add(row.ingredientName));
  supplyRows.forEach((row) => labels.add(row.ingredientName));
  return Array.from(labels).map((label) => findKnownTarget(label) || makeTarget(label));
}

function buildTargetsFromIngredientRows(rows: ProductIngredientRow[]) {
  const labels = Array.from(new Set(rows.map((row) => normalizeText(row.ingredient_name)).filter(Boolean)));
  return labels.map((label) => findKnownTarget(label) || makeTarget(label));
}

function buildTargetsFromDemandRows(rows: FlexibleDemandRow[]) {
  const labels = Array.from(new Set(rows.map(getDemandRowLabel).filter(Boolean)));
  return labels.map((label) => findKnownTarget(label) || makeTarget(label));
}

function findKnownTarget(label: string) {
  return findTargetByName(label, MATRIX_INGREDIENT_TARGETS);
}

function makeTarget(label: string): MatrixIngredientTarget {
  return {
    id: normalizeIngredientName(label) || label,
    label,
    aliases: [label],
  };
}

function buildIngredientFilter(targets: MatrixIngredientTarget[]) {
  const aliases = Array.from(new Set(targets.flatMap((target) => target.aliases)));
  return aliases.map((alias) => `${INGREDIENT_NAME_COLUMN}.ilike.%${alias}%`).join(",");
}

function limitMetrics(metrics: IngredientMetric[], config: DemandSupplyMatrixConfig) {
  const selectedOrder = new Map(config.selectedIngredients.map((name, index) => [normalizeIngredientName(name), index]));
  const candidateMetrics = selectedOrder.size
    ? metrics.filter((metric) => selectedOrder.has(normalizeIngredientName(metric.ingredientName)))
    : metrics;
  const picked = new Map<string, IngredientMetric>();
  const add = (items: IngredientMetric[]) => {
    items.forEach((item) => {
      if (picked.size < config.maxBubbles) picked.set(normalizeIngredientName(item.ingredientName), item);
    });
  };
  const top = (items: IngredientMetric[], score: (metric: IngredientMetric) => number, limit: number) =>
    items.slice().sort((a, b) => score(b) - score(a)).slice(0, limit);

  add(top(candidateMetrics.filter((metric) => hasLargeChange(metric, config)), getChangePriority, config.topPerQuadrant));
  add(top(candidateMetrics, (metric) => metric.opportunityScore, config.topPerQuadrant));
  add(top(candidateMetrics, (metric) => metric.oversupplyScore, config.topPerQuadrant));

  const quadrants: IngredientMetric["quadrant"][] = ["growth", "opportunity", "oversupply", "watch"];
  quadrants.forEach((quadrant) => {
    add(top(candidateMetrics.filter((metric) => metric.quadrant === quadrant), getMetricPriority, config.topPerQuadrant));
  });

  add(top(candidateMetrics.filter((metric) => isAlertMetric(metric, config)), getAlertPriority, config.topPerQuadrant));

  if (picked.size < Math.min(config.maxBubbles, candidateMetrics.length)) {
    add(top(candidateMetrics, getMetricPriority, config.maxBubbles));
  }

  return Array.from(picked.values())
    .sort((a, b) => getMetricPriority(b) - getMetricPriority(a))
    .slice(0, config.maxBubbles);
}

export function toDemandSupplyItem(metric: IngredientMetric): DemandSupplyItem {
  return {
    ingredient: metric.ingredientName,
    demand: metric.demandScore,
    supply: metric.supplyScore,
    growth: metric.demandGrowthRate,
    size: metric.bubbleSize,
    status: metric.quadrant === "watch" ? "stable" : metric.quadrant,
    previousDemand: metric.previousDemandScore,
    previousSupply: metric.previousSupplyScore,
    demandWow: metric.demandGrowthRate,
    demandMom: metric.demandMonthOverMonthRate,
    supplyWow: metric.supplyGrowthRate,
    supplyGrowthCount: metric.supplyGrowthCount,
    gap: metric.gap,
    previousGap: metric.previousGap,
    gapDelta: metric.gapDelta,
    opportunityScore: metric.opportunityScore,
    oversupplyScore: metric.oversupplyScore,
    supplyCount: metric.productCount,
    previousSupplyCount: metric.previousProductCount,
  };
}

function hasLargeChange(metric: IngredientMetric, config: DemandSupplyMatrixConfig) {
  return Math.abs(metric.demandGrowthRate) >= config.minChangeRate ||
    Math.abs(metric.supplyGrowthRate) >= config.minChangeRate ||
    Math.abs(metric.gapDelta || 0) >= config.minChangeRate;
}

function isAlertMetric(metric: IngredientMetric, config: DemandSupplyMatrixConfig) {
  return Math.abs(metric.demandGrowthRate) >= config.minChangeRate * 2 ||
    Math.abs(metric.supplyGrowthRate) >= config.minChangeRate * 2 ||
    Math.abs(metric.gapDelta || 0) >= config.minChangeRate * 1.5 ||
    metric.opportunityScore >= 70 ||
    metric.oversupplyScore >= 70;
}

function getChangePriority(metric: IngredientMetric) {
  return Math.max(
    Math.abs(metric.demandGrowthRate),
    Math.abs(metric.supplyGrowthRate),
    Math.abs(metric.gapDelta || 0),
  );
}

function getAlertPriority(metric: IngredientMetric) {
  return getChangePriority(metric) + Math.max(metric.opportunityScore, metric.oversupplyScore) * 0.35;
}

function getQuadrant(demandScore: number, supplyScore: number, threshold: number): IngredientMetric["quadrant"] {
  const highDemand = demandScore >= threshold;
  const highSupply = supplyScore >= threshold;

  if (highDemand && highSupply) return "growth";
  if (highDemand && !highSupply) return "opportunity";
  if (!highDemand && highSupply) return "oversupply";
  return "watch";
}

function getMetricPriority(metric: IngredientMetric) {
  return Math.max(
    metric.opportunityScore,
    metric.oversupplyScore,
    metric.demandScore + Math.max(0, metric.demandGrowthRate) * 0.35,
    getChangePriority(metric) * 0.8,
  );
}

function findTargetByName(value: unknown, targets: MatrixIngredientTarget[]) {
  const normalizedName = normalizeIngredientName(value);
  if (!normalizedName) return undefined;

  return targets.find((target) =>
    normalizeIngredientName(target.label) === normalizedName ||
    target.aliases.some((alias) => {
      const normalizedAlias = normalizeIngredientName(alias);
      return normalizedName === normalizedAlias || normalizedName.includes(normalizedAlias) || normalizedAlias.includes(normalizedName);
    }),
  );
}

function getDemandRowLabel(row: FlexibleDemandRow) {
  return String(
    row.ingredient_name ||
    row.ingredient_label ||
    row.ingredientName ||
    row.keyword ||
    row.query ||
    row.label ||
    row.title ||
    "",
  );
}

function getDemandRowIndex(row?: FlexibleDemandRow) {
  if (!row) return null;

  return getFirstNumber(row, [
    "search_index",
    "searchIndex",
    "ratio",
    "value",
    "index",
  ]);
}

function getDemandRowTime(row: FlexibleDemandRow) {
  return String(
    row.period ||
    row.week_start ||
    row.period_start ||
    row.collected_date ||
    row.measured_at ||
    row.created_at ||
    "",
  );
}

function getFirstNumber(row: FlexibleDemandRow, keys: string[]) {
  for (const key of keys) {
    if (!(key in row)) continue;
    if (row[key] === null || row[key] === undefined || row[key] === "") continue;
    const value = toNumber(row[key]);
    if (Number.isFinite(value)) return value;
  }

  return null;
}

function averageNumbers(values: Array<number | null>) {
  const numbers = values.filter((value): value is number => Number.isFinite(value));
  if (!numbers.length) return null;
  return numbers.reduce((sum, value) => sum + value, 0) / numbers.length;
}

function getCategoryName(row: SupplyProductRow) {
  return normalizeText(
    row.category ||
    row.category_name ||
    row.display_category_name ||
    row.disp_cat_name ||
    "",
  );
}

function getApiErrorMessage(payload: unknown) {
  const row = payload as { message?: unknown; detail?: unknown; error?: unknown };
  if (typeof row.message === "string") return row.message;
  if (typeof row.detail === "string") return row.detail;
  if (typeof row.error === "string") return row.error;
  return "FastAPI 요청에 실패했습니다.";
}

async function selectWithFallback<T>(
  supabase: ReturnType<typeof createClient>,
  tableName: string,
  selectCandidates: readonly string[],
  applyQuery: (query: any) => PromiseLike<{ data: unknown; error: { message: string } | null }>,
) {
  let lastError: { message: string } | null = null;

  for (const selectColumns of selectCandidates) {
    const result = await applyQuery(supabase.from(tableName).select(selectColumns));
    if (!result.error) return { data: result.data as T[] | null, error: null };
    lastError = result.error;
    console.error(`${tableName} select 후보 실패`, { selectColumns, error: result.error.message });
  }

  return { data: null, error: lastError };
}

function normalizeGoodsNo(value: string | number | null) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function normalizeText(value: unknown) {
  return String(value || "").trim();
}

function normalizeIngredientName(value: unknown) {
  return String(value || "").toLocaleLowerCase("ko-KR").replace(/\s+/g, "");
}

function toNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return 0;
  const number = typeof value === "number" ? value : Number(String(value).replace(/,/g, ""));
  return Number.isFinite(number) ? number : 0;
}

function calculateGrowthRate(recent: number, previous: number) {
  if (previous <= 0) return recent > 0 ? 100 : 0;
  return ((recent - previous) / previous) * 100;
}

function valueToScore(value: number, maxValue: number, shouldNormalize: boolean) {
  return clampScore(shouldNormalize ? (value / Math.max(1, maxValue)) * 100 : value);
}

function clampScore(value: number) {
  return round(clamp(value, 0, 100));
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function round(value: number, digits = 0) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function chunk<T>(items: T[], size: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}
