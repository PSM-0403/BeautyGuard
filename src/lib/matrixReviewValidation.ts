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
};

export type MatrixReviewValidationResult = {
  items: MatrixReviewValidationItem[];
  missingIngredients: string[];
};

type ReviewStat = {
  totalReviews: number;
  avgRating: number;
  positiveRatio: number;
  negativeRatio: number;
};

export async function computeMatrixReviewValidation(): Promise<MatrixReviewValidationResult> {
  const [matrixResult, reviewStats] = await Promise.all([
    fetchDemandSupplyMatrixFromSupabase({
      ...DEFAULT_DEMAND_SUPPLY_MATRIX_CONFIG,
      selectedIngredients: MATRIX_INGREDIENT_TARGETS.map((target) => target.label),
    }),
    fetchIngredientReviewStats(),
  ]);

  if (matrixResult.isUnavailable) {
    return { items: [], missingIngredients: MATRIX_INGREDIENT_TARGETS.map((target) => target.label) };
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
    }];
  });

  items.sort((a, b) => b.gap - a.gap);

  return { items, missingIngredients };
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
