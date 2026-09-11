"""
크롤러가 만든 상품 CSV 여러 개를 합쳐서, 5개 핵심 성분(main-ingredients.ts 기준)에
매칭되는 상품만 골라 리뷰 수집용 CSV로 저장합니다.

사용 예:
  python scripts/filter_target_products.py \
    --input "올리브영 크롤러/[Module]oliveyoung_crawler/Data/2026-09-11_essence/oliveyoung_판매순(info)_260911.csv" \
    --input "올리브영 크롤러/[Module]oliveyoung_crawler/Data/2026-09-11_essence/oliveyoung_신상품순(info)_260911.csv" \
    --input "올리브영 크롤러/[Module]oliveyoung_crawler/Data/2026-09-11_cream/oliveyoung_판매순(info)_260911.csv" \
    --input "올리브영 크롤러/[Module]oliveyoング/Data/..." \
    --output "올리브영 크롤러/[Module]oliveyoung_crawler/Data/2026-09-11_targets.csv"
"""

from __future__ import annotations

import argparse
import csv
import re
from pathlib import Path

GOODS_NO_RE = re.compile(r"goodsNo=([A-Za-z0-9]+)")

# src/lib/main-ingredients.ts 와 동일한 별칭 목록
# (레틴알은 레티날의 다른 표기라 추가로 포함)
INGREDIENT_ALIASES: dict[str, list[str]] = {
    "niacinamide": ["나이아신아마이드", "나이아신 아마이드", "니아신아마이드", "나이아신", "niacinamide"],
    "hyaluronic_acid": ["히알루론산", "히알루론", "히알루로닉", "hyaluronic"],
    "retinol": ["레티놀", "레티날", "레틴알", "retinol", "retinal"],
    "centella": ["병풀", "시카", "센텔라", "마데카소사이드", "cica", "centella"],
    "pdrn": ["PDRN", "pdrn", "피디알엔", "피디알앤"],
}


def goods_no_from_url(url: str | None) -> str | None:
    if not url:
        return None
    match = GOODS_NO_RE.search(url)
    return match.group(1) if match else None


def matched_ingredient_keys(main_ingredients: str) -> list[str]:
    text = main_ingredients or ""
    matched = []
    for key, aliases in INGREDIENT_ALIASES.items():
        if any(alias.lower() in text.lower() for alias in aliases):
            matched.append(key)
    return matched


def read_csv(path: Path) -> list[dict[str, str]]:
    with path.open("r", encoding="utf-8-sig", newline="") as file:
        return list(csv.DictReader(file))


def main() -> None:
    parser = argparse.ArgumentParser(description="크롤링 CSV에서 5개 핵심 성분 매칭 상품만 필터링합니다.")
    parser.add_argument("--input", type=Path, action="append", required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()

    by_goods_no: dict[str, dict[str, str]] = {}
    matched_counts: dict[str, int] = {key: 0 for key in INGREDIENT_ALIASES}

    for path in args.input:
        for row in read_csv(path):
            goods_no = goods_no_from_url(row.get("url"))
            if not goods_no:
                continue

            matches = matched_ingredient_keys(row.get("main_ingredients", ""))
            if not matches:
                continue

            if goods_no not in by_goods_no:
                for key in matches:
                    matched_counts[key] += 1
                by_goods_no[goods_no] = row

    fieldnames = list(next(iter(by_goods_no.values())).keys()) if by_goods_no else []
    args.output.parent.mkdir(parents=True, exist_ok=True)

    with args.output.open("w", encoding="utf-8-sig", newline="") as file:
        writer = csv.DictWriter(file, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(by_goods_no.values())

    print(f"[필터링 완료] 고유 매칭 상품 {len(by_goods_no)}건 -> {args.output}")
    for key, count in matched_counts.items():
        print(f"  - {key}: {count}건")


if __name__ == "__main__":
    main()
