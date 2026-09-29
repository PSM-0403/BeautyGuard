"""
임계값 튜닝을 위해, 기존 리뷰 전체의 원본 감성 확률 점수(positive/negative)를
한 번 수집해서 로컬 JSON 파일로 저장하는 일회성 스크립트입니다.
(재사용 목적: 이 파일이 있으면 임계값을 여러 개 테스트할 때 매번 느린 Render
백엔드를 다시 호출할 필요 없이 로컬에서 바로 분석할 수 있습니다.)

사용 전 준비물 (프로젝트 루트 .env):
  SUPABASE_URL=https://xxxx.supabase.co
  SUPABASE_SERVICE_ROLE_KEY=eyJ...

사용 예:
  python scripts/collect_sentiment_scores.py
"""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path

import requests
from dotenv import load_dotenv

ROOT_DIR = Path(__file__).resolve().parent.parent
load_dotenv(ROOT_DIR / ".env")

PAGE_SIZE = 500
SENTIMENT_CHUNK_SIZE = 20
OUTPUT_PATH = ROOT_DIR / "scripts" / "sentiment_scores.json"


def get_supabase_config() -> tuple[str, str]:
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        raise SystemExit("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 환경변수가 필요합니다.")
    return url.rstrip("/"), key


def fetch_all_reviews(base_url: str, headers: dict[str, str]) -> list[dict]:
    rows: list[dict] = []
    start = 0
    while True:
        response = requests.get(
            f"{base_url}/rest/v1/product_reviews",
            headers=headers,
            params={
                "select": "id,review_rating,review_text",
                "review_rating": "not.is.null",
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


def fetch_scores(sentiment_api_url: str, texts: list[str]) -> list[dict[str, float]]:
    scores: list[dict[str, float]] = []
    endpoint = f"{sentiment_api_url.rstrip('/')}/sentiment"
    for start in range(0, len(texts), SENTIMENT_CHUNK_SIZE):
        chunk = texts[start:start + SENTIMENT_CHUNK_SIZE]
        response = requests.post(endpoint, json={"texts": chunk}, timeout=180)
        if response.status_code >= 300:
            raise RuntimeError(f"감성분석 실패 ({response.status_code}): {response.text[:500]}")
        payload = response.json()
        chunk_scores = payload.get("scores", [])
        if len(chunk_scores) != len(chunk):
            raise RuntimeError(f"응답 개수 불일치: 요청 {len(chunk)}건, 응답 {len(chunk_scores)}건")
        scores.extend(chunk_scores)
        print(f"[점수 수집] {min(start + SENTIMENT_CHUNK_SIZE, len(texts))}/{len(texts)}건 완료")
    return scores


def main() -> None:
    parser = argparse.ArgumentParser(description="리뷰 전체의 감성 확률 점수를 수집합니다.")
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

    rows = fetch_all_reviews(base_url, headers)
    print(f"대상 리뷰: {len(rows)}건")

    scores = fetch_scores(args.sentiment_api_url, [r["review_text"] for r in rows])

    combined = [
        {
            "id": row["id"],
            "review_rating": row["review_rating"],
            "positive_score": score["positive"],
            "negative_score": score["negative"],
        }
        for row, score in zip(rows, scores)
    ]

    with OUTPUT_PATH.open("w", encoding="utf-8") as f:
        json.dump(combined, f, ensure_ascii=False, indent=2)

    print(f"저장 완료: {OUTPUT_PATH} ({len(combined)}건)")


if __name__ == "__main__":
    main()
