"""
이미 적재된 product_reviews 중 sentiment가 비어있는 리뷰에 대해
감성분석을 한 번 돌려서 채워 넣는 일회성 백필 스크립트입니다.

사용 전 준비물 (프로젝트 루트 .env):
  SUPABASE_URL=https://xxxx.supabase.co
  SUPABASE_SERVICE_ROLE_KEY=eyJ...

사용 예:
  python scripts/backfill_review_sentiment.py
"""

from __future__ import annotations

import argparse
import os
from pathlib import Path

import requests
from dotenv import load_dotenv

ROOT_DIR = Path(__file__).resolve().parent.parent
load_dotenv(ROOT_DIR / ".env")

PAGE_SIZE = 500
SENTIMENT_CHUNK_SIZE = 20


def get_supabase_config() -> tuple[str, str]:
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        raise SystemExit("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 환경변수가 필요합니다.")
    return url.rstrip("/"), key


def fetch_missing_sentiment_rows(base_url: str, headers: dict[str, str]) -> list[dict]:
    rows: list[dict] = []
    start = 0
    while True:
        response = requests.get(
            f"{base_url}/rest/v1/product_reviews",
            headers=headers,
            params={
                "select": "id,review_text",
                "sentiment": "is.null",
                "review_text": "not.is.null",
                "order": "id",
                "offset": start,
                "limit": PAGE_SIZE,
            },
            timeout=30,
        )
        if response.status_code >= 300:
            raise RuntimeError(f"조회 실패 ({response.status_code}): {response.text[:500]}")
        page = response.json()
        rows.extend(page)
        if len(page) < PAGE_SIZE:
            break
        start += PAGE_SIZE
    return rows


def fetch_sentiments(sentiment_api_url: str, texts: list[str]) -> list[str]:
    labels: list[str] = []
    endpoint = f"{sentiment_api_url.rstrip('/')}/sentiment"
    for start in range(0, len(texts), SENTIMENT_CHUNK_SIZE):
        chunk = texts[start:start + SENTIMENT_CHUNK_SIZE]
        response = requests.post(endpoint, json={"texts": chunk}, timeout=180)
        if response.status_code >= 300:
            raise RuntimeError(f"감성분석 실패 ({response.status_code}): {response.text[:500]}")
        chunk_labels = response.json().get("labels", [])
        if len(chunk_labels) != len(chunk):
            raise RuntimeError(f"감성분석 응답 개수 불일치: 요청 {len(chunk)}건, 응답 {len(chunk_labels)}건")
        labels.extend(chunk_labels)
        print(f"[감성분석] {min(start + SENTIMENT_CHUNK_SIZE, len(texts))}/{len(texts)}건 완료")
    return labels


def update_sentiments(base_url: str, headers: dict[str, str], rows: list[dict]) -> None:
    update_headers = {**headers, "Prefer": "resolution=merge-duplicates,return=minimal"}
    for start in range(0, len(rows), PAGE_SIZE):
        chunk = rows[start:start + PAGE_SIZE]
        response = requests.post(
            f"{base_url}/rest/v1/product_reviews",
            headers=update_headers,
            params={"on_conflict": "id"},
            json=chunk,
            timeout=30,
        )
        if response.status_code >= 300:
            raise RuntimeError(f"업데이트 실패 ({response.status_code}): {response.text[:500]}")
        print(f"[저장] {min(start + PAGE_SIZE, len(rows))}/{len(rows)}건 완료")


def main() -> None:
    parser = argparse.ArgumentParser(description="기존 리뷰에 감성분석 결과를 백필합니다.")
    parser.add_argument(
        "--sentiment-api-url",
        default=os.environ.get("SENTIMENT_API_URL", "https://beautyguard-api.onrender.com"),
    )
    args = parser.parse_args()

    base_url, service_key = get_supabase_config()
    headers = {
        "apikey": service_key,
        "Authorization": f"Bearer {service_key}",
        "Content-Type": "application/json",
    }

    rows = fetch_missing_sentiment_rows(base_url, headers)
    print(f"감성분석 대상: {len(rows)}건")
    if not rows:
        print("백필할 리뷰가 없습니다.")
        return

    labels = fetch_sentiments(args.sentiment_api_url, [r["review_text"] for r in rows])
    updates = [{"id": row["id"], "sentiment": label} for row, label in zip(rows, labels)]

    update_sentiments(base_url, headers, updates)
    print("백필 완료")


if __name__ == "__main__":
    main()
