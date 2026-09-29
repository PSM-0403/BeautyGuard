import { createServerSupabaseClient } from "@/lib/alert-repository";

// review_rating(별점)을 근사 정답(proxy label)으로 삼아 KoELECTRA 감성분석 결과를
// 검증한다. 별점 자체가 완벽한 정답은 아니지만(3점인데 글은 긍정적인 경우 등),
// 리뷰마다 이미 갖고 있는 값이라 모델 신뢰도를 가늠할 수 있는 근거로 쓸 수 있다.
// 매핑 기준은 원래 nlptown 모델을 쓸 때부터 써온 것과 동일하다: 1~2점 negative,
// 3점 neutral, 4~5점 positive.
export type SentimentLabel = "positive" | "neutral" | "negative";

export type SentimentValidationGroup = {
  expected: SentimentLabel;
  ratingRangeLabel: string;
  sampleSize: number;
  matchCount: number;
  matchRate: number;
  predictedBreakdown: Record<SentimentLabel, number>;
};

export type SentimentValidationResult = {
  totalReviews: number;
  overallAccuracy: number;
  groups: SentimentValidationGroup[];
};

function ratingToExpectedLabel(rating: number): SentimentLabel {
  if (rating >= 4) return "positive";
  if (rating <= 2) return "negative";
  return "neutral";
}

const GROUP_ORDER: { expected: SentimentLabel; ratingRangeLabel: string }[] = [
  { expected: "positive", ratingRangeLabel: "4~5점" },
  { expected: "neutral", ratingRangeLabel: "3점" },
  { expected: "negative", ratingRangeLabel: "1~2점" },
];

export async function computeSentimentValidation(): Promise<SentimentValidationResult> {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("product_reviews")
    .select("review_rating, sentiment")
    .not("review_rating", "is", null)
    .not("sentiment", "is", null)
    .limit(2000);

  if (error) throw new Error(`product_reviews 조회 실패: ${error.message}`);

  const rows = (data || []) as { review_rating: number; sentiment: string }[];

  const groups = GROUP_ORDER.map(({ expected, ratingRangeLabel }) => {
    const groupRows = rows.filter((row) => ratingToExpectedLabel(Number(row.review_rating)) === expected);
    const predictedBreakdown: Record<SentimentLabel, number> = { positive: 0, neutral: 0, negative: 0 };
    let matchCount = 0;

    for (const row of groupRows) {
      const predicted = row.sentiment as SentimentLabel;
      if (predicted in predictedBreakdown) {
        predictedBreakdown[predicted] += 1;
      }
      if (predicted === expected) matchCount += 1;
    }

    return {
      expected,
      ratingRangeLabel,
      sampleSize: groupRows.length,
      matchCount,
      matchRate: groupRows.length ? Math.round((matchCount / groupRows.length) * 1000) / 10 : 0,
      predictedBreakdown,
    };
  });

  const totalMatch = groups.reduce((sum, group) => sum + group.matchCount, 0);
  const totalReviews = rows.length;

  return {
    totalReviews,
    overallAccuracy: totalReviews ? Math.round((totalMatch / totalReviews) * 1000) / 10 : 0,
    groups,
  };
}
