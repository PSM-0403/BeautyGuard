import { MAIN_INGREDIENT_LIST } from "@/lib/main-ingredients";

export const REVIEW_INGREDIENT_OPTIONS = MAIN_INGREDIENT_LIST.map((item) => item.label) as unknown as readonly ["나이아신아마이드", "히알루론산", "레티놀", "병풀/시카", "PDRN"];

export function getReviewIngredientOptions(extraIngredients: readonly string[] = []) {
  const options = new Map<string, string>();

  REVIEW_INGREDIENT_OPTIONS.forEach((ingredient) => {
    options.set(normalizeReviewIngredientName(ingredient), ingredient);
  });

  extraIngredients.forEach((ingredient) => {
    const trimmed = ingredient.trim();
    const key = normalizeReviewIngredientName(trimmed);
    if (!key || options.has(key)) return;
    options.set(key, trimmed);
  });

  return Array.from(options.values());
}

export function isReviewIngredientOption(ingredient: string, options: readonly string[] = REVIEW_INGREDIENT_OPTIONS) {
  const target = normalizeReviewIngredientName(ingredient);
  return Boolean(target && options.some((option) => normalizeReviewIngredientName(option) === target));
}

function normalizeReviewIngredientName(value: string) {
  return value.toLocaleLowerCase("ko-KR").replace(/\s+/g, "").trim();
}

export const POSITIVE_REVIEW_KEYWORDS = [
  "톤이 맑아져요",
  "피부결",
  "촉촉",
  "자극 적어요",
  "흡수",
  "데일리 사용",
  "진정",
  "잡티",
  "미백",
  "광채",
  "산뜻",
  "보습",
  "매끈",
  "트러블 완화",
  "재구매",
];

export const NEGATIVE_REVIEW_KEYWORDS = [
  "효과 느림",
  "건조",
  "끈적임",
  "자극",
  "따가움",
  "트러블",
  "밀림",
  "무거움",
  "답답함",
  "향이 강함",
  "붉어짐",
  "가려움",
  "흡수 안됨",
  "가격 부담",
];
