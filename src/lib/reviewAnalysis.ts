import { createClient } from "@supabase/supabase-js";
import { NEGATIVE_REVIEW_KEYWORDS, POSITIVE_REVIEW_KEYWORDS } from "@/lib/reviewConstants";
import { analyzeSentiments, type SentimentLabel } from "@/lib/sentiment";

export const MAX_ANALYSIS_REVIEWS = 300;

type ProductReviewRow = {
  id: number;
  goods_no: string | null;
  collected_date: string | null;
  platform: string | null;
  sort_type: string | null;
  rank: number | null;
  main_ingredients: string | null;
  review_rating: number | string | null;
  skin_type: string | null;
  review_text: string | null;
  created_at: string | null;
};

type ProductSnapshotRow = Record<string, unknown> & {
  goods_no?: string | number | null;
  review_count?: string | number | null;
  collected_date?: string | null;
  snapshot_date?: string | null;
  created_at?: string | null;
};

type ProductInfoRow = Record<string, unknown> & {
  goods_no?: string | number | null;
  brand?: string | null;
  product_name?: string | null;
  product_name_clean?: string | null;
  product_name_raw?: string | null;
};

type ProductSummary = {
  productName: string;
  reviewCount: number;
};

type AnalyzedReview = ProductReviewRow & {
  goods_no: string;
  review_text: string;
  sentiment: SentimentLabel;
};

export type ReviewKeyword = {
  keyword: string;
  count: number;
  percentage: number;
};

export type ReviewTopProduct = {
  goodsNo: string;
  productName: string;
  platform: string;
  rank: number;
  reviewCount: number;
  reviewRating: number;
  positiveRatio: number;
  score: number;
  reason: string;
};

export type SkinTypeAnalysis = {
  skinType: string;
  positive: number;
  neutral: number;
  negative: number;
  issue: string;
};

export type ReviewAnalysisResult = {
  ingredient: string;
  totalReviews: number;
  sentiment: {
    positive: number;
    neutral: number;
    negative: number;
    positiveRatio: number;
    neutralRatio: number;
    negativeRatio: number;
  };
  keywords: {
    positive: ReviewKeyword[];
    negative: ReviewKeyword[];
  };
  topProducts: ReviewTopProduct[];
  skinTypeAnalysis: SkinTypeAnalysis[];
  insights: string[];
};

const INGREDIENT_ALIASES: Record<string, string[]> = {
  "나이아신아마이드": ["나이아신아마이드", "니아신아마이드", "나이아신"],
  "히알루론산": ["히알루론산", "히알루로닉", "히알루론", "하이알루론산", "하이알루로닉"],
  "병풀/시카": ["병풀", "시카", "센텔라", "cica", "centella"],
  PDRN: ["PDRN", "pdrn", "피디알엔", "피디알앤"],
  "레티놀": ["레티놀", "레티날", "레틴알", "retinol", "retinal"],
};

const SKIN_TYPES = [
  { label: "건성", patterns: ["건성", "약건성"] },
  { label: "복합성", patterns: ["복합성"] },
  { label: "지성", patterns: ["지성"] },
  { label: "민감성", patterns: ["민감성"] },
  { label: "트러블성", patterns: ["트러블", "여드름"] },
];

const PRODUCT_SNAPSHOT_SELECT_CANDIDATES = [
  "goods_no, review_count, collected_date",
  "goods_no, review_count, snapshot_date",
  "goods_no, review_count, created_at",
  "goods_no, review_count",
] as const;

const PRODUCT_INFO_SELECT_CANDIDATES = [
  "goods_no, brand, product_name, product_name_clean, product_name_raw",
  "goods_no, product_name, product_name_clean, product_name_raw",
  "goods_no, product_name, product_name_clean",
  "goods_no, product_name",
] as const;

const SUPABASE_CHUNK_SIZE = 180;

export async function analyzeIngredientReviews(ingredient: string, maxReviews = MAX_ANALYSIS_REVIEWS): Promise<ReviewAnalysisResult> {
  const rows = await fetchReviewRows(ingredient);
  const analysisRows = rows
    .filter((row): row is ProductReviewRow & { goods_no: string; review_text: string } =>
      Boolean(row.goods_no && row.review_text?.trim()),
    )
    .sort((a, b) => getReviewDate(b).localeCompare(getReviewDate(a)))
    .slice(0, maxReviews);
  const goodsNos = Array.from(new Set(analysisRows.map((row) => row.goods_no).filter(Boolean)));
  const [labels, productSummaries] = await Promise.all([
    analyzeSentiments(analysisRows.map((row) => row.review_text)),
    fetchProductSummaries(goodsNos),
  ]);
  const analyzedRows = analysisRows.map((row, index) => ({
    ...row,
    review_text: row.review_text.trim(),
    sentiment: labels[index] || "neutral",
  }));

  return buildReviewAnalysis(ingredient, analyzedRows, productSummaries);
}

async function fetchReviewRows(ingredient: string) {
  const supabase = createSupabaseClient();
  const aliases = INGREDIENT_ALIASES[ingredient] || [ingredient];
  const ingredientFilter = aliases
    .map((alias) => `main_ingredients.ilike.%${escapeSupabaseOrValue(alias)}%`)
    .join(",");
  const { data, error } = await supabase
    .from("product_reviews")
    .select("*")
    .or(ingredientFilter)
    .not("review_text", "is", null)
    .order("collected_date", { ascending: false })
    .limit(1000);

  if (error) throw new Error(`product_reviews 조회 실패: ${error.message}: filter=${ingredientFilter}`);
  return (data || []) as ProductReviewRow[];
}

export async function debugFetchReviewRows(ingredient: string) {
  const supabase = createSupabaseClient();
  const aliases = INGREDIENT_ALIASES[ingredient] || [ingredient];
  const ingredientFilter = aliases
    .map((alias) => `main_ingredients.ilike.%${escapeSupabaseOrValue(alias)}%`)
    .join(",");
  const { data, error } = await supabase
    .from("product_reviews")
    .select("id, goods_no, main_ingredients")
    .or(ingredientFilter)
    .not("review_text", "is", null)
    .limit(5);
  return { ingredient, aliases, ingredientFilter, error, sample: data };
}

async function fetchProductSummaries(goodsNos: string[]) {
  const summaries = new Map<string, ProductSummary>();
  if (!goodsNos.length) return summaries;

  const [snapshotRows, productRows] = await Promise.all([
    fetchRowsForGoodsNos<ProductSnapshotRow>("product_snapshots", PRODUCT_SNAPSHOT_SELECT_CANDIDATES, goodsNos),
    fetchRowsForGoodsNos<ProductInfoRow>("products", PRODUCT_INFO_SELECT_CANDIDATES, goodsNos).catch((error) => {
      console.error("products 상품명 조회 실패", error);
      return [] as ProductInfoRow[];
    }),
  ]);
  const productNames = new Map<string, string>();

  productRows.forEach((row) => {
    const goodsNo = normalizeGoodsNo(row.goods_no);
    if (!goodsNo) return;
    productNames.set(goodsNo, getProductName(row));
  });

  snapshotRows.forEach((row) => {
    const goodsNo = normalizeGoodsNo(row.goods_no);
    const reviewCount = toNumber(row.review_count);
    if (!goodsNo || reviewCount <= 0) return;

    const current = summaries.get(goodsNo);
    if (!current || isNewerSnapshot(row, current, snapshotRows)) {
      summaries.set(goodsNo, {
        productName: productNames.get(goodsNo) || "상품명 미확인",
        reviewCount,
      });
    }
  });

  productNames.forEach((productName, goodsNo) => {
    const current = summaries.get(goodsNo);
    if (current) {
      summaries.set(goodsNo, { ...current, productName });
    }
  });

  return summaries;
}

async function fetchRowsForGoodsNos<T extends Record<string, unknown>>(
  table: string,
  selectCandidates: readonly string[],
  goodsNos: string[],
) {
  const supabase = createSupabaseClient();
  let lastError = "";

  for (const selectQuery of selectCandidates) {
    const rows: T[] = [];
    let hasError = false;

    for (const goodsNoChunk of chunkArray(goodsNos, SUPABASE_CHUNK_SIZE)) {
      const { data, error } = await supabase
        .from(table)
        .select(selectQuery)
        .in("goods_no", goodsNoChunk)
        .limit(10000);

      if (error) {
        lastError = error.message;
        hasError = true;
        console.error(`Supabase ${table} 조회 실패`, { selectQuery, message: error.message });
        break;
      }

      rows.push(...((data || []) as unknown as T[]));
    }

    if (!hasError) return rows;
  }

  throw new Error(lastError || `${table}에서 필요한 컬럼을 찾지 못했습니다.`);
}

function buildReviewAnalysis(
  ingredient: string,
  rows: AnalyzedReview[],
  productSummaries: Map<string, ProductSummary>,
): ReviewAnalysisResult {
  const sentimentCounts = countSentiments(rows);
  const positiveRows = rows.filter((row) => row.sentiment === "positive");
  const negativeRows = rows.filter((row) => row.sentiment === "negative");
  const keywords = {
    positive: extractKeywords(positiveRows, POSITIVE_REVIEW_KEYWORDS),
    negative: extractKeywords(negativeRows, NEGATIVE_REVIEW_KEYWORDS),
  };
  const skinTypeAnalysis = buildSkinTypeAnalysis(rows);
  const topProducts = buildTopProducts(rows, productSummaries);

  return {
    ingredient,
    totalReviews: rows.length,
    sentiment: sentimentCounts,
    keywords,
    topProducts,
    skinTypeAnalysis,
    insights: buildInsights(ingredient, sentimentCounts, keywords, skinTypeAnalysis, topProducts),
  };
}

function countSentiments(rows: AnalyzedReview[]) {
  const positive = rows.filter((row) => row.sentiment === "positive").length;
  const neutral = rows.filter((row) => row.sentiment === "neutral").length;
  const negative = rows.filter((row) => row.sentiment === "negative").length;
  const total = Math.max(1, rows.length);

  return {
    positive,
    neutral,
    negative,
    positiveRatio: round((positive / total) * 100, 1),
    neutralRatio: round((neutral / total) * 100, 1),
    negativeRatio: round((negative / total) * 100, 1),
  };
}

function extractKeywords(rows: AnalyzedReview[], candidates: string[]): ReviewKeyword[] {
  const counts = new Map<string, number>();
  rows.forEach((row) => {
    const text = normalizeReviewText(row.review_text);
    candidates.forEach((keyword) => {
      if (text.includes(normalizeReviewText(keyword))) {
        counts.set(keyword, (counts.get(keyword) || 0) + 1);
      }
    });
  });
  const totalMatches = Math.max(1, Array.from(counts.values()).reduce((sum, count) => sum + count, 0));

  return Array.from(counts.entries())
    .map(([keyword, count]) => ({
      keyword,
      count,
      percentage: round((count / totalMatches) * 100, 1),
    }))
    .sort((a, b) => b.count - a.count || b.percentage - a.percentage)
    .slice(0, 5);
}

function buildTopProducts(
  rows: AnalyzedReview[],
  productSummaries: Map<string, ProductSummary>,
): ReviewTopProduct[] {
  const grouped = new Map<string, AnalyzedReview[]>();
  rows.forEach((row) => {
    const group = grouped.get(row.goods_no) || [];
    group.push(row);
    grouped.set(row.goods_no, group);
  });
  const products = Array.from(grouped.entries()).flatMap(([goodsNo, group]) => {
    if (!goodsNo || group.length === 0) return [];
    const summary = productSummaries.get(goodsNo);
    const reviewCount = summary?.reviewCount || 0;
    if (reviewCount <= 0) return [];
    const ranks = group.map((row) => toNumber(row.rank)).filter((value) => value > 0);
    const ratings = group.map((row) => toNumber(row.review_rating)).filter((value) => value > 0);
    const positiveCount = group.filter((row) => row.sentiment === "positive").length;
    const platform = mostCommon(group.map((row) => row.platform).filter(Boolean) as string[]) || "-";

    return [{
      goodsNo,
      productName: summary?.productName || "상품명 미확인",
      platform,
      rank: ranks.length ? round(Math.min(...ranks), 1) : 0,
      reviewCount,
      reviewRating: ratings.length ? round(average(ratings), 1) : 0,
      positiveRatio: round((positiveCount / Math.max(1, group.length)) * 100, 1),
      score: 0,
      reason: "",
    }];
  });
  const rankedProducts = products.filter((product) => product.rank > 0);
  const rankValues = rankedProducts.map((product) => product.rank);
  const minRank = rankValues.length ? Math.min(...rankValues) : 0;
  const maxRank = rankValues.length ? Math.max(...rankValues) : minRank;
  const reviewCounts = products.map((product) => product.reviewCount);
  const minReviewCount = reviewCounts.length ? Math.min(...reviewCounts) : 0;
  const maxReviewCount = reviewCounts.length ? Math.max(...reviewCounts) : minReviewCount;

  return products
    .map((product) => {
      const normalizedRank = product.rank <= 0 || maxRank === minRank
        ? 0
        : (product.rank - minRank) / (maxRank - minRank);
      const rankScore = product.rank > 0 ? 1 - normalizedRank : 0;
      const ratingScore = clamp01(product.reviewRating / 5);
      const positiveScore = clamp01(product.positiveRatio / 100);
      const reviewCountScore = maxReviewCount === minReviewCount
        ? 1
        : clamp01((product.reviewCount - minReviewCount) / (maxReviewCount - minReviewCount));
      const score = rankScore * 0.25 + ratingScore * 0.25 + positiveScore * 0.25 + reviewCountScore * 0.25;
      return {
        ...product,
        score: round(score, 3),
        reason: getTopProductReason(rankScore, ratingScore, positiveScore, reviewCountScore),
      };
    })
    .sort((a, b) => b.score - a.score || b.reviewCount - a.reviewCount)
    .slice(0, 3);
}

function buildSkinTypeAnalysis(rows: AnalyzedReview[]): SkinTypeAnalysis[] {
  return SKIN_TYPES.map((skinType) => {
    const group = rows.filter((row) => skinType.patterns.some((pattern) => String(row.skin_type || "").includes(pattern)));
    const counts = countSentiments(group);
    const negativeKeywords = extractKeywords(
      group.filter((row) => row.sentiment === "negative"),
      NEGATIVE_REVIEW_KEYWORDS,
    );

    return {
      skinType: skinType.label,
      positive: counts.positiveRatio,
      neutral: counts.neutralRatio,
      negative: counts.negativeRatio,
      issue: buildSkinIssue(negativeKeywords),
    };
  });
}

function buildInsights(
  ingredient: string,
  sentiment: ReviewAnalysisResult["sentiment"],
  keywords: ReviewAnalysisResult["keywords"],
  skinTypes: SkinTypeAnalysis[],
  topProducts: ReviewTopProduct[],
) {
  const positiveSet = new Set(keywords.positive.map((item) => item.keyword));
  const negativeSet = new Set(keywords.negative.map((item) => item.keyword));
  const insights: string[] = [];
  const topPositiveKeyword = keywords.positive[0]?.keyword;
  const topNegativeKeyword = keywords.negative[0]?.keyword;
  const strongestProduct = topProducts[0];
  const mostPositiveSkinType = skinTypes.slice().sort((a, b) => b.positive - a.positive)[0];
  const mostNegativeSkinType = skinTypes.slice().sort((a, b) => b.negative - a.negative)[0];

  insights.push(`${ingredient} 리뷰는 긍정 ${sentiment.positiveRatio.toFixed(1)}%, 부정 ${sentiment.negativeRatio.toFixed(1)}%입니다. MD 기획에서는 긍정 키워드는 상세페이지 상단에, 부정 키워드는 사용 가이드와 주의 문구로 보완하세요.`);

  if (strongestProduct) {
    insights.push(`${shortenText(strongestProduct.productName, 32)}는 리뷰 ${strongestProduct.reviewCount.toLocaleString("ko-KR")}개와 긍정 ${strongestProduct.positiveRatio.toFixed(1)}%를 함께 확보한 벤치마크 상품입니다. 가격, 제형, 대표 효능 표현을 우선 비교해 보세요.`);
  }

  if (["톤이 맑아져요", "잡티", "미백", "광채"].some((keyword) => positiveSet.has(keyword))) {
    insights.push("브라이트닝 메시지는 데일리 톤 개선 중심으로 풀 때 반응이 안정적입니다.");
  }
  if (["피부결", "매끈", "흡수"].some((keyword) => positiveSet.has(keyword))) {
    insights.push("피부결과 흡수감 표현을 상세페이지 전면에 강화하는 구성이 유리합니다.");
  }
  if (["자극", "따가움", "붉어짐", "가려움"].some((keyword) => negativeSet.has(keyword))) {
    insights.push("민감성 타겟에는 고함량보다 저자극 누적 케어 메시지를 우선 배치하세요.");
  }
  if (["건조", "흡수 안됨", "무거움", "끈적임"].some((keyword) => negativeSet.has(keyword))) {
    insights.push("보습감은 유지하되 산뜻한 마무리 제형 메시지를 함께 제시하는 것이 좋습니다.");
  }
  if ((skinTypes.find((item) => item.skinType === "건성")?.negative || 0) >= 30) {
    insights.push("건성 타겟에는 단일 성분보다 보습 성분과의 조합 메시지가 필요합니다.");
  }
  if (["지성", "복합성"].some((label) => (skinTypes.find((item) => item.skinType === label)?.positive || 0) >= 60)) {
    insights.push("지성/복합성 타겟에는 피지, 피부결, 산뜻함 근거를 함께 제시하세요.");
  }
  if (topProducts.some((product) => product.reviewRating >= 4.2 && product.positiveRatio >= 60)) {
    insights.push("상위 반응 제품은 리뷰 신뢰도가 높으므로 실제 사용감 표현을 강화하는 것이 좋습니다.");
  }
  if (topPositiveKeyword) {
    insights.push(`${topPositiveKeyword} 언급이 긍정 리뷰에서 가장 두드러집니다. 광고 소재와 상품명 보조 문구에 같은 사용감 언어를 반복 노출하는 편이 좋습니다.`);
  }
  if (topNegativeKeyword) {
    insights.push(`${topNegativeKeyword} 관련 불만은 구매 전 이탈 요인이 될 수 있습니다. 상세페이지에 피부 타입별 사용 순서와 병용 주의 문구를 보강하세요.`);
  }
  if (mostPositiveSkinType?.positive >= 60) {
    insights.push(`${mostPositiveSkinType.skinType} 리뷰 반응이 가장 우호적입니다. 초기 타깃과 체험단 구성은 이 피부 타입 중심으로 설계하는 것이 효율적입니다.`);
  }
  if (mostNegativeSkinType?.negative >= 25) {
    insights.push(`${mostNegativeSkinType.skinType}의 부정 비율이 상대적으로 높습니다. 해당 피부 타입에는 저자극, 보습 보완, 패치 테스트 메시지를 분리해 제시하세요.`);
  }

  const fallback = [
    `${ingredient} 성분은 리뷰 모수와 감정 반응을 함께 보며 주력 효능, 제형, 타깃 피부 타입을 동시에 좁히는 방식이 적합합니다.`,
    "상위 제품의 리뷰 수와 긍정률을 기준으로 벤치마크를 잡고, 부정 키워드는 상세페이지 FAQ와 사용 가이드에 먼저 반영하세요.",
  ];

  return ensureInsightRange(insights, fallback, 2, 5);
}

function buildSkinIssue(keywords: ReviewKeyword[]) {
  const top = keywords.slice(0, 2).map((item) => item.keyword);
  if (!top.length) return "특정 부정 이슈가 두드러지지 않음";
  if (top.some((keyword) => ["자극", "따가움", "붉어짐", "가려움", "트러블"].includes(keyword))) {
    return `${top.join("과 ")} 반응 우려`;
  }
  if (top.some((keyword) => ["건조", "흡수 안됨", "끈적임", "무거움"].includes(keyword))) {
    return `${top.join("과 ")} 관련 사용감 불만`;
  }
  return `${top.join("과 ")} 언급이 많음`;
}

function getTopProductReason(rankScore: number, ratingScore: number, positiveScore: number, reviewCountScore: number) {
  if (reviewCountScore >= 0.8 && positiveScore >= 0.6) return "리뷰 모수와 긍정 반응이 모두 높음";
  if (rankScore >= 0.7 && positiveScore >= 0.6) return "판매 순위와 긍정 리뷰 비율이 모두 높음";
  if (ratingScore >= 0.8 && positiveScore >= 0.55) return "평점과 리뷰 반응이 안정적으로 높음";
  return "";
}

function getReviewDate(row: ProductReviewRow) {
  return String(row.collected_date || row.created_at || "");
}

function normalizeReviewText(value: string) {
  return value.toLocaleLowerCase("ko-KR").replace(/\s+/g, "");
}

function mostCommon(values: string[]) {
  const counts = new Map<string, number>();
  values.forEach((value) => counts.set(value, (counts.get(value) || 0) + 1));
  return Array.from(counts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] || "";
}

function getProductName(row: ProductInfoRow) {
  const productName = String(row.product_name || row.product_name_clean || row.product_name_raw || "").trim();
  return productName || "상품명 미확인";
}

function normalizeGoodsNo(value: unknown) {
  return String(value ?? "").trim();
}

function getProductSnapshotDate(row: ProductSnapshotRow) {
  return String(row.collected_date || row.snapshot_date || row.created_at || "").slice(0, 10);
}

function isNewerSnapshot(row: ProductSnapshotRow, current: ProductSummary, allRows: ProductSnapshotRow[]) {
  const goodsNo = normalizeGoodsNo(row.goods_no);
  const rowDate = getProductSnapshotDate(row);
  const currentDate = allRows
    .filter((item) => normalizeGoodsNo(item.goods_no) === goodsNo && toNumber(item.review_count) === current.reviewCount)
    .map(getProductSnapshotDate)
    .filter(Boolean)
    .sort()
    .at(-1) || "";

  if (rowDate || currentDate) return rowDate >= currentDate;
  return toNumber(row.review_count) >= current.reviewCount;
}

function chunkArray<T>(items: T[], size: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function createSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("Supabase 환경변수가 필요합니다.");

  return createClient(url, key);
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

function shortenText(value: string, maxLength: number) {
  return value.length > maxLength ? `${value.slice(0, maxLength - 1)}…` : value;
}

function average(values: number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function toNumber(value: unknown) {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : 0;
}

function round(value: number, digits = 0) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function clamp01(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function escapeSupabaseOrValue(value: string) {
  return value.replace(/[,%]/g, "");
}
