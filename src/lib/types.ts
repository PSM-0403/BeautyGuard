export type DashboardMeta = {
  dataRange: string;
  lastUpdated: string;
  comparisonLabel: string;
  apiSource?: string;
};

export type Page1Summary = {
  analyzedProducts: number;
  analyzedIngredients: number;
  totalSearchGrowthRate: number;
  risingIngredientCount: number;
  supplyShortageIngredientCount: number;
};

export type RankItem = {
  label: string;
  growth?: number;
  searchIndex?: number;
  currentWeekIndex?: number;
  previousWeekIndex?: number;
  averageRank?: number;
  bestRank?: number;
  productCount?: number;
  score?: number;
};

export type PriceDistributionPoint = {
  value: number;
  ingredient: string;
  productName: string;
  goodsNo?: string;
  basisPrice?: number | null;
  regularPrice?: number | null;
  salesPrice?: number | null;
  volumeMl?: number | null;
  priceType: "sale" | "list";
};

export type PriceDistributionItem = {
  ingredient: string;
  salePrices?: number[];
  listPrices?: number[];
  prices?: number[];
  salePricePoints?: PriceDistributionPoint[];
  listPricePoints?: PriceDistributionPoint[];
};

export type DemandSupplyItem = {
  ingredient: string;
  demand: number;
  supply: number;
  growth: number;
  size: number;
  status: "growth" | "shortage" | "opportunity" | "oversupply" | "stable";
  previousDemand?: number;
  previousSupply?: number;
  demandWow?: number;
  demandMom?: number;
  supplyWow?: number;
  supplyGrowthCount?: number;
  gap?: number;
  previousGap?: number;
  gapDelta?: number;
  opportunityScore?: number;
  oversupplyScore?: number;
  supplyCount?: number;
  previousSupplyCount?: number;
};

export type IngredientRawMetric = {
  ingredient_id: string;
  ingredient_name: string;
  search_index_recent: number;
  search_index_previous: number;
  demand_growth_rate: number;
  product_count: number;
  brand_count: number;
  new_product_growth_rate: number;
  category_count: number;
  measured_at?: string;
};

export type IngredientMetric = {
  ingredientId: string;
  ingredientName: string;
  demandScore: number;
  supplyScore: number;
  demandGrowthRate: number;
  demandMonthOverMonthRate?: number;
  supplyGrowthRate: number;
  supplyGrowthCount?: number;
  gap?: number;
  previousGap?: number;
  gapDelta?: number;
  productCount?: number;
  previousProductCount?: number;
  opportunityScore: number;
  oversupplyScore: number;
  quadrant: "growth" | "opportunity" | "oversupply" | "watch";
  bubbleSize: number;
  previousDemandScore?: number;
  previousSupplyScore?: number;
};

export type SearchTrendSeries = {
  ingredient: string;
  values: number[];
  color?: string;
};

export type MarketProduct = {
  ingredient_key: string;
  ingredient_label: string;
  product_count: number;
  previous_product_count: number;
  product_growth_rate: number;
  product_growth_count: number;
  source?: string;
};

export type ConcernMetric = {
  key: string;
  label: string;
  legacyKey?: string;
};

export type ConcernRow = {
  age: string;
  [key: string]: string | number;
};

export type Keyword = {
  label: string;
  score: number;
  tone?: "positive" | "negative" | "neutral";
};

export type ProductReview = {
  rank: number;
  brand: string;
  product: string;
  reviewCount: number;
  rating: number;
  sentiment: number;
  issue: string;
};

export type SkinTypeSentiment = {
  type: string;
  positive: number;
  neutral: number;
  negative: number;
  issue: string;
};

export type ReviewIngredient = {
  ingredient: string;
  functionChips: string[];
  sentiment: {
    positive: number;
    neutral: number;
    negative: number;
  };
  keywords: Keyword[];
  positiveKeywords: Keyword[];
  negativeKeywords: Keyword[];
  brandProducts: ProductReview[];
  skinTypeSentiment: SkinTypeSentiment[];
  opportunities: string[];
};

export type AlertType = "opportunity" | "inventory_risk" | "review_issue";

export type AlertSeverity = "high" | "medium" | "low";

export type AlertItem = {
  id: string;
  alert_date: string;
  alert_type: AlertType;
  severity: AlertSeverity;
  title: string;
  summary: string;
  ingredient_name: string;
  product_name?: string | null;
  detected_metric_name: string;
  detected_metric_value: number | string;
  baseline_metric_value?: number | string | null;
  reason_json: Record<string, unknown>;
  action_items_json: string[];
  is_sent: boolean;
  sent_channel?: string | null;
  created_at: string;
};

export type AgentInsight = {
  id: string;
  title: string;
  level: string;
  summary: string;
  evidence: string;
  strategy: string;
};

export type DashboardData = {
  meta: DashboardMeta;
  page1Summary: Page1Summary;
  page1: {
    functionRisers: RankItem[];
    ingredientPopularity: RankItem[];
    priceDistribution: PriceDistributionItem[];
    demandSupplyMatrix: DemandSupplyItem[];
    insights: string[];
  };
  page2: {
    periodLabel: string;
    selectedIngredient: string;
    selectedSummary: Record<string, unknown>;
    searchTrend: {
      dates: string[];
      series: SearchTrendSeries[];
    };
    concernMetrics: ConcernMetric[];
    marketProducts: MarketProduct[];
    concernTable: ConcernRow[];
    ageTopIngredients: unknown[];
    insights: string[];
  };
  page3: ReviewIngredient & {
    selectedIngredientKey: string;
    ingredientOptions: Array<{ key: string; label: string }>;
    byIngredient: Record<string, ReviewIngredient>;
  };
  page4: {
    alertDate: string;
    summary: {
      opportunityCount: number;
      inventoryRiskCount: number;
      reviewIssueCount: number;
    };
    alerts: AlertItem[];
  };
  page5: {
    promptPlaceholder: string;
    suggestions: string[];
    insights: AgentInsight[];
    targetStrategy: {
      title: string;
      issues: string[];
      directions: string[];
      actions: string[];
    };
  };
};
