"""
일별 크롤링 CSV로 "과반 기준" 주성분을 계산해 product_main_ingredients_majority에 적재합니다.
원본 테이블(product_main_ingredients)은 읽기만 하고 수정하지 않습니다.

배경: 주성분(main_ingredients)은 상세페이지 이미지를 GPT OCR로 읽어 매일 새로 추출하는데,
같은 상품이라도 날마다 결과가 달랐습니다(2일 이상 수집된 87개 상품 중 82개). 그런데
import_csv_to_supabase.py는 (goods_no, ingredient_name) 기준으로 upsert만 하고 지우지 않아서,
원본 테이블에는 5일 중 하루라도 추출된 성분이 모두 누적돼 공급 상품 수가 부풀려집니다.

규칙:
  1) 성분명의 괄호 안 표기를 떼어 같은 성분으로 묶습니다.
     예: "비타민C(3-O-에틸아스코빅애씨드)" → "비타민C"
  2) 상품별로, 수집된 날짜 중 과반(> 50%)의 날짜에 추출된 성분만 남깁니다.

사용법:
  python scripts/build_main_ingredients_majority.py          # 미리보기 (DB 변경 없음)
  python scripts/build_main_ingredients_majority.py --apply  # 정제본 테이블에 적재 (추가만, 삭제 없음)
"""

from __future__ import annotations

import argparse
import csv
import glob
import json
import os
import re
from collections import defaultdict
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "올리브영 크롤러" / "[Module]oliveyoung_crawler" / "Data"
DAILY_CSV_GLOB = "2026-09-1*_*/*(info)_*.csv"
SOURCE_TABLE = "product_main_ingredients"
TARGET_TABLE = "product_main_ingredients_majority"
REPORT_INGREDIENTS = ["비타민C", "콜라겐", "나이아신아마이드", "판테놀", "히알루론산", "세라마이드", "레티놀", "PDRN"]


def load_env() -> tuple[str, str]:
    env_path = ROOT / ".env"
    if env_path.exists():
        for line in env_path.read_text(encoding="utf-8").splitlines():
            match = re.match(r"\s*([A-Z_]+)\s*=\s*(.*)", line)
            if match and match.group(1) not in os.environ:
                os.environ[match.group(1)] = match.group(2).strip().strip("\"'")
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        raise SystemExit("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 환경변수가 필요합니다.")
    return url.rstrip("/"), key


def goods_no_from_url(url: str) -> str | None:
    match = re.search(r"goodsNo=([A-Z0-9]+)", url or "")
    return match.group(1) if match else None


def normalize_ingredient(name: str) -> str:
    return re.sub(r"\(.*?\)", "", name).strip()


def build_majority_pairs() -> list[tuple[str, str]]:
    # goods_no -> 수집일 집합, (goods_no, 성분) -> 그 성분이 추출된 수집일 집합
    days_by_goods: dict[str, set[str]] = defaultdict(set)
    days_by_pair: dict[tuple[str, str], set[str]] = defaultdict(set)

    # 폴더명 "[Module]"의 대괄호가 glob 패턴으로 해석되지 않도록 경로 부분만 이스케이프한다.
    files = sorted(glob.glob(os.path.join(glob.escape(str(DATA_DIR)), DAILY_CSV_GLOB)))
    if not files:
        raise SystemExit(f"일별 CSV를 찾지 못했습니다: {DATA_DIR / DAILY_CSV_GLOB}")

    for path in files:
        with open(path, encoding="utf-8-sig", newline="") as file:
            for row in csv.DictReader(file):
                goods_no = goods_no_from_url(row.get("url", ""))
                date = (row.get("date") or "").strip()
                if not goods_no or not date:
                    continue
                days_by_goods[goods_no].add(date)
                for raw in (row.get("main_ingredients") or "").split(","):
                    name = normalize_ingredient(raw)
                    if name:
                        days_by_pair[(goods_no, name)].add(date)

    print(f"일별 CSV {len(files)}개, 상품 {len(days_by_goods)}개 처리")
    return sorted(
        (goods_no, name)
        for (goods_no, name), days in days_by_pair.items()
        if len(days) > len(days_by_goods[goods_no]) / 2
    )


def fetch_pairs(url: str, headers: dict[str, str], table: str) -> list[tuple[str, str]]:
    pairs: list[tuple[str, str]] = []
    start = 0
    while True:
        response = requests.get(
            f"{url}/rest/v1/{table}",
            params={"select": "goods_no,ingredient_name", "order": "id"},
            headers={**headers, "Range": f"{start}-{start + 999}"},
            timeout=60,
        )
        response.raise_for_status()
        page = response.json()
        pairs.extend((row["goods_no"], row["ingredient_name"]) for row in page)
        if len(page) < 1000:
            return pairs
        start += 1000


def count_products(pairs: list[tuple[str, str]], keyword: str) -> int:
    keyword = keyword.lower()
    return len({goods_no for goods_no, name in pairs if keyword in name.lower()})


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true", help="정제본 테이블에 적재합니다 (추가만, 삭제 없음).")
    args = parser.parse_args()

    url, key = load_env()
    headers = {"apikey": key, "Authorization": f"Bearer {key}", "Content-Type": "application/json"}

    majority_pairs = build_majority_pairs()
    source_pairs = fetch_pairs(url, headers, SOURCE_TABLE)

    print(f"\n성분 행 수: 원본 {len(source_pairs)}개 / 과반 기준 {len(majority_pairs)}개")
    print(f"{'성분':<12}{'원본 상품 수':>10}{'과반 기준':>10}")
    for ingredient in REPORT_INGREDIENTS:
        print(f"{ingredient:<12}{count_products(source_pairs, ingredient):>10}{count_products(majority_pairs, ingredient):>10}")

    if not args.apply:
        print("\n미리보기만 실행했습니다. 정제본 테이블에 적재하려면 --apply를 붙여 다시 실행하세요.")
        return

    existing = set(fetch_pairs(url, headers, TARGET_TABLE))
    payload = [
        {"goods_no": goods_no, "ingredient_name": name}
        for goods_no, name in majority_pairs
        if (goods_no, name) not in existing
    ]
    for start in range(0, len(payload), 500):
        response = requests.post(
            f"{url}/rest/v1/{TARGET_TABLE}",
            data=json.dumps(payload[start:start + 500], ensure_ascii=False).encode("utf-8"),
            headers=headers,
            timeout=60,
        )
        response.raise_for_status()

    print(f"\n{TARGET_TABLE} 적재 완료: 새로 추가 {len(payload)}개 (이미 있던 {len(existing)}개는 유지)")


if __name__ == "__main__":
    main()
