import { createClient } from "@/utils/supabase/client";
import { MAIN_INGREDIENT_LIST } from "@/lib/main-ingredients";
import type { DemandSupplyItem } from "@/lib/types";

// 수요-공급 매트릭스는 "검색 관심도(수요)"와 "제품 수(공급)"만으로 성분을 4분면에
// 배치한다. 이 분류가 실제 소비자 반응과도 맞는지 -- 즉 "기회" 성분이 정말 반응이
// 좋아서 기회인지, 아니면 단순히 공급이 적을 뿐인지 -- 별도로 수집된 리뷰 감성/평점
// 데이터로 교차검증한다. 두 신호(수요-공급 매트릭스, 리뷰 반응)는 서로 다른
// 데이터 소스(네이버 데이터랩 검색량 vs 올리브영 리뷰)에서 독립적으로 계산되므로,
// 둘이 일치하면 분류의 신뢰도를 보강하는 근거가 된다.
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

export async function computeMatrixReviewValidation(
  matrixItems: DemandSupplyItem[],
): Promise<MatrixReviewValidationResult> {
  const reviewStats = await fetchIngredientReviewStats();
  const matrixByIngredient = new Map(matrixItems.map((item) => [item.ingredient, item]));
  const missingIngredients: string[] = [];

  const items: MatrixReviewValidationItem[] = MAIN_INGREDIENT_LIST.flatMap((main) => {
    const matrixItem = matrixByIngredient.get(main.label);
    const stats = reviewStats.get(main.label);

    if (!matrixItem || !stats || stats.totalReviews === 0) {
      missingIngredients.push(main.label);
      return [];
    }

    return [{
      ingredient: main.label,
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

  for (const main of MAIN_INGREDIENT_LIST) {
    const ingredientFilter = main.aliases
      .map((alias) => `main_ingredients.ilike.%${escapeOrValue(alias)}%`)
      .join(",");

    const { data, error } = await supabase
      .from("product_reviews")
      .select("review_rating, sentiment")
      .or(ingredientFilter)
      .not("sentiment", "is", null)
      .limit(2000);

    if (error) {
      console.error(`매트릭스 리뷰 검증용 통계 조회 실패 (${main.label})`, error.message);
      continue;
    }

    const rows = (data || []) as { review_rating: number | string | null; sentiment: string | null }[];
    if (!rows.length) continue;

    const ratings = rows
      .map((row) => Number(row.review_rating))
      .filter((value) => Number.isFinite(value) && value > 0);
    const positiveCount = rows.filter((row) => row.sentiment === "positive").length;
    const negativeCount = rows.filter((row) => row.sentiment === "negative").length;

    result.set(main.label, {
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
