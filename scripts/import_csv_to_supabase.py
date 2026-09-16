"""
올리브영 크롤러가 만든 상품/리뷰 CSV를 Supabase 테이블에 적재합니다.

사용 전 준비물 (프로젝트 루트 .env):
  SUPABASE_URL=https://xxxx.supabase.co
  SUPABASE_SERVICE_ROLE_KEY=eyJ...   (Project Settings > API > service_role, RLS를 우회하므로 절대 프론트엔드/깃에 노출 금지)

사용 예:
  python scripts/import_csv_to_supabase.py \
    --product-csv "올리브영 크롤러/[Module]oliveyoung_crawler/Data/oliveyoung_판매순(info)_260910.csv" \
    --review-csv "올리브영 크롤러/[Module]oliveyoung_crawler/Data/oliveyoung_판매순(review)_260910.csv"

여러 정렬(best/new 등) CSV를 한 번에 넣고 싶으면 --product-csv / --review-csv를 여러 번 반복하면 됩니다.
"""

from __future__ import annotations

import argparse
import csv
import os
import re
from pathlib import Path

import requests
from dotenv import load_dotenv

ROOT_DIR = Path(__file__).resolve().parents[1]
load_dotenv(ROOT_DIR / ".env")

GOODS_NO_RE = re.compile(r"goodsNo=([A-Za-z0-9]+)")
CHUNK_SIZE = 500
SENTIMENT_CHUNK_SIZE = 50


def fetch_sentiments(sentiment_api_url: str, texts: list[str]) -> list[str]:
    """
    리뷰 본문을 배포된 FastAPI 백엔드의 /sentiment로 보내 감성 라벨을 받아온다.
    리뷰 텍스트는 적재 후 바뀌지 않으므로, 조회할 때마다 다시 계산하지 않고
    적재 시점에 한 번만 계산해서 DB에 저장해둔다.
    """
    labels: list[str] = []
    endpoint = f"{sentiment_api_url.rstrip('/')}/sentiment"

    for start in range(0, len(texts), SENTIMENT_CHUNK_SIZE):
        chunk = texts[start:start + SENTIMENT_CHUNK_SIZE]
        response = requests.post(endpoint, json={"texts": chunk}, timeout=120)
        if response.status_code >= 300:
            raise RuntimeError(f"감성분석 실패 ({response.status_code}): {response.text[:500]}")
        chunk_labels = response.json().get("labels", [])
        if len(chunk_labels) != len(chunk):
            raise RuntimeError(f"감성분석 응답 개수 불일치: 요청 {len(chunk)}건, 응답 {len(chunk_labels)}건")
        labels.extend(chunk_labels)
        print(f"[감성분석] {min(start + SENTIMENT_CHUNK_SIZE, len(texts))}/{len(texts)}건 완료")

    return labels


def get_supabase_config() -> tuple[str, str]:
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")

    if not url or not key:
        raise SystemExit(
            "SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 환경변수가 필요합니다. "
            "프로젝트 루트 .env에 추가해주세요."
        )

    return url.rstrip("/"), key


def goods_no_from_url(url: str | None) -> str | None:
    if not url:
        return None
    match = GOODS_NO_RE.search(url)
    return match.group(1) if match else None


def to_number(value) -> float | None:
    if value is None:
        return None
    text = str(value).replace(",", "").replace("%", "").strip()
    if not text:
        return None
    try:
        return float(text)
    except ValueError:
        return None


def to_int(value) -> int | None:
    number = to_number(value)
    return int(number) if number is not None else None


def read_csv(path: Path) -> list[dict[str, str]]:
    with path.open("r", encoding="utf-8-sig", newline="") as file:
        return list(csv.DictReader(file))


def upsert(base_url: str, headers: dict[str, str], table: str, rows: list[dict], on_conflict: str) -> None:
    if not rows:
        return

    endpoint = f"{base_url}/rest/v1/{table}"
    request_headers = {**headers, "Prefer": "resolution=merge-duplicates,return=minimal"}

    for start in range(0, len(rows), CHUNK_SIZE):
        chunk = rows[start:start + CHUNK_SIZE]
        response = requests.post(
            endpoint,
            headers=request_headers,
            params={"on_conflict": on_conflict},
            json=chunk,
            timeout=30,
        )
        if response.status_code >= 300:
            raise RuntimeError(f"{table} 적재 실패 ({response.status_code}): {response.text[:500]}")

    print(f"[{table}] {len(rows)}건 적재 완료")


def insert(base_url: str, headers: dict[str, str], table: str, rows: list[dict]) -> None:
    if not rows:
        return

    endpoint = f"{base_url}/rest/v1/{table}"
    request_headers = {**headers, "Prefer": "return=minimal"}

    for start in range(0, len(rows), CHUNK_SIZE):
        chunk = rows[start:start + CHUNK_SIZE]
        response = requests.post(endpoint, headers=request_headers, json=chunk, timeout=30)
        if response.status_code >= 300:
            raise RuntimeError(f"{table} 적재 실패 ({response.status_code}): {response.text[:500]}")

    print(f"[{table}] {len(rows)}건 적재 완료")


def fetch_existing_review_keys(
    base_url: str,
    headers: dict[str, str],
    goods_nos: list[str],
) -> set[tuple[str, str]]:
    """
    이미 Supabase에 저장된 (goods_no, review_text) 조합을 조회합니다.

    같은 상품 리뷰를 판매순/신상품순 CSV에서 중복 수집했거나,
    여러 날에 걸쳐 같은 상품을 다시 크롤링해서 리뷰가 겹치는 경우
    똑같은 리뷰가 여러 번 저장되는 걸 막기 위해 사용합니다.
    """
    existing: set[tuple[str, str]] = set()
    endpoint = f"{base_url}/rest/v1/product_reviews"
    get_headers = {"apikey": headers["apikey"], "Authorization": headers["Authorization"]}

    for goods_no_chunk in chunk_list(sorted(set(goods_nos)), 50):
        if not goods_no_chunk:
            continue
        in_value = "(" + ",".join(goods_no_chunk) + ")"
        response = requests.get(
            endpoint,
            headers=get_headers,
            params={"select": "goods_no,review_text", "goods_no": f"in.{in_value}"},
            timeout=30,
        )
        if response.status_code >= 300:
            raise RuntimeError(f"product_reviews 중복 확인 실패 ({response.status_code}): {response.text[:500]}")

        for row in response.json():
            review_text = (row.get("review_text") or "").strip()
            if review_text:
                existing.add((row.get("goods_no"), review_text))

    return existing


def chunk_list(items: list, size: int) -> list[list]:
    return [items[start:start + size] for start in range(0, len(items), size)]


def import_products(base_url: str, headers: dict[str, str], product_rows: list[dict[str, str]]) -> None:
    products: dict[str, dict] = {}
    ingredients: dict[tuple[str, str], dict] = {}
    snapshots: dict[tuple[str, str], dict] = {}
    rankings: dict[tuple[str, str, str], dict] = {}

    for row in product_rows:
        goods_no = goods_no_from_url(row.get("url"))
        if not goods_no:
            continue

        product_name = (row.get("product_name") or "").strip()
        products[goods_no] = {
            "goods_no": goods_no,
            "brand": (row.get("brand") or "").strip() or None,
            "product_name": product_name or None,
            "product_name_clean": product_name or None,
            "product_name_raw": product_name or None,
            "volume_ml": to_number(row.get("volume_ml")),
        }

        collected_date = row.get("date")

        for ingredient_name in (row.get("main_ingredients") or "").split(","):
            ingredient_name = ingredient_name.strip()
            if not ingredient_name:
                continue
            ingredients[(goods_no, ingredient_name)] = {
                "goods_no": goods_no,
                "ingredient_name": ingredient_name,
            }

        snapshots[(goods_no, collected_date)] = {
            "goods_no": goods_no,
            "collected_date": collected_date,
            "regular_price": to_number(row.get("regular_price")),
            "sales_price": to_number(row.get("sales_price")),
            "discount": (row.get("discount") or "").strip() or None,
            "review_count": to_number(row.get("review_count")),
        }

        sort_type = row.get("sort_type")
        rankings[(goods_no, collected_date, sort_type)] = {
            "goods_no": goods_no,
            "rank": to_int(row.get("rank")),
            "collected_date": collected_date,
            "sort_type": sort_type or None,
        }

    upsert(base_url, headers, "products", list(products.values()), "goods_no")
    upsert(base_url, headers, "product_main_ingredients", list(ingredients.values()), "goods_no,ingredient_name")
    upsert(base_url, headers, "product_snapshots", list(snapshots.values()), "goods_no,collected_date")
    upsert(base_url, headers, "product_rankings", list(rankings.values()), "goods_no,collected_date,sort_type")


def import_reviews(
    base_url: str,
    headers: dict[str, str],
    review_rows: list[dict[str, str]],
    product_by_url: dict[str, dict[str, str]],
    sentiment_api_url: str,
) -> None:
    reviews = []
    seen_in_batch: set[tuple[str, str]] = set()

    for row in review_rows:
        url = row.get("url")
        goods_no = goods_no_from_url(url)
        if not goods_no:
            continue

        review_text = (row.get("review_text") or "").strip() or None
        if review_text:
            key = (goods_no, review_text)
            if key in seen_in_batch:
                continue
            seen_in_batch.add(key)

        product_row = product_by_url.get(url, {})
        reviews.append({
            "goods_no": goods_no,
            "collected_date": product_row.get("date"),
            "platform": "oliveyoung",
            "sort_type": product_row.get("sort_type") or None,
            "rank": to_int(product_row.get("rank")),
            "main_ingredients": (product_row.get("main_ingredients") or "").strip() or None,
            "review_rating": to_number(row.get("review_rating")),
            "skin_type": (row.get("skin_type") or "").strip() or None,
            "review_text": review_text,
        })

    if not reviews:
        print("[product_reviews] 새로 추가할 리뷰가 없습니다.")
        return

    existing_keys = fetch_existing_review_keys(base_url, headers, [r["goods_no"] for r in reviews])
    new_reviews = [
        r for r in reviews
        if not r["review_text"] or (r["goods_no"], r["review_text"]) not in existing_keys
    ]
    skipped = len(reviews) - len(new_reviews)

    if skipped:
        print(f"[product_reviews] 이미 저장된 리뷰 {skipped}건 건너뜀 (중복 방지)")

    reviews_with_text = [r for r in new_reviews if r["review_text"]]
    if reviews_with_text:
        labels = fetch_sentiments(sentiment_api_url, [r["review_text"] for r in reviews_with_text])
        for review, label in zip(reviews_with_text, labels):
            review["sentiment"] = label

    insert(base_url, headers, "product_reviews", new_reviews)


def main() -> None:
    parser = argparse.ArgumentParser(description="올리브영 크롤러 CSV를 Supabase에 적재합니다.")
    parser.add_argument("--product-csv", type=Path, action="append", default=[])
    parser.add_argument("--review-csv", type=Path, action="append", default=[])
    parser.add_argument(
        "--sentiment-api-url",
        default=os.environ.get("SENTIMENT_API_URL", "https://beautyguard-api.onrender.com"),
        help="리뷰 감성분석을 요청할 FastAPI 백엔드 주소 (기본값: 배포된 Render 백엔드)",
    )
    args = parser.parse_args()

    if not args.product_csv and not args.review_csv:
        raise SystemExit("--product-csv 또는 --review-csv 중 최소 하나는 지정해야 합니다.")

    base_url, service_key = get_supabase_config()
    headers = {
        "apikey": service_key,
        "Authorization": f"Bearer {service_key}",
        "Content-Type": "application/json",
    }

    product_rows: list[dict[str, str]] = []
    for path in args.product_csv:
        product_rows.extend(read_csv(path))

    if product_rows:
        import_products(base_url, headers, product_rows)

    product_by_url = {row["url"]: row for row in product_rows if row.get("url")}

    all_review_rows: list[dict[str, str]] = []
    for path in args.review_csv:
        all_review_rows.extend(read_csv(path))

    if all_review_rows:
        import_reviews(base_url, headers, all_review_rows, product_by_url, args.sentiment_api_url)

    print("적재 완료")


if __name__ == "__main__":
    main()
