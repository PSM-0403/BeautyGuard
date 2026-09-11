const dashboardMeta = {
  dataRange: "Naver DataLab 연결 중",
  lastUpdated: "-",
  comparisonLabel: "기간 내 전반부 대비 후반부",
  apiSource: "",
};

const page1Summary = {
  analyzedProducts: 3842,
  analyzedIngredients: 126,
  totalSearchGrowthRate: 18.4,
  risingIngredientCount: 12,
  supplyShortageIngredientCount: 7,
};

window.DASHBOARD_DATA = {
  meta: dashboardMeta,
  page1Summary,
  page1: {
    functionRisers: [],
    ingredientPopularity: [],
    priceDistribution: [
      { ingredient: "레티놀", salePrices: [19800, 22900, 27800, 31900, 34900, 39800, 45900, 52000, 61000], listPrices: [26000, 30000, 35000, 39000, 43000, 48000, 56000, 62000, 72000], prices: [19800, 22900, 27800, 31900, 34900, 39800, 45900, 52000, 61000] },
      { ingredient: "PDRN", salePrices: [24900, 29900, 33800, 38900, 43500, 48900, 56000, 64800, 72000], listPrices: [32000, 39000, 42000, 48000, 54000, 59000, 68000, 78000, 86000], prices: [24900, 29900, 33800, 38900, 43500, 48900, 56000, 64800, 72000] },
      { ingredient: "나이아신아마이드", salePrices: [12900, 15800, 18900, 22900, 26800, 30900, 34900, 39800], listPrices: [16000, 19000, 23000, 28000, 32000, 37000, 42000, 48000], prices: [12900, 15800, 18900, 22900, 26800, 30900, 34900, 39800] },
      { ingredient: "세라마이드", salePrices: [16900, 21000, 24800, 29900, 34800, 39200, 45500, 51000], listPrices: [21000, 26000, 30000, 36000, 42000, 47000, 54000, 61000], prices: [16900, 21000, 24800, 29900, 34800, 39200, 45500, 51000] },
      { ingredient: "판테놀", salePrices: [11900, 14800, 17900, 21900, 24900, 28000, 32900, 36500], listPrices: [15000, 18000, 22000, 27000, 30000, 34000, 40000, 45000], prices: [11900, 14800, 17900, 21900, 24900, 28000, 32900, 36500] },
    ],
    demandSupplyMatrix: [
      { ingredient: "레티놀", demand: 92, supply: 61, growth: 24.8, size: 44, status: "growth" },
      { ingredient: "PDRN", demand: 86, supply: 42, growth: 21.1, size: 38, status: "opportunity" },
      { ingredient: "나이아신아마이드", demand: 78, supply: 73, growth: 17.6, size: 42, status: "growth" },
      { ingredient: "세라마이드", demand: 74, supply: 45, growth: 13.9, size: 35, status: "opportunity" },
      { ingredient: "판테놀", demand: 69, supply: 39, growth: 11.4, size: 30, status: "opportunity" },
      { ingredient: "아데노신", demand: 46, supply: 79, growth: -4.2, size: 26, status: "oversupply" },
      { ingredient: "글루타티온", demand: 41, supply: 37, growth: -6.8, size: 22, status: "stable" },
      { ingredient: "트라넥사믹애씨드", demand: 39, supply: 29, growth: -8.3, size: 20, status: "stable" },
    ],
    insights: [
      "레티놀은 탄력/주름 개선 기능 검색과 함께 동반 상승해 5월 첫째 주 핵심 성장 성분으로 분류됩니다.",
      "PDRN과 세라마이드는 수요 대비 공급 노출이 낮아 신제품 테스트와 콘텐츠 선점 여지가 큽니다.",
      "아데노신은 제품 노출은 높지만 검색 관심이 약해 전주 대비 프로모션 효율 점검이 필요합니다.",
    ],
  },
  page2: {
    periodLabel: "Naver DataLab 연결 중",
    selectedIngredient: "나이아신아마이드",
    selectedSummary: {},
    searchTrend: { dates: [], series: [] },
    concernMetrics: [
      { key: "wrinkleElasticity", label: "주름/탄력" },
      { key: "toneSpot", label: "잡티/톤" },
      { key: "troubleCalming", label: "트러블/진정" },
      { key: "drynessBarrier", label: "건조/장벽" },
      { key: "poreSebum", label: "모공/피지" },
    ],
    marketProducts: [
      { ingredient_key: "niacinamide", ingredient_label: "나이아신아마이드", product_count: 128, previous_product_count: 113, product_growth_rate: 13.3, product_growth_count: 15, source: "mock_retail_data" },
      { ingredient_key: "hyaluronic_acid", ingredient_label: "히알루론산", product_count: 96, previous_product_count: 101, product_growth_rate: -5.0, product_growth_count: -5, source: "mock_retail_data" },
      { ingredient_key: "centella", ingredient_label: "병풀/시카", product_count: 74, previous_product_count: 74, product_growth_rate: 0.0, product_growth_count: 0, source: "mock_retail_data" },
      { ingredient_key: "retinol", ingredient_label: "레티놀", product_count: 49, previous_product_count: 43, product_growth_rate: 14.0, product_growth_count: 6, source: "mock_retail_data" },
      { ingredient_key: "pdrn", ingredient_label: "PDRN", product_count: 27, previous_product_count: 22, product_growth_rate: 22.7, product_growth_count: 5, source: "mock_retail_data" },
    ],
    concernTable: [],
    ageTopIngredients: [],
    insights: [],
  },
  page3: {
    selectedIngredientKey: "retinol",
    ingredientOptions: [
      { key: "niacinamide", label: "나이아신아마이드" },
      { key: "hyaluronic_acid", label: "히알루론산" },
      { key: "centella", label: "병풀/시카" },
      { key: "pdrn", label: "PDRN" },
      { key: "retinol", label: "레티놀" },
    ],
    ingredient: "레티놀",
    functionChips: ["탄력/주름 개선", "피부결 개선", "안티에이징"],
    sentiment: { positive: 72, neutral: 18, negative: 10 },
    keywords: [
      { label: "탄력", score: 92, tone: "positive" },
      { label: "피부결", score: 88, tone: "positive" },
      { label: "자극", score: 64, tone: "negative" },
      { label: "건조함", score: 57, tone: "negative" },
      { label: "흡수력", score: 52, tone: "positive" },
      { label: "초보자", score: 48, tone: "neutral" },
    ],
    positiveKeywords: [
      { label: "촉촉해요", score: 24.1 },
      { label: "흡수 잘돼요", score: 18.7 },
      { label: "피부결 개선", score: 15.2 },
      { label: "탄력 느껴져요", score: 13.6 },
      { label: "자극 없어요", score: 12.4 },
    ],
    negativeKeywords: [
      { label: "비싸요", score: 28.3 },
      { label: "자극 있어요", score: 22.1 },
      { label: "효과 없어요", score: 16.5 },
      { label: "끈적거려요", score: 14.2 },
      { label: "트러블 올라와요", score: 11.7 },
    ],
    brandProducts: [
      { rank: 1, brand: "아이오페", product: "레티놀 슈퍼 바운스 세럼", reviewCount: 12842, rating: 4.8, sentiment: 78, issue: "자극 완화 메시지 강점" },
      { rank: 2, brand: "이니스프리", product: "레티놀 시카 흔적 앰플", reviewCount: 9615, rating: 4.7, sentiment: 74, issue: "탄력 체감 리뷰 다수" },
      { rank: 3, brand: "라운드랩", product: "레티놀 탄력 세럼", reviewCount: 6208, rating: 4.6, sentiment: 69, issue: "입문자 사용법 문의 증가" },
    ],
    skinTypeSentiment: [
      { type: "건성", positive: 68, neutral: 19, negative: 13, issue: "초기 건조감, 보습 레이어링 필요" },
      { type: "복합성", positive: 76, neutral: 16, negative: 8, issue: "피부결 개선 체감이 빠름" },
      { type: "지성", positive: 73, neutral: 18, negative: 9, issue: "끈적임 적은 제형 선호" },
      { type: "민감성", positive: 61, neutral: 23, negative: 16, issue: "저농도/격일 사용 가이드 필요" },
    ],
    opportunities: [
      "건성 타겟에는 레티놀 단독보다 세라마이드/판테놀 보습 조합을 함께 제안하는 메시지가 유리합니다.",
      "민감성 리뷰에서 자극 우려가 반복되므로 입문 루틴, 낮은 농도, 사용 주기 안내가 전환 장벽을 낮춥니다.",
      "탄력 체감 키워드가 긍정 리뷰의 중심이므로 전후 비교형 상세 콘텐츠를 우선 테스트할 만합니다.",
    ],
    byIngredient: {
      retinol: {
        ingredient: "레티놀",
        functionChips: ["탄력/주름 개선", "피부결 개선", "안티에이징"],
        sentiment: { positive: 72, neutral: 18, negative: 10 },
        positiveKeywords: [
          { label: "촉촉해요", score: 24.1 }, { label: "흡수 잘돼요", score: 18.7 }, { label: "피부결 개선", score: 15.2 }, { label: "탄력 느껴져요", score: 13.6 }, { label: "자극 없어요", score: 12.4 },
        ],
        negativeKeywords: [
          { label: "비싸요", score: 28.3 }, { label: "자극 있어요", score: 22.1 }, { label: "효과 없어요", score: 16.5 }, { label: "끈적거려요", score: 14.2 }, { label: "트러블 올라와요", score: 11.7 },
        ],
        keywords: [],
        brandProducts: [
          { rank: 1, brand: "아이오페", product: "레티놀 슈퍼 바운스 세럼", reviewCount: 12842, rating: 4.8, sentiment: 78, issue: "자극 완화 메시지 강점" },
          { rank: 2, brand: "이니스프리", product: "레티놀 시카 흔적 앰플", reviewCount: 9615, rating: 4.7, sentiment: 74, issue: "탄력 체감 리뷰 다수" },
          { rank: 3, brand: "라운드랩", product: "레티놀 탄력 세럼", reviewCount: 6208, rating: 4.6, sentiment: 69, issue: "입문자 사용법 문의 증가" },
        ],
        skinTypeSentiment: [
          { type: "건성", positive: 68, neutral: 19, negative: 13, issue: "초기 건조감, 보습 레이어링 필요" },
          { type: "복합성", positive: 76, neutral: 16, negative: 8, issue: "피부결 개선 체감이 빠름" },
          { type: "지성", positive: 73, neutral: 18, negative: 9, issue: "끈적임 적은 제형 선호" },
          { type: "민감성", positive: 61, neutral: 23, negative: 16, issue: "저농도/격일 사용 가이드 필요" },
        ],
        opportunities: ["건성 타겟에는 레티놀 단독보다 세라마이드/판테놀 보습 조합을 함께 제안하는 메시지가 유리합니다.", "민감성 리뷰에서 자극 우려가 반복되므로 입문 루틴, 낮은 농도, 사용 주기 안내가 전환 장벽을 낮춥니다.", "탄력 체감 키워드가 긍정 리뷰의 중심이므로 전후 비교형 상세 콘텐츠를 우선 테스트할 만합니다."],
      },
      niacinamide: {
        ingredient: "나이아신아마이드",
        functionChips: ["브라이트닝", "잡티/톤 개선", "피부결 개선"],
        sentiment: { positive: 76, neutral: 17, negative: 7 },
        positiveKeywords: [
          { label: "톤이 맑아져요", score: 25.8 }, { label: "피부결 매끈", score: 19.4 }, { label: "자극 적어요", score: 16.9 }, { label: "흡수 빨라요", score: 13.8 }, { label: "데일리 사용", score: 11.6 },
        ],
        negativeKeywords: [
          { label: "효과 느림", score: 24.7 }, { label: "건조해요", score: 18.5 }, { label: "끈적임", score: 15.4 }, { label: "향이 강함", score: 12.9 }, { label: "트러블", score: 10.8 },
        ],
        keywords: [],
        brandProducts: [
          { rank: 1, brand: "구달", product: "청귤 비타C 잡티 세럼", reviewCount: 15320, rating: 4.7, sentiment: 77, issue: "잡티/톤 개선 기대 리뷰 다수" },
          { rank: 2, brand: "넘버즈인", product: "5번 글루타치온C 흔적 앰플", reviewCount: 11840, rating: 4.6, sentiment: 73, issue: "피부톤 체감 리뷰 우세" },
          { rank: 3, brand: "디오디너리", product: "나이아신아마이드 10% + 징크 1%", reviewCount: 8940, rating: 4.5, sentiment: 70, issue: "피지/결 개선 언급 증가" },
        ],
        skinTypeSentiment: [
          { type: "건성", positive: 69, neutral: 21, negative: 10, issue: "건조감 완화를 위한 보습 조합 선호" },
          { type: "복합성", positive: 79, neutral: 15, negative: 6, issue: "피부결과 톤 개선 체감이 높음" },
          { type: "지성", positive: 78, neutral: 16, negative: 6, issue: "피지 부담 적은 제형 선호" },
          { type: "민감성", positive: 66, neutral: 24, negative: 10, issue: "고함량 제품 자극 우려" },
        ],
        opportunities: ["톤 개선 메시지는 잡티보다 데일리 브라이트닝으로 풀 때 반응이 안정적입니다.", "지성/복합성 타겟에는 피지와 피부결 개선 근거를 함께 제시하는 구성이 유리합니다.", "민감성 타겟에는 고함량보다 저자극 누적 케어 메시지를 우선 배치하세요."],
      },
      hyaluronic_acid: {
        ingredient: "히알루론산",
        functionChips: ["수분 충전", "속건조 완화", "보습"],
        sentiment: { positive: 81, neutral: 13, negative: 6 },
        positiveKeywords: [
          { label: "수분감 좋아요", score: 28.2 }, { label: "촉촉해요", score: 24.5 }, { label: "흡수 빨라요", score: 15.3 }, { label: "속건조 완화", score: 13.7 }, { label: "가볍게 발려요", score: 10.9 },
        ],
        negativeKeywords: [
          { label: "지속력 아쉬움", score: 22.4 }, { label: "금방 건조", score: 18.8 }, { label: "끈적임", score: 15.1 }, { label: "용량 적음", score: 13.3 }, { label: "가격 부담", score: 10.6 },
        ],
        keywords: [],
        brandProducts: [
          { rank: 1, brand: "토리든", product: "다이브인 저분자 히알루론산 세럼", reviewCount: 18210, rating: 4.8, sentiment: 82, issue: "수분감과 흡수력 긍정 리뷰 강세" },
          { rank: 2, brand: "웰라쥬", product: "리얼 히알루로닉 블루 앰플", reviewCount: 10340, rating: 4.7, sentiment: 78, issue: "속건조 완화 언급 다수" },
          { rank: 3, brand: "이즈앤트리", product: "히알루론산 워터 에센스", reviewCount: 7240, rating: 4.6, sentiment: 75, issue: "가벼운 보습 제형 선호" },
        ],
        skinTypeSentiment: [
          { type: "건성", positive: 83, neutral: 11, negative: 6, issue: "보습 지속력 니즈가 큼" },
          { type: "복합성", positive: 80, neutral: 14, negative: 6, issue: "가벼운 수분 레이어링 선호" },
          { type: "지성", positive: 77, neutral: 17, negative: 6, issue: "끈적임 없는 수분감 선호" },
          { type: "민감성", positive: 78, neutral: 16, negative: 6, issue: "무향/저자극 표현에 반응" },
        ],
        opportunities: ["속건조 타겟에는 단독 수분보다 보습막 성분과의 조합을 강조하는 것이 좋습니다.", "지성 타겟은 산뜻한 제형과 끈적임 없음 메시지에 반응합니다.", "계절성 수요가 큰 성분이므로 온도/습도 변화 콘텐츠와 묶어 운영하세요."],
      },
      centella: {
        ingredient: "병풀/시카",
        functionChips: ["진정", "트러블 케어", "장벽 보조"],
        sentiment: { positive: 74, neutral: 18, negative: 8 },
        positiveKeywords: [
          { label: "진정돼요", score: 27.6 }, { label: "자극 적어요", score: 21.2 }, { label: "트러블 완화", score: 16.8 }, { label: "붉은기 완화", score: 13.4 }, { label: "순해요", score: 12.1 },
        ],
        negativeKeywords: [
          { label: "효과 약함", score: 23.2 }, { label: "흡수 느림", score: 16.4 }, { label: "끈적임", score: 14.9 }, { label: "트러블", score: 12.5 }, { label: "향 불호", score: 9.7 },
        ],
        keywords: [],
        brandProducts: [
          { rank: 1, brand: "이니스프리", product: "레티놀 시카 흔적 앰플", reviewCount: 9615, rating: 4.7, sentiment: 74, issue: "진정과 흔적 케어 기대 동시 발생" },
          { rank: 2, brand: "스킨1004", product: "마다가스카르 센텔라 앰플", reviewCount: 13280, rating: 4.8, sentiment: 79, issue: "순한 진정 이미지 강점" },
          { rank: 3, brand: "라로슈포제", product: "시카플라스트 B5 세럼", reviewCount: 6840, rating: 4.6, sentiment: 71, issue: "장벽/진정 동시 니즈" },
        ],
        skinTypeSentiment: [
          { type: "건성", positive: 70, neutral: 21, negative: 9, issue: "진정 후 보습감 보완 니즈" },
          { type: "복합성", positive: 75, neutral: 17, negative: 8, issue: "붉은기 진정 체감" },
          { type: "지성", positive: 77, neutral: 16, negative: 7, issue: "트러블 진정 기대가 큼" },
          { type: "민감성", positive: 76, neutral: 18, negative: 6, issue: "저자극 신뢰 메시지 중요" },
        ],
        opportunities: ["트러블과 민감성 타겟 모두 잡을 수 있어 진정 근거와 저자극 테스트 메시지가 중요합니다.", "효과 약함 리뷰가 있어 진정 전후 비교형 콘텐츠가 보완 포인트입니다.", "장벽 성분과의 조합을 강조하면 건성 타겟 확장성이 커집니다."],
      },
      pdrn: {
        ingredient: "PDRN",
        functionChips: ["회복", "탄력", "광채"],
        sentiment: { positive: 73, neutral: 19, negative: 8 },
        positiveKeywords: [
          { label: "피부가 차올라요", score: 23.5 }, { label: "광채", score: 20.4 }, { label: "탄력", score: 17.6 }, { label: "회복감", score: 15.1 }, { label: "고급감", score: 11.8 },
        ],
        negativeKeywords: [
          { label: "가격 부담", score: 31.2 }, { label: "효과 애매", score: 20.8 }, { label: "끈적임", score: 13.7 }, { label: "용량 적음", score: 12.4 }, { label: "흡수 느림", score: 9.5 },
        ],
        keywords: [],
        brandProducts: [
          { rank: 1, brand: "메디큐브", product: "PDRN 핑크 펩타이드 앰플", reviewCount: 8420, rating: 4.7, sentiment: 75, issue: "광채와 탄력 체감 리뷰 증가" },
          { rank: 2, brand: "리쥬란", product: "힐러 턴오버 앰플", reviewCount: 6320, rating: 4.6, sentiment: 72, issue: "프리미엄 회복 이미지 강점" },
          { rank: 3, brand: "VT", product: "PDRN 리들샷 세럼", reviewCount: 5890, rating: 4.5, sentiment: 69, issue: "피부결/광채 기대 리뷰" },
        ],
        skinTypeSentiment: [
          { type: "건성", positive: 76, neutral: 16, negative: 8, issue: "보습감과 회복감 기대" },
          { type: "복합성", positive: 74, neutral: 18, negative: 8, issue: "광채와 피부결 체감" },
          { type: "지성", positive: 68, neutral: 22, negative: 10, issue: "끈적임과 무거운 제형 우려" },
          { type: "민감성", positive: 70, neutral: 21, negative: 9, issue: "자극보다는 가격 대비 효과 우려" },
        ],
        opportunities: ["PDRN은 가격 저항이 커서 프리미엄 근거와 임상/성분 스토리텔링이 중요합니다.", "광채와 탄력 메시지를 동시에 쓰되, 지성 타겟에는 산뜻한 제형을 강조하세요.", "입문 가격대 기획세트나 샘플링으로 체감 장벽을 낮추는 전략이 유리합니다."],
      },
    },
  },
  page4: {
    summary: {
      spikeCount: 2,
      oversupplyCount: 1,
      negativeReviewCount: 2,
    },
    alerts: [
      {
        id: "retinol-spike",
        type: "급등",
        title: "레티놀 검색량 급등",
        description: "탄력/주름 개선 검색과 함께 레티놀 관심도가 전주 대비 빠르게 상승했습니다.",
        time: "2025.05.05 21:40",
        metric: "+31.2%",
        severity: "높음",
        reasons: [
          "레티놀 검색 지수가 주간 후반 3일 연속 상승했습니다.",
          "탄력/주름 개선 기능 검색량이 동반 증가했습니다.",
          "30~40대 검색 비중이 전주 대비 확대되었습니다.",
        ],
        actions: [
          "레티놀 관련 검색 광고와 상세페이지 노출을 우선 점검하세요.",
          "건성/민감성 타겟에는 저자극 사용 가이드를 함께 노출하세요.",
          "주간 캠페인 카피에 탄력/주름 개선 메시지를 반영하세요.",
        ],
        metrics: {
          "검색량": "+31.2%",
          "관심 성분 순위": "1위",
          "주요 타깃": "30~40대",
        },
      },
      {
        id: "pdrn-rebound",
        type: "급등",
        title: "PDRN 관심도 재상승",
        description: "앰플 카테고리에서 PDRN 검색 지수가 2025.05.04 이후 다시 상승했습니다.",
        time: "2025.05.04 18:20",
        metric: "+21.1%",
        severity: "중간",
        reasons: [
          "PDRN 검색 지수가 주간 평균 대비 높은 수준으로 회복했습니다.",
          "회복/광채 관련 키워드와 함께 언급량이 증가했습니다.",
        ],
        actions: [
          "레티놀 대비 회복/광채 포지션의 비교 콘텐츠를 테스트하세요.",
          "공급 노출이 낮은 SKU의 리뷰와 가격 경쟁력을 점검하세요.",
        ],
        metrics: {
          "검색량": "+21.1%",
          "수요지수": "86",
          "공급지수": "42",
        },
      },
      {
        id: "adenosine-oversupply",
        type: "공급 과열",
        title: "아데노신 노출 과다",
        description: "검색 수요 대비 제품 노출이 높아 신규 발주보다 차별화 메시지 점검이 필요합니다.",
        time: "2025.05.03 11:10",
        metric: "공급 79",
        severity: "중간",
        reasons: [
          "공급지수 79로 카테고리 평균보다 높게 노출되고 있습니다.",
          "검색 수요지수는 46에 머물러 수요-공급 간 간극이 있습니다.",
        ],
        actions: [
          "신규 발주 확대보다 기존 SKU의 차별화 메시지를 우선 점검하세요.",
          "프로모션 효율과 리뷰 키워드 반응을 함께 확인하세요.",
        ],
        metrics: {
          "공급지수": "79",
          "수요지수": "46",
          "전주 대비": "-4.2%",
        },
      },
      {
        id: "retinol-dry-review",
        type: "부정 리뷰 증가",
        title: "레티놀 건성 리뷰 건조감 증가",
        description: "건성 피부 리뷰에서 건조감과 따가움 키워드가 증가했습니다.",
        time: "2025.05.02 15:35",
        metric: "+9.4%p",
        severity: "높음",
        reasons: [
          "건성 리뷰에서 건조감 언급 비율이 가장 높게 나타났습니다.",
          "자극/따가움 키워드가 부정 리뷰의 주요 원인으로 반복됩니다.",
          "초기 사용법 안내 니즈가 함께 증가했습니다.",
        ],
        actions: [
          "상세페이지 상단에 보습 레이어링과 사용 주기 안내를 추가하세요.",
          "세라마이드/판테놀 결합 메시지를 배너 카피에 반영하세요.",
          "저자극 샘플링 또는 입문 루틴 콘텐츠를 테스트하세요.",
        ],
        metrics: {
          "부정비율": "+9.4%p",
          "주요 피부타입": "건성",
          "주요 키워드": "건조감",
        },
      },
      {
        id: "sensitive-irritation",
        type: "부정 리뷰 증가",
        title: "민감성 자극 언급 증가",
        description: "민감성 리뷰에서 레티놀 사용 주기와 농도 안내 니즈가 감지되었습니다.",
        time: "2025.04.30 09:10",
        metric: "+6.1%p",
        severity: "중간",
        reasons: [
          "민감성 리뷰에서 자극 우려가 전주 대비 증가했습니다.",
          "저농도/격일 사용 가이드 관련 문의가 늘었습니다.",
        ],
        actions: [
          "초보자용 사용 루틴을 FAQ와 상세페이지에 추가하세요.",
          "고농도 표현보다 저자극/완충 성분 메시지를 우선 노출하세요.",
        ],
        metrics: {
          "부정비율": "+6.1%p",
          "관련 키워드": "자극",
          "권장 대응": "사용법 안내",
        },
      },
    ],
  },
  page5: {
    promptPlaceholder: "예: 건성 타겟을 위한 레티놀 마케팅 전략 제안해줘",
    suggestions: [
      "이번 주 진입 검토 성분 추천해줘",
      "건성 타겟 레티놀 전략 알려줘",
      "공급 과열 성분 알려줘",
      "부정 리뷰 많은 성분 개선 방향 알려줘",
      "20대 타겟 미백 성분 전략 제안해줘",
    ],
    insights: [
      {
        id: "dry-retinol",
        title: "건성 타겟 레티놀 번들 전략",
        level: "높음",
        summary: "검색 수요는 상승 중이지만 건성 리뷰에서 건조감 이슈가 함께 증가했습니다.",
        evidence: "2025.04.30 ~ 2025.05.05 기준 레티놀 검색량은 전주 대비 +24.8%, 건성 리뷰의 건조감 이슈는 +9.4%p 증가했습니다.",
        strategy: "레티놀 + 세라마이드/판테놀 보습 조합을 묶고, 첫 2주 사용 루틴을 상세페이지 상단에 배치하세요.",
      },
      {
        id: "pdrn-content",
        title: "PDRN 비교 콘텐츠 테스트",
        level: "중간",
        summary: "PDRN은 수요 대비 공급 노출이 낮아 콘텐츠 선점 여지가 있습니다.",
        evidence: "동기간 PDRN은 수요 지수 86, 공급 지수 42로 수요 대비 노출이 낮은 구간에 있습니다.",
        strategy: "레티놀 대비 회복/광채 포지션을 강조한 숏폼 A/B 테스트를 7일 단위로 운영하세요.",
      },
      {
        id: "adenosine-check",
        title: "아데노신 프로모션 효율 점검",
        level: "중간",
        summary: "공급 노출은 높지만 검색 수요가 약해 발주 확대 전 검토가 필요합니다.",
        evidence: "2025.04.30 ~ 2025.05.05 기준 공급 지수는 높지만 검색 수요 지수는 46에 머물렀습니다.",
        strategy: "신규 발주 확대보다 기존 SKU의 가격/증정 혜택 반응과 리뷰 키워드를 먼저 확인하세요.",
      },
    ],
    targetStrategy: {
      title: "레티놀 × 건성 타겟 전략",
      issues: ["건조감", "자극", "따가움"],
      directions: ["세라마이드/판테놀 결합", "저자극 메시지", "샘플링 유도"],
      actions: ["상세페이지 문구 개선", "리뷰 키워드 반영", "배너 카피 제안"],
    },
  },
};

window.dashboardMeta = dashboardMeta;
window.page1Summary = page1Summary;
