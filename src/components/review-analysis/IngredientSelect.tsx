import { REVIEW_INGREDIENT_OPTIONS } from "@/lib/reviewConstants";

export function IngredientSelect({
  value,
  onChange,
  options = REVIEW_INGREDIENT_OPTIONS,
}: {
  value: string;
  onChange: (value: string) => void;
  options?: readonly string[];
}) {
  return (
    <select
      className="review-ingredient-select"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      aria-label="리뷰 분석 성분 선택"
    >
      {options.map((ingredient) => (
        <option value={ingredient} key={ingredient}>
          {ingredient}
        </option>
      ))}
    </select>
  );
}
