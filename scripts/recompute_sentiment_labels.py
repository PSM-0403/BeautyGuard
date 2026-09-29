"""
scripts/sentiment_scores.json에 저장된 원본 확률 점수로 새 임계값(0.65/0.60)을
적용해 973건 전체의 sentiment 라벨을 재계산하고, Supabase product_reviews에
일괄 업데이트합니다. 백엔드를 다시 호출하지 않고 로컬 점수만 사용합니다.

기존 backfill_review_sentiment.py는 sentiment가 NULL인 행만 채우는 용도라
이미 값이 들어간 행은 건드리지 않는다 -- 이번에는 전체 재계산이 목적이므로
새 스크립트로 분리했다.

사용 전 준비물 (프로젝트 루트 .env):
  SUPABASE_URL=https://xxxx.supabase.co
  SUPABASE_SERVICE_ROLE_KEY=eyJ...

사용 예:
  python scripts/recompute_sentiment_labels.py
"""

from __future__ import annotations

import json
import os
from pathlib import Path

import requests
from dotenv import load_dotenv

ROOT_DIR = Path(__file__).resolve().parent.parent
load_dotenv(ROOT_DIR / ".env")

SCORES_PATH = ROOT_DIR / "scripts" / "sentiment_scores.json"
PAGE_SIZE = 500

POSITIVE_THRESHOLD = 0.65
NEGATIVE_THRESHOLD = 0.60


def predict_label(positive_score: float, negative_score: float) -> str:
    if positive_score >= POSITIVE_THRESHOLD:
        return "positive"
    if negative_score >= NEGATIVE_THRESHOLD:
        return "negative"
    return "neutral"


def get_supabase_config() -> tuple[str, str]:
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        raise SystemExit("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 환경변수가 필요합니다.")
    return url.rstrip("/"), key


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
    scored_rows = json.loads(SCORES_PATH.read_text(encoding="utf-8"))
    print(f"재계산 대상: {len(scored_rows)}건 (POSITIVE_THRESHOLD={POSITIVE_THRESHOLD}, NEGATIVE_THRESHOLD={NEGATIVE_THRESHOLD})")

    updates = [
        {"id": row["id"], "sentiment": predict_label(row["positive_score"], row["negative_score"])}
        for row in scored_rows
    ]

    label_counts: dict[str, int] = {}
    for row in updates:
        label_counts[row["sentiment"]] = label_counts.get(row["sentiment"], 0) + 1
    print(f"라벨 분포: {label_counts}")

    base_url, service_key = get_supabase_config()
    headers = {
        "apikey": service_key,
        "Authorization": f"Bearer {service_key}",
        "Content-Type": "application/json",
    }

    update_sentiments(base_url, headers, updates)
    print("재계산 및 업데이트 완료")


if __name__ == "__main__":
    main()
