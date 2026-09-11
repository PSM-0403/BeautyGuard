/**
 * 주요 성분 5개 선정 근거
 *
 * 단순 인기도나 DB 제품 수가 아닌, 카테고리별 대표성 + 분석 목적에 따라 선정했습니다.
 *
 * 성분             | 포지션                 | 선정 이유
 * ---------------- | ---------------------- | -------------------------------------------
 * 나이아신아마이드   | 범용 기능성 대표 성분   | 제품 수가 많아 가격 분포·리뷰 분석의 기준점.
 *                  |                        | "시장에 넓게 깔린 대표 성분군" 파악 목적
 * 히알루론산        | 보습 대표 성분          | 보습/수분 제품군 대표. 가격대·리뷰 키워드 안정적
 * 레티놀            | 안티에이징 대표 성분    | 저속노화/탄력/주름 카테고리 연결.
 *                  |                        | 자극·건조 부정 리뷰도 뚜렷해 분석 적합
 * 병풀/시카         | 진정·민감성 대표 성분   | K-뷰티 진정/장벽/민감성 제품군 대표.
 *                  |                        | 피부 타입별 반응을 보기 좋음
 * PDRN             | 신흥 기회 성분          | 최근 급상승 트렌드 성분.
 *                  |                        | 대시보드의 "기회 성분 발굴" 목적을 보여주기 좋음
 */

export type MainIngredient = {
  key: string;
  label: string;
  aliases: string[];
};

export const MAIN_INGREDIENT_LIST: MainIngredient[] = [
  {
    key: "niacinamide",
    label: "나이아신아마이드",
    aliases: ["나이아신아마이드", "나이아신 아마이드", "니아신아마이드", "나이아신", "niacinamide"],
  },
  {
    key: "hyaluronic_acid",
    label: "히알루론산",
    aliases: ["히알루론산", "히알루론", "히알루로닉", "hyaluronic"],
  },
  {
    key: "retinol",
    label: "레티놀",
    aliases: ["레티놀", "레티날", "retinol", "retinal"],
  },
  {
    key: "centella",
    label: "병풀/시카",
    aliases: ["병풀", "시카", "센텔라", "마데카소사이드", "cica", "centella"],
  },
  {
    key: "pdrn",
    label: "PDRN",
    aliases: ["PDRN", "pdrn", "피디알엔", "피디알앤"],
  },
];
