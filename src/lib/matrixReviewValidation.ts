import { createClient } from "@/utils/supabase/client";
import {
  DEFAULT_DEMAND_SUPPLY_MATRIX_CONFIG,
  MATRIX_INGREDIENT_TARGETS,
  fetchDemandSupplyMatrixFromSupabase,
} from "@/lib/demand-supply-matrix";
import type { DemandSupplyItem } from "@/lib/types";

// 수요-공급 매트릭스는 "검색 관심도(수요)"와 "제품 수(공급)"만으로 성분을 4분면에
// 배치한다. 이 분류가 실제 소비자 반응과도 맞는지 -- 즉 "기회" 성분이 정말 반응이
// 좋아서 기회인지, 아니면 단순히 공급이 적을 뿐인지 -- 별도로 수집된 리뷰 감성/평점
// 데이터로 교차검증한다. 두 신호(수요-공급 매트릭스, 리뷰 반응)는 서로 다른
// 데이터 소스(네이버 데이터랩 검색량 vs 올리브영 리뷰)에서 독립적으로 계산되므로,
// 둘이 일치하면 분류의 신뢰도를 보강하는 근거가 된다.
//
// 주의: Page 1의 매트릭스 버블차트는 전체 ~25개 후보 성분 중 그날그날 "눈에 띄는"
// 12개만 뽑아서 보여준다 (limitMetrics). 그 결과를 그대로 재사용하면 레티놀/PDRN처럼
// 핵심 7개 성분인데도 그날 상위 12개에 못 들면 리뷰 데이터가 멀쩡해도 "매트릭스에
// 없음"으로 빠지는 문제가 생긴다. 그래서 이 검증은 Page 1 차트 결과를 받지 않고,
// selectedIngredients를 7개로 고정해서 매번 독립적으로 자체 조회한다.
export type MatrixReviewValidationItem = {
  ingredient: string;
  status: DemandSupplyItem["status"];
  demandScore: number;
  supplyScore: number;
  gap: number;
  totalReviews: number;
  avgRating: number;
  positiveRatio: number;
  negativeRatio: number;
  negativeCount: number;
};

// 레티놀의 부정 리뷰 비율이 나머지 성분 전체보다 통계적으로 유의하게 높은지
// 2-proportion z-test로 검증한다. 레티놀을 검정 대상으로 고른 이유는 두 가지다:
// (1) main-ingredients.ts에 애초에 "자극·건조 부정 리뷰 뚜렷"이라는 이유로
// 선정되어 있었고, (2) 실제로 7개 성분 리뷰 데이터를 보니 레티놀이 가장 튀었다.
// (2)는 같은 데이터를 보고 나서 검정 대상을 정한 것이라, 순수한 사전 가설 검정
// 보다는 느슨하다 -- 참고용 유의성 검정으로 해석하는 것이 안전하다.
export type ProportionSignificanceTest = {
  targetIngredient: string;
  targetNegativeCount: number;
  targetTotal: number;
  targetRatio: number;
  restNegativeCount: number;
  restTotal: number;
  restRatio: number;
  zScore: number;
  pValue: number;
  alpha: number;
  isSignificant: boolean;
};

export type MatrixReviewValidationResult = {
  items: MatrixReviewValidationItem[];
  missingIngredients: string[];
  retinolSignificanceTest: ProportionSignificanceTest | null;
};

type ReviewStat = {
  totalReviews: number;
  avgRating: number;
  positiveRatio: number;
  negativeRatio: number;
  negativeCount: number;
};

const SIGNIFICANCE_TEST_TARGET = "레티놀";
const ALPHA = 0.05;

export async function computeMatrixReviewValidation(): Promise<MatrixReviewValidationResult> {
  const [matrixResult, reviewStats] = await Promise.all([
    fetchDemandSupplyMatrixFromSupabase({
      ...DEFAULT_DEMAND_SUPPLY_MATRIX_CONFIG,
      selectedIngredients: MATRIX_INGREDIENT_TARGETS.map((target) => target.label),
    }),
    fetchIngredientReviewStats(),
  ]);

  if (matrixResult.isUnavailable) {
    return {
      items: [],
      missingIngredients: MATRIX_INGREDIENT_TARGETS.map((target) => target.label),
      retinolSignificanceTest: null,
    };
  }

  const matrixByIngredient = new Map(matrixResult.items.map((item: DemandSupplyItem) => [item.ingredient, item]));
  const missingIngredients: string[] = [];

  const items: MatrixReviewValidationItem[] = MATRIX_INGREDIENT_TARGETS.flatMap((target) => {
    const matrixItem = matrixByIngredient.get(target.label);
    const stats = reviewStats.get(target.label);

    if (!matrixItem || !stats || stats.totalReviews === 0) {
      missingIngredients.push(target.label);
      return [];
    }

    return [{
      ingredient: target.label,
      status: matrixItem.status,
      demandScore: matrixItem.demand,
      supplyScore: matrixItem.supply,
      gap: matrixItem.gap ?? round(matrixItem.demand - matrixItem.supply, 1),
      totalReviews: stats.totalReviews,
      avgRating: stats.avgRating,
      positiveRatio: stats.positiveRatio,
      negativeRatio: stats.negativeRatio,
      negativeCount: stats.negativeCount,
    }];
  });

  items.sort((a, b) => b.gap - a.gap);

  return { items, missingIngredients, retinolSignificanceTest: computeRetinolSignificanceTest(items) };
}

function computeRetinolSignificanceTest(items: MatrixReviewValidationItem[]): ProportionSignificanceTest | null {
  const target = items.find((item) => item.ingredient === SIGNIFICANCE_TEST_TARGET);
  const rest = items.filter((item) => item.ingredient !== SIGNIFICANCE_TEST_TARGET);
  if (!target || !rest.length) return null;

  const restNegativeCount = rest.reduce((sum, item) => sum + item.negativeCount, 0);
  const restTotal = rest.reduce((sum, item) => sum + item.totalReviews, 0);
  if (!restTotal || !target.totalReviews) return null;

  const { z, p } = twoProportionZTest(target.negativeCount, target.totalReviews, restNegativeCount, restTotal);

  return {
    targetIngredient: target.ingredient,
    targetNegativeCount: target.negativeCount,
    targetTotal: target.totalReviews,
    targetRatio: target.negativeRatio,
    restNegativeCount,
    restTotal,
    restRatio: round((restNegativeCount / restTotal) * 100, 1),
    zScore: round(z, 2),
    pValue: round(p, 4),
    alpha: ALPHA,
    isSignificant: p < ALPHA,
  };
}

function twoProportionZTest(x1: number, n1: number, x2: number, n2: number) {
  const p1 = x1 / n1;
  const p2 = x2 / n2;
  const pooled = (x1 + x2) / (n1 + n2);
  const se = Math.sqrt(pooled * (1 - pooled) * (1 / n1 + 1 / n2));
  if (se === 0) return { z: 0, p: 1 };

  const z = (p1 - p2) / se;
  const p = 2 * (1 - normalCdf(Math.abs(z)));
  return { z, p };
}

function normalCdf(x: number) {
  return 0.5 * (1 + erf(x / Math.SQRT2));
}

// Abramowitz-Stegun 근사식 (오차 1.5e-7 이내) -- 표준정규분포 CDF 계산용.
function erf(x: number) {
  const sign = x < 0 ? -1 : 1;
  const absX = Math.abs(x);
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;
  const t = 1 / (1 + p * absX);
  const y = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-absX * absX);
  return sign * y;
}

async function fetchIngredientReviewStats(): Promise<Map<string, ReviewStat>> {
  const supabase = createClient();
  const result = new Map<string, ReviewStat>();

  for (const target of MATRIX_INGREDIENT_TARGETS) {
    const ingredientFilter = target.aliases
      .map((alias) => `main_ingredients.ilike.%${escapeOrValue(alias)}%`)
      .join(",");

    const { data, error } = await supabase
      .from("product_reviews")
      .select("review_rating, sentiment")
      .or(ingredientFilter)
      .not("sentiment", "is", null)
      .limit(2000);

    if (error) {
      console.error(`매트릭스 리뷰 검증용 통계 조회 실패 (${target.label})`, error.message);
      continue;
    }

    const rows = (data || []) as { review_rating: number | string | null; sentiment: string | null }[];
    if (!rows.length) continue;

    const ratings = rows
      .map((row) => Number(row.review_rating))
      .filter((value) => Number.isFinite(value) && value > 0);
    const positiveCount = rows.filter((row) => row.sentiment === "positive").length;
    const negativeCount = rows.filter((row) => row.sentiment === "negative").length;

    result.set(target.label, {
      totalReviews: rows.length,
      avgRating: ratings.length ? round(ratings.reduce((sum, value) => sum + value, 0) / ratings.length, 2) : 0,
      positiveRatio: round((positiveCount / rows.length) * 100, 1),
      negativeRatio: round((negativeCount / rows.length) * 100, 1),
      negativeCount,
    });
  }

  return result;
}

function escapeOrValue(value: string) {
  return value.replace(/[,%]/g, "");
}

function round(value: number, digits = 0) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}
