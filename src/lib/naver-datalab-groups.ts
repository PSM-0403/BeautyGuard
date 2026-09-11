export type NaverDatalabKeywordGroup = {
  key: string;
  label: string;
  keywords: string[];
};

type IngredientDefinition = {
  key: string;
  label: string;
  stems: string[];
  funcs: string[];
};

export const ANCHOR_GROUP: NaverDatalabKeywordGroup = {
  key: "__anchor__",
  label: "__anchor__",
  keywords: ["세럼 추천", "앰플 추천", "에센스 추천"],
};

export const FUNCTION_SIGNAL_GROUPS: NaverDatalabKeywordGroup[] = [
  {
    key: "cooling_calming",
    label: "쿨링진정",
    keywords: [
      "쿨링 세럼",
      "쿨링 앰플",
      "쿨링 진정",
      "열감 진정",
      "피부 열감",
      "붉은기 진정",
      "진정 세럼",
      "진정 앰플",
      "시카 진정",
      "병풀 진정",
      "어성초 진정",
      "알로에 진정",
    ],
  },
  {
    key: "moisture_hydration",
    label: "수분보습",
    keywords: [
      "수분 세럼",
      "수분 앰플",
      "보습 세럼",
      "보습 앰플",
      "속건조 세럼",
      "속건조 앰플",
      "히알루론산 세럼",
      "히알루론산 앰플",
      "수분 충전",
      "보습 충전",
      "스쿠알란 보습",
      "판테놀 보습",
    ],
  },
  {
    key: "anti_aging",
    label: "안티에이징",
    keywords: [
      "안티에이징 세럼",
      "안티에이징 앰플",
      "노화 케어",
      "에이징 케어",
      "레티놀 안티에이징",
      "PDRN 안티에이징",
      "펩타이드 안티에이징",
      "콜라겐 세럼",
      "리프팅 세럼",
      "리프팅 앰플",
      "탄력 리프팅 세럼",
    ],
  },
  {
    key: "brightening",
    label: "브라이트닝",
    keywords: [
      "브라이트닝 세럼",
      "브라이트닝 앰플",
      "광채 세럼",
      "광채 앰플",
      "톤 개선 세럼",
      "톤업 앰플",
      "피부톤 개선",
      "나이아신아마이드 톤",
      "비타민C 세럼",
      "글루타티온 세럼",
    ],
  },
  {
    key: "spot_pigmentation",
    label: "기미잡티",
    keywords: [
      "잡티 세럼",
      "잡티 앰플",
      "기미 세럼",
      "기미 앰플",
      "색소침착 세럼",
      "색소침착 앰플",
      "다크스팟 세럼",
      "비타민C 잡티",
      "나이아신아마이드 잡티",
      "글루타티온 잡티",
      "트라넥사믹애씨드 세럼",
      "미백 세럼",
      "미백 앰플",
    ],
  },
  {
    key: "wrinkle_elasticity",
    label: "주름탄력",
    keywords: [
      "주름 개선 세럼",
      "주름 개선 앰플",
      "탄력 세럼",
      "탄력 앰플",
      "탄력 개선",
      "주름 탄력",
      "레티놀 탄력",
      "레티놀 주름",
      "PDRN 탄력",
      "펩타이드 탄력",
      "아데노신 주름",
      "콜라겐 탄력",
    ],
  },
  {
    key: "pore",
    label: "모공",
    keywords: [
      "모공 세럼",
      "모공 앰플",
      "모공 관리 세럼",
      "모공 케어",
      "모공 개선",
      "모공 축소",
      "모공 탄력",
      "나이아신아마이드 모공",
      "레티놀 모공",
      "피지 모공",
      "늘어진 모공",
    ],
  },
  {
    key: "exfoliation_texture",
    label: "각질결",
    keywords: [
      "각질 세럼",
      "각질 앰플",
      "각질 케어",
      "피부결 세럼",
      "피부결 앰플",
      "결 개선 세럼",
      "피부결 개선",
      "AHA 세럼",
      "BHA 세럼",
      "PHA 세럼",
      "살리실산 세럼",
      "피부결 각질",
    ],
  },
  {
    key: "trouble_calming",
    label: "트러블진정",
    keywords: [
      "트러블 세럼",
      "트러블 앰플",
      "트러블 진정",
      "여드름 세럼",
      "여드름 앰플",
      "여드름 진정",
      "티트리 세럼",
      "티트리 앰플",
      "어성초 세럼",
      "시카 트러블",
      "병풀 트러블",
      "살리실산 트러블",
    ],
  },
  {
    key: "barrier",
    label: "장벽",
    keywords: [
      "피부장벽 세럼",
      "피부장벽 앰플",
      "장벽 강화 세럼",
      "장벽 강화 앰플",
      "장벽 케어",
      "장벽 회복",
      "세라마이드 세럼",
      "세라마이드 앰플",
      "판테놀 장벽",
      "엑토인 세럼",
      "스쿠알란 세럼",
      "마데카소사이드 장벽",
    ],
  },
  {
    key: "sebum_oil",
    label: "피지유분",
    keywords: [
      "피지 세럼",
      "피지 앰플",
      "피지 조절 세럼",
      "유분 조절 세럼",
      "피지 케어",
      "유분 케어",
      "번들거림 세럼",
      "개기름 세럼",
      "BHA 세럼",
      "살리실산 세럼",
      "모공 피지 세럼",
      "티트리 피지",
    ],
  },
];

export const INGREDIENT_SIGNAL_GROUPS: IngredientDefinition[] = [
  {
    key: "retinoid",
    label: "레티놀/레티날",
    stems: ["레티놀", "레티날", "Retinol", "Retinal"],
    funcs: ["탄력", "주름", "피부결", "안티에이징"],
  },
  {
    key: "pdrn",
    label: "PDRN",
    stems: ["PDRN", "피디알엔", "피디알앤", "연어 DNA"],
    funcs: ["탄력", "재생", "회복", "광채"],
  },
  {
    key: "niacinamide",
    label: "나이아신아마이드",
    stems: ["나이아신아마이드", "니아신아마이드", "나이아신", "Niacinamide"],
    funcs: ["미백", "톤", "잡티", "피부결"],
  },
  {
    key: "hyaluronic_acid",
    label: "히알루론산",
    stems: ["히알루론산", "히알루론", "히알루로닉", "Hyaluronic Acid"],
    funcs: ["수분", "보습", "속건조"],
  },
  {
    key: "centella",
    label: "병풀/시카",
    stems: ["병풀", "시카", "센텔라", "Cica"],
    funcs: ["진정", "붉은기", "트러블", "장벽"],
  },
  {
    key: "ceramide",
    label: "세라마이드",
    stems: ["세라마이드", "쎄라마이드", "Ceramide"],
    funcs: ["장벽", "보습", "속건조"],
  },
  {
    key: "panthenol",
    label: "판테놀",
    stems: ["판테놀", "디판테놀", "D판테놀", "Panthenol"],
    funcs: ["장벽", "보습", "진정"],
  },
  {
    key: "adenosine",
    label: "아데노신",
    stems: ["아데노신", "Adenosine"],
    funcs: ["주름", "탄력", "안티에이징"],
  },
  {
    key: "peptide",
    label: "펩타이드",
    stems: ["펩타이드", "Peptide"],
    funcs: ["탄력", "리프팅", "주름"],
  },
  {
    key: "vitamin_c",
    label: "비타민C",
    stems: ["비타민C", "비타민씨", "비타C", "Vitamin C"],
    funcs: ["잡티", "미백", "광채", "톤"],
  },
  {
    key: "glutathione",
    label: "글루타티온",
    stems: ["글루타티온", "글루타치온", "Glutathione"],
    funcs: ["미백", "광채", "톤"],
  },
  {
    key: "tranexamic_acid",
    label: "트라넥사믹애씨드",
    stems: ["트라넥사믹애씨드", "트라넥삼산", "트라넥사민산", "TXA"],
    funcs: ["잡티", "기미", "미백"],
  },
  {
    key: "bakuchiol",
    label: "바쿠치올",
    stems: ["바쿠치올", "Bakuchiol", "식물성 레티놀"],
    funcs: ["탄력", "주름", "저자극"],
  },
  {
    key: "madecassoside",
    label: "마데카소사이드",
    stems: ["마데카소사이드", "마데카", "Madecassoside"],
    funcs: ["진정", "장벽", "재생"],
  },
  {
    key: "heartleaf",
    label: "어성초",
    stems: ["어성초", "하트리프", "Heartleaf"],
    funcs: ["진정", "트러블", "피지"],
  },
  {
    key: "tea_tree",
    label: "티트리",
    stems: ["티트리", "티트리오일", "Tea Tree"],
    funcs: ["트러블", "피지", "진정"],
  },
  {
    key: "bha",
    label: "살리실산/BHA",
    stems: ["살리실산", "BHA", "바하", "Salicylic Acid"],
    funcs: ["각질", "피지", "모공", "트러블"],
  },
  {
    key: "aha",
    label: "AHA",
    stems: ["AHA", "아하", "글리콜릭애씨드", "락틱애씨드"],
    funcs: ["각질", "피부결", "모공"],
  },
  {
    key: "pha",
    label: "PHA",
    stems: ["PHA", "파하", "글루코노락톤", "Gluconolactone"],
    funcs: ["각질", "피부결", "저자극"],
  },
  {
    key: "azelaic_acid",
    label: "아젤라익애씨드",
    stems: ["아젤라익애씨드", "아젤라익산", "아젤라인산", "Azelaic Acid"],
    funcs: ["트러블", "붉은기", "잡티"],
  },
  {
    key: "squalane",
    label: "스쿠알란",
    stems: ["스쿠알란", "스쿠알렌", "Squalane"],
    funcs: ["보습", "장벽", "속건조"],
  },
  {
    key: "allantoin",
    label: "알란토인",
    stems: ["알란토인", "Allantoin"],
    funcs: ["진정", "저자극", "장벽"],
  },
  {
    key: "ectoin",
    label: "엑토인",
    stems: ["엑토인", "Ectoin"],
    funcs: ["장벽", "보습", "진정"],
  },
  {
    key: "collagen",
    label: "콜라겐",
    stems: ["콜라겐", "저분자 콜라겐", "Collagen"],
    funcs: ["탄력", "보습", "리프팅"],
  },
  {
    key: "propolis",
    label: "프로폴리스",
    stems: ["프로폴리스", "Propolis"],
    funcs: ["보습", "진정", "광채"],
  },
];

export const INGREDIENT_SIGNAL_DEFINITIONS = INGREDIENT_SIGNAL_GROUPS;

export function buildIngredientKeywordGroups() {
  return INGREDIENT_SIGNAL_GROUPS.map((definition) => ({
    key: definition.key,
    label: definition.label,
    keywords: buildIngredientKeywords(definition),
  }));
}

function buildIngredientKeywords(group: IngredientDefinition) {
  const keywords: string[] = [];
  const add = (keyword: string) => {
    const normalized = keyword.trim();
    if (normalized && !keywords.includes(normalized)) keywords.push(normalized);
  };

  // 앞쪽 키워드는 route.ts에서 KEYWORDS_PER_GROUP 기본값(8개)으로 잘릴 수 있으므로
  // stem과 핵심 조합을 먼저 균형 있게 배치한다.
  group.stems.forEach((stem) => add(stem));
  group.stems.forEach((stem) => add(`${stem} 세럼`));
  group.stems.forEach((stem) => add(`${stem} 앰플`));
  group.stems.forEach((stem) => add(`${stem} 에센스`));
  group.stems.forEach((stem) => add(`${stem} 세럼 추천`));
  group.stems.forEach((stem) => add(`${stem} 앰플 추천`));

  group.funcs.forEach((func) => {
    group.stems.forEach((stem) => add(`${stem} ${func}`));
  });

  return keywords.slice(0, 20);
}


import { MAIN_INGREDIENT_LIST } from "@/lib/main-ingredients";

export const PAGE2_MAIN_INGREDIENT_GROUPS: NaverDatalabKeywordGroup[] = MAIN_INGREDIENT_LIST.map(({ key, label }) => ({
  key,
  label,
  keywords: buildIngredientKeywords(INGREDIENT_SIGNAL_GROUPS.find((group) => group.key === key) ?? { key, label, stems: [label], funcs: [] }),
}));

export const CONCERN_SIGNAL_GROUPS: NaverDatalabKeywordGroup[] = [
  {
    key: "wrinkleElasticity",
    label: "주름/탄력",
    keywords: [
      "주름", "잔주름", "팔자주름", "목주름", "주름 개선", "탄력", "피부 탄력", "처진 피부",
      "리프팅", "안티에이징", "노화 케어", "레티놀 탄력", "PDRN 탄력", "펩타이드 탄력",
      "콜라겐 탄력", "아데노신 주름", "탄력 세럼", "탄력 앰플", "주름 개선 세럼", "리프팅 세럼",
    ],
  },
  {
    key: "toneSpot",
    label: "잡티/톤",
    keywords: [
      "잡티", "기미", "주근깨", "색소침착", "다크스팟", "피부톤", "톤 개선", "톤업",
      "칙칙함", "광채", "브라이트닝", "미백", "비타민C 잡티", "나이아신아마이드 톤",
      "글루타티온", "트라넥사믹애씨드", "잡티 세럼", "기미 세럼", "톤 개선 세럼", "미백 세럼",
    ],
  },
  {
    key: "troubleCalming",
    label: "트러블/진정",
    keywords: [
      "트러블", "여드름", "뾰루지", "피부 진정", "진정", "붉은기", "홍조", "자극",
      "피부 자극", "민감 피부", "시카", "병풀", "어성초", "티트리", "마데카소사이드",
      "트러블 세럼", "여드름 세럼", "진정 세럼", "시카 앰플", "병풀 진정", "붉은기 진정",
    ],
  },
  {
    key: "drynessBarrier",
    label: "건조/장벽",
    keywords: [
      "건조", "속건조", "피부 건조", "수분 부족", "보습", "수분", "수분 충전", "보습 강화",
      "피부장벽", "장벽", "장벽 강화", "장벽 회복", "히알루론산", "세라마이드", "판테놀",
      "스쿠알란", "엑토인", "속건조 세럼", "수분 세럼", "보습 앰플", "피부장벽 세럼", "장벽 강화 앰플",
    ],
  },
  {
    key: "poreSebum",
    label: "모공/피지",
    keywords: [
      "모공", "넓은 모공", "모공 개선", "모공 축소", "모공 관리", "블랙헤드", "화이트헤드",
      "피지", "유분", "피지 조절", "유분 조절", "번들거림", "개기름", "피부결 모공",
      "BHA", "살리실산", "나이아신아마이드 모공", "레티놀 모공", "모공 세럼", "피지 세럼",
      "피지 조절 세럼", "모공 관리 세럼",
    ],
  },
];

export const AGE_GROUPS = [
  { label: "20대", ages: ["3", "4"] },
  { label: "30대", ages: ["5", "6"] },
  { label: "40대", ages: ["7", "8"] },
  { label: "50대+", ages: ["9", "10", "11"] },
];
