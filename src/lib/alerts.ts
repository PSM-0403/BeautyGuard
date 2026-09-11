import type { AlertItem, AlertSeverity, AlertType, DemandSupplyItem } from "@/lib/types";
import type { ReviewAnalysisResult, ReviewKeyword } from "@/lib/reviewAnalysis";

export type AlertSummary = {
  opportunityCount: number;
  inventoryRiskCount: number;
  reviewIssueCount: number;
};

export type ReviewIssueSummaryItem = {
  ingredientName: string;
  keyword: string;
  negativeKeywordCount: number;
  negativeReviewCount: number;
  negativeReviewRatio: number;
  totalReviews: number;
  productName?: string | null;
  lowKeywords: ReviewKeyword[];
};

export type DailyMetricSnapshot = {
  snapshotDate: string;
  ingredientMatrix: DemandSupplyItem[];
  reviewIssueSummary: ReviewIssueSummaryItem[];
  createdAt: string;
};

export type DailyAlertsPayload = {
  alertDate: string;
  summary: AlertSummary;
  alerts: AlertItem[];
  notificationTargets: AlertItem[];
};

const ALERT_TYPE_ORDER: Record<AlertType, number> = {
  opportunity: 0,
  inventory_risk: 1,
  review_issue: 2,
};

const ALERT_SEVERITY_ORDER: Record<AlertSeverity, number> = {
  high: 0,
  medium: 1,
  low: 2,
};

export const ALERT_TYPE_LABELS: Record<AlertType, string> = {
  opportunity: "신제품 기획 후보",
  inventory_risk: "재고 리스크 성분",
  review_issue: "부정 리뷰 이슈",
};

export const ALERT_SEVERITY_LABELS: Record<AlertSeverity, string> = {
  high: "High",
  medium: "Medium",
  low: "Low",
};

export const ALERT_ACTION_ITEMS: Record<AlertType, string[]> = {
  opportunity: [
    "신규 SKU 기획 검토",
    "경쟁 제품 가격대 확인",
    "상세페이지 효능 카피 테스트",
  ],
  inventory_risk: [
    "재고 회전율 확인",
    "가격/프로모션 검토",
    "상세페이지 전환율 점검",
  ],
  review_issue: [
    "사용법/주의사항 문구 보강",
    "민감성 피부 대상 카피 조정",
    "FAQ/상세페이지 문구 개선",
  ],
};

export function buildDailyAlerts(snapshot: DailyMetricSnapshot): AlertItem[] {
  const alerts = [
    ...buildIngredientMatrixAlerts(snapshot.ingredientMatrix, snapshot.snapshotDate, snapshot.createdAt),
    ...buildReviewIssueAlerts(snapshot.reviewIssueSummary, snapshot.snapshotDate, snapshot.createdAt),
  ];

  return sortAlerts(alerts);
}

export function buildAlertSummary(alerts: AlertItem[]): AlertSummary {
  return {
    opportunityCount: alerts.filter((alert) => alert.alert_type === "opportunity").length,
    inventoryRiskCount: alerts.filter((alert) => alert.alert_type === "inventory_risk").length,
    reviewIssueCount: alerts.filter((alert) => alert.alert_type === "review_issue").length,
  };
}

export function buildDailyAlertsPayload(alertDate: string, alerts: AlertItem[]): DailyAlertsPayload {
  const sortedAlerts = sortAlerts(alerts);

  return {
    alertDate,
    summary: buildAlertSummary(sortedAlerts),
    alerts: sortedAlerts,
    notificationTargets: getHighSeverityNotificationTargets(sortedAlerts),
  };
}

export function getHighSeverityNotificationTargets(alerts: AlertItem[]) {
  return alerts.filter((alert) => alert.severity === "high" && !alert.is_sent);
}

const MIN_REVIEWS_FOR_ALERT = 30;
const MAX_KEYWORDS_PER_INGREDIENT = 3;

export function buildReviewIssueSummary(results: ReviewAnalysisResult[]): ReviewIssueSummaryItem[] {
  return results.flatMap((result) => {
    if (result.totalReviews < MIN_REVIEWS_FOR_ALERT) return [];

    const lowKeywords = result.keywords.negative.filter((keyword) => keyword.count >= 1 && keyword.count <= 2);
    const directCandidates = result.keywords.negative
      .filter((keyword) => keyword.count >= 3)
      .slice(0, MAX_KEYWORDS_PER_INGREDIENT);
    const ratioCandidate = !directCandidates.length && (result.sentiment.negative >= 5 || result.sentiment.negativeRatio >= 20)
      ? result.keywords.negative.slice(0, 1)
      : [];
    const candidates = [...directCandidates, ...ratioCandidate].filter((keyword, index, rows) =>
      rows.findIndex((row) => row.keyword === keyword.keyword) === index,
    );

    return candidates.map((keyword) => ({
      ingredientName: result.ingredient,
      keyword: keyword.keyword,
      negativeKeywordCount: keyword.count,
      negativeReviewCount: result.sentiment.negative,
      negativeReviewRatio: result.sentiment.negativeRatio,
      totalReviews: result.totalReviews,
      productName: result.topProducts[0]?.productName || null,
      lowKeywords,
    }));
  });
}

export function sortAlerts(alerts: AlertItem[]) {
  return alerts.slice().sort((a, b) =>
    ALERT_SEVERITY_ORDER[a.severity] - ALERT_SEVERITY_ORDER[b.severity] ||
    ALERT_TYPE_ORDER[a.alert_type] - ALERT_TYPE_ORDER[b.alert_type] ||
    String(a.ingredient_name).localeCompare(String(b.ingredient_name), "ko-KR") ||
    String(a.title).localeCompare(String(b.title), "ko-KR"),
  );
}

function buildIngredientMatrixAlerts(items: DemandSupplyItem[], alertDate: string, createdAt: string): AlertItem[] {
  const alerts: AlertItem[] = [];

  items.forEach((item) => {
    const demandScore = Number(item.demand || 0);
    const supplyScore = Number(item.supply || 0);
    const gap = round(demandScore - supplyScore, 1);
    const base = {
      alert_date: alertDate,
      ingredient_name: item.ingredient,
      product_name: null,
      is_sent: false,
      sent_channel: null,
      created_at: createdAt,
    };

    if (demandScore >= 60 && supplyScore <= 40) {
      const severity: AlertSeverity = demandScore >= 80 ? "high" : "medium";

      alerts.push({
        ...base,
        id: `${alertDate}-opportunity-${slugify(item.ingredient)}`,
        alert_type: "opportunity" as const,
        severity,
        title: `${item.ingredient} 신제품 기회 후보`,
        summary: `수요 점수 ${formatScore(demandScore)} 대비 공급 점수 ${formatScore(supplyScore)}로 기회 영역에 있습니다.`,
        detected_metric_name: "demand_supply_gap",
        detected_metric_value: gap,
        baseline_metric_value: typeof item.previousGap === "number" ? item.previousGap : null,
        reason_json: {
          reasons: [
            `수요 점수가 ${formatScore(demandScore)}로 60 이상입니다.`,
            `공급 점수가 ${formatScore(supplyScore)}로 40 이하입니다.`,
            typeof item.demandWow === "number" ? `수요 전주 대비 변화율은 ${formatSignedPct(item.demandWow)}입니다.` : "",
          ].filter(Boolean),
          metrics: getMatrixMetrics(item),
          threshold: "Medium: demand_score >= 60 AND supply_score <= 40 / High: demand_score >= 80 AND supply_score <= 40",
          source: "ingredient_matrix",
          notificationEligible: severity === "high",
        },
        action_items_json: ALERT_ACTION_ITEMS.opportunity,
      });
      return;
    }

    if (supplyScore >= 60 && demandScore <= 40) {
      const severity: AlertSeverity = supplyScore >= 80 ? "high" : "medium";

      alerts.push({
        ...base,
        id: `${alertDate}-inventory-risk-${slugify(item.ingredient)}`,
        alert_type: "inventory_risk" as const,
        severity,
        title: `${item.ingredient} 재고 리스크 성분`,
        summary: `공급 점수 ${formatScore(supplyScore)} 대비 수요 점수 ${formatScore(demandScore)}로 공급 과잉 영역에 있습니다.`,
        detected_metric_name: "supply_demand_gap",
        detected_metric_value: round(supplyScore - demandScore, 1),
        baseline_metric_value: typeof item.previousGap === "number" ? round(-item.previousGap, 1) : null,
        reason_json: {
          reasons: [
            `공급 점수가 ${formatScore(supplyScore)}로 60 이상입니다.`,
            `수요 점수가 ${formatScore(demandScore)}로 40 이하입니다.`,
            typeof item.supplyWow === "number" ? `공급 전주 대비 변화율은 ${formatSignedPct(item.supplyWow)}입니다.` : "",
          ].filter(Boolean),
          metrics: getMatrixMetrics(item),
          threshold: "Medium: supply_score >= 60 AND demand_score <= 40 / High: supply_score >= 80 AND demand_score <= 40",
          source: "ingredient_matrix",
          notificationEligible: severity === "high",
        },
        action_items_json: ALERT_ACTION_ITEMS.inventory_risk,
      });
    }
  });

  return alerts;
}

function buildReviewIssueAlerts(items: ReviewIssueSummaryItem[], alertDate: string, createdAt: string): AlertItem[] {
  return items.flatMap((item) => {
    const severity = getReviewIssueSeverity(item);
    if (severity === "low") return [];

    return [{
      id: `${alertDate}-review-issue-${slugify(item.ingredientName)}-${slugify(item.keyword)}`,
      alert_date: alertDate,
      alert_type: "review_issue" as const,
      severity,
      title: `${item.ingredientName} ${item.keyword} 부정 리뷰 이슈`,
      summary: `${item.keyword} 키워드가 부정 리뷰에서 ${item.negativeKeywordCount}건 감지되었습니다.`,
      ingredient_name: item.ingredientName,
      product_name: item.productName || null,
      detected_metric_name: "negative_keyword_count",
      detected_metric_value: item.negativeKeywordCount,
      baseline_metric_value: item.negativeReviewRatio,
      reason_json: {
        reasons: [
          `${item.keyword} 키워드가 ${item.negativeKeywordCount}건으로 감지 기준에 도달했습니다.`,
          `분석기간 부정 리뷰 비율은 ${item.negativeReviewRatio.toFixed(1)}%입니다.`,
          `분석기간 부정 리뷰 수는 ${item.negativeReviewCount}건입니다.`,
        ],
        metrics: {
          "부정 키워드": item.keyword,
          "키워드 감지 건수": `${item.negativeKeywordCount}건`,
          "부정 리뷰 수": `${item.negativeReviewCount}건`,
          "부정 리뷰 비율": `${item.negativeReviewRatio.toFixed(1)}%`,
          "분석 리뷰 수": `${item.totalReviews}건`,
        },
        relatedLowKeywords: item.lowKeywords.map((keyword) => ({
          keyword: keyword.keyword,
          count: keyword.count,
        })),
        threshold: "High: negative_keyword_count >= 5 OR negative_review_ratio >= 30 / Medium: negative_keyword_count >= 3 OR negative_review_count >= 5 OR negative_review_ratio >= 20",
        source: "review_issue_summary",
        notificationEligible: severity === "high",
      },
      action_items_json: ALERT_ACTION_ITEMS.review_issue,
      is_sent: false,
      sent_channel: null,
      created_at: createdAt,
    }];
  });
}

function getReviewIssueSeverity(item: ReviewIssueSummaryItem): AlertSeverity {
  if (item.negativeKeywordCount >= 5 && item.negativeReviewRatio >= 30) return "high";
  if (item.negativeKeywordCount >= 3 || item.negativeReviewRatio >= 20) return "medium";
  return "low";
}

function getMatrixMetrics(item: DemandSupplyItem) {
  return {
    "수요 점수": formatScore(item.demand),
    "공급 점수": formatScore(item.supply),
    "수요-공급 격차": formatScore(item.gap ?? Number(item.demand || 0) - Number(item.supply || 0)),
    "수요 전주 대비": typeof item.demandWow === "number" ? formatSignedPct(item.demandWow) : "-",
    "공급 전주 대비": typeof item.supplyWow === "number" ? formatSignedPct(item.supplyWow) : "-",
    "공급 상품 수": typeof item.supplyCount === "number" ? `${item.supplyCount}개` : "-",
  };
}

function formatScore(value: unknown) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "-";
  return number.toFixed(1);
}

function formatSignedPct(value: number) {
  return `${value > 0 ? "+" : ""}${value.toFixed(1)}%`;
}

function slugify(value: string) {
  const normalized = value
    .toLocaleLowerCase("ko-KR")
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9가-힣_-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  return normalized || "unknown";
}

function round(value: number, digits = 0) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}
