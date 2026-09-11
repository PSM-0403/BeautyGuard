from __future__ import annotations

import os
import time
import threading
from datetime import date, timedelta
from pathlib import Path
from typing import Any

import requests
import uvicorn
import pandas as pd
from dotenv import load_dotenv
from fastapi import Body, FastAPI
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles


BASE_DIR = Path(__file__).resolve().parent
load_dotenv(BASE_DIR / ".env")
NAVER_DATALAB_URL = "https://openapi.naver.com/v1/datalab/search"
SNAPSHOT_START_DATE = os.getenv("DASHBOARD_START_DATE")
SNAPSHOT_END_DATE = os.getenv("DASHBOARD_END_DATE")
SNAPSHOT_DAY_COUNT = int(os.getenv("DASHBOARD_SNAPSHOT_DAYS", "7"))
NAVER_DATALAB_MAX_RETRIES = int(os.getenv("NAVER_DATALAB_MAX_RETRIES", "3"))
NAVER_DATALAB_BACKOFF_SECONDS = float(os.getenv("NAVER_DATALAB_BACKOFF_SECONDS", "0.8"))
NAVER_DATALAB_REQUEST_GAP_SECONDS = float(os.getenv("NAVER_DATALAB_REQUEST_GAP_SECONDS", "1.5"))
NAVER_DATALAB_KEYWORDS_PER_GROUP = int(os.getenv("NAVER_DATALAB_KEYWORDS_PER_GROUP", "8"))
DATALAB_CACHE_TTL_SECONDS = int(os.getenv("DATALAB_CACHE_TTL_SECONDS", "600"))
_LAST_DATALAB_REQUEST_AT = 0.0
_DATALAB_LOCK = threading.Lock()
_DASHBOARD_SIGNALS_CACHE: dict[str, Any] = {"created_at": 0.0, "data": None}
_INGREDIENT_TREND_CACHE: dict[str, dict[str, Any]] = {}

app = FastAPI(title="BeautyMD Insight API")
app.mount("/assets", StaticFiles(directory=BASE_DIR / "assets"), name="assets")

ANCHOR_GROUP = {
    "key": "__anchor__",
    "label": "__anchor__",
    "keywords": ["세럼 추천", "앰플 추천", "에센스 추천"],
}

FUNCTION_SIGNAL_GROUPS = [
    {"key": "cooling_calming", "label": "쿨링진정", "keywords": ["쿨링 세럼", "쿨링 앰플", "쿨링 진정", "열감 진정", "피부 열감", "붉은기 진정", "진정 세럼", "진정 앰플", "시카 진정", "병풀 진정", "어성초 진정", "알로에 진정"]},
    {"key": "moisture_hydration", "label": "수분보습", "keywords": ["수분 세럼", "수분 앰플", "보습 세럼", "보습 앰플", "속건조 세럼", "속건조 앰플", "히알루론산 세럼", "히알루론산 앰플", "수분 충전", "보습 충전", "스쿠알란 보습", "판테놀 보습"]},
    {"key": "anti_aging", "label": "안티에이징", "keywords": ["안티에이징 세럼", "안티에이징 앰플", "노화 케어", "에이징 케어", "레티놀 안티에이징", "PDRN 안티에이징", "펩타이드 안티에이징", "콜라겐 세럼", "리프팅 세럼", "리프팅 앰플", "탄력 리프팅 세럼"]},
    {"key": "brightening", "label": "브라이트닝", "keywords": ["브라이트닝 세럼", "브라이트닝 앰플", "광채 세럼", "광채 앰플", "톤 개선 세럼", "톤업 앰플", "피부톤 개선", "나이아신아마이드 톤", "비타민C 세럼", "글루타티온 세럼"]},
    {"key": "spot_pigmentation", "label": "기미잡티", "keywords": ["잡티 세럼", "잡티 앰플", "기미 세럼", "기미 앰플", "색소침착 세럼", "색소침착 앰플", "다크스팟 세럼", "비타민C 잡티", "나이아신아마이드 잡티", "글루타티온 잡티", "트라넥사믹애씨드 세럼", "미백 세럼", "미백 앰플"]},
    {"key": "wrinkle_elasticity", "label": "주름탄력", "keywords": ["주름 개선 세럼", "주름 개선 앰플", "탄력 세럼", "탄력 앰플", "탄력 개선", "주름 탄력", "레티놀 탄력", "레티놀 주름", "PDRN 탄력", "펩타이드 탄력", "아데노신 주름", "콜라겐 탄력"]},
    {"key": "pore", "label": "모공", "keywords": ["모공 세럼", "모공 앰플", "모공 관리 세럼", "모공 케어", "모공 개선", "모공 축소", "모공 탄력", "나이아신아마이드 모공", "레티놀 모공", "피지 모공", "늘어진 모공"]},
    {"key": "exfoliation_texture", "label": "각질결", "keywords": ["각질 세럼", "각질 앰플", "각질 케어", "피부결 세럼", "피부결 앰플", "결 개선 세럼", "피부결 개선", "AHA 세럼", "BHA 세럼", "PHA 세럼", "살리실산 세럼", "피부결 각질"]},
    {"key": "trouble_calming", "label": "트러블진정", "keywords": ["트러블 세럼", "트러블 앰플", "트러블 진정", "여드름 세럼", "여드름 앰플", "여드름 진정", "티트리 세럼", "티트리 앰플", "어성초 세럼", "시카 트러블", "병풀 트러블", "살리실산 트러블"]},
    {"key": "barrier", "label": "장벽", "keywords": ["피부장벽 세럼", "피부장벽 앰플", "장벽 강화 세럼", "장벽 강화 앰플", "장벽 케어", "장벽 회복", "세라마이드 세럼", "세라마이드 앰플", "판테놀 장벽", "엑토인 세럼", "스쿠알란 세럼", "마데카소사이드 장벽"]},
    {"key": "sebum_oil", "label": "피지유분", "keywords": ["피지 세럼", "피지 앰플", "피지 조절 세럼", "유분 조절 세럼", "피지 케어", "유분 케어", "번들거림 세럼", "개기름 세럼", "BHA 세럼", "살리실산 세럼", "모공 피지 세럼", "티트리 피지"]},
]


INGREDIENT_SIGNAL_GROUPS = [
    {"key": "retinol", "label": "레티놀", "stems": ["레티놀", "Retinol"], "funcs": ["탄력", "주름", "피부결", "안티에이징"]},
    {"key": "retinal", "label": "레티날", "stems": ["레티날", "Retinal"], "funcs": ["탄력", "주름", "안티에이징"]},
    {"key": "pdrn", "label": "PDRN", "stems": ["PDRN", "피디알엔"], "funcs": ["탄력", "재생", "회복", "광채"]},
    {"key": "niacinamide", "label": "나이아신아마이드", "stems": ["나이아신아마이드", "Niacinamide"], "funcs": ["미백", "톤", "잡티", "피부결"]},
    {"key": "hyaluronic_acid", "label": "히알루론산", "stems": ["히알루론산", "히알루로닉", "Hyaluronic Acid"], "funcs": ["수분", "보습", "속건조"]},
    {"key": "centella", "label": "병풀/시카", "stems": ["병풀", "시카", "Cica", "Centella"], "funcs": ["진정", "붉은기", "트러블", "장벽"]},
    {"key": "ceramide", "label": "세라마이드", "stems": ["세라마이드", "Ceramide"], "funcs": ["장벽", "보습", "속건조"]},
    {"key": "panthenol", "label": "판테놀", "stems": ["판테놀", "Panthenol"], "funcs": ["장벽", "보습", "진정"]},
    {"key": "adenosine", "label": "아데노신", "stems": ["아데노신", "Adenosine"], "funcs": ["주름", "탄력", "안티에이징"]},
    {"key": "peptide", "label": "펩타이드", "stems": ["펩타이드", "Peptide"], "funcs": ["탄력", "리프팅", "주름"]},
    {"key": "vitamin_c", "label": "비타민C", "stems": ["비타민C", "비타C", "Vitamin C"], "funcs": ["잡티", "미백", "광채", "톤"]},
    {"key": "glutathione", "label": "글루타티온", "stems": ["글루타티온", "Glutathione"], "funcs": ["미백", "광채", "톤"]},
    {"key": "tranexamic_acid", "label": "트라넥사믹애씨드", "stems": ["트라넥사믹애씨드", "트라넥삼산", "Tranexamic Acid"], "funcs": ["잡티", "기미", "미백"]},
    {"key": "bakuchiol", "label": "바쿠치올", "stems": ["바쿠치올", "Bakuchiol"], "funcs": ["탄력", "주름", "저자극"]},
    {"key": "madecassoside", "label": "마데카소사이드", "stems": ["마데카소사이드", "Madecassoside"], "funcs": ["진정", "장벽", "재생"]},
    {"key": "heartleaf", "label": "어성초", "stems": ["어성초", "Heartleaf"], "funcs": ["진정", "트러블", "피지"]},
    {"key": "tea_tree", "label": "티트리", "stems": ["티트리", "Tea Tree"], "funcs": ["트러블", "피지", "진정"]},
    {"key": "bha", "label": "살리실산/BHA", "stems": ["살리실산", "BHA"], "funcs": ["각질", "피지", "모공", "트러블"]},
    {"key": "aha", "label": "AHA", "stems": ["AHA", "아하"], "funcs": ["각질", "피부결", "모공"]},
    {"key": "pha", "label": "PHA", "stems": ["PHA", "파하"], "funcs": ["각질", "피부결", "저자극"]},
    {"key": "azelaic_acid", "label": "아젤라익애씨드", "stems": ["아젤라익애씨드", "아젤라익산", "Azelaic Acid"], "funcs": ["트러블", "붉은기", "잡티"]},
    {"key": "squalane", "label": "스쿠알란", "stems": ["스쿠알란", "Squalane"], "funcs": ["보습", "장벽", "속건조"]},
    {"key": "allantoin", "label": "알란토인", "stems": ["알란토인", "Allantoin"], "funcs": ["진정", "저자극", "장벽"]},
    {"key": "ectoin", "label": "엑토인", "stems": ["엑토인", "Ectoin"], "funcs": ["장벽", "보습", "진정"]},
    {"key": "collagen", "label": "콜라겐", "stems": ["콜라겐", "Collagen"], "funcs": ["탄력", "보습", "리프팅"]},
    {"key": "propolis", "label": "프로폴리스", "stems": ["프로폴리스", "Propolis"], "funcs": ["보습", "진정", "광채"]},
]

CONCERN_SIGNAL_GROUPS = [
    {"key": "wrinkleElasticity", "legacyKey": "elasticity", "label": "주름/탄력", "keywords": ["주름", "잔주름", "팔자주름", "목주름", "주름 개선", "탄력", "피부 탄력", "처진 피부", "리프팅", "안티에이징", "노화 케어", "레티놀 탄력", "PDRN 탄력", "펩타이드 탄력", "콜라겐 탄력", "아데노신 주름", "탄력 세럼", "탄력 앰플", "주름 개선 세럼", "리프팅 세럼"]},
    {"key": "toneSpot", "legacyKey": "texture", "label": "잡티/톤", "keywords": ["잡티", "기미", "주근깨", "색소침착", "다크스팟", "피부톤", "톤 개선", "톤업", "칙칙함", "광채", "브라이트닝", "미백", "비타민C 잡티", "나이아신아마이드 톤", "글루타티온", "트라넥사믹애씨드", "잡티 세럼", "기미 세럼", "톤 개선 세럼", "미백 세럼"]},
    {"key": "troubleCalming", "legacyKey": "calming", "label": "트러블/진정", "keywords": ["트러블", "여드름", "뾰루지", "피부 진정", "진정", "붉은기", "홍조", "자극", "피부 자극", "민감 피부", "시카", "병풀", "어성초", "티트리", "마데카소사이드", "트러블 세럼", "여드름 세럼", "진정 세럼", "시카 앰플", "병풀 진정"]},
    {"key": "drynessBarrier", "legacyKey": "barrier", "label": "건조/장벽", "keywords": ["건조", "속건조", "피부 건조", "수분 부족", "보습", "수분", "수분 충전", "보습 강화", "피부장벽", "장벽", "장벽 강화", "장벽 회복", "히알루론산", "세라마이드", "판테놀", "스쿠알란", "엑토인", "속건조 세럼", "수분 세럼", "보습 앰플"]},
    {"key": "poreSebum", "legacyKey": "pore", "label": "모공/피지", "keywords": ["모공", "넓은 모공", "모공 개선", "모공 축소", "모공 관리", "블랙헤드", "화이트헤드", "피지", "유분", "피지 조절", "유분 조절", "번들거림", "개기름", "피부결 모공", "BHA", "살리실산", "나이아신아마이드 모공", "레티놀 모공", "모공 세럼", "피지 세럼"]},
]

INGREDIENT_DEFINITIONS = INGREDIENT_SIGNAL_GROUPS
MAIN_INGREDIENT_KEYS = ["niacinamide", "hyaluronic_acid", "centella", "pdrn", "retinol"]
MARKET_PRODUCT_KEY_BY_DATALAB_KEY = {"centella": "cica"}


AGE_GROUPS = [
    # Naver DataLab age codes: 3=19~24, 4=25~29, 5=30~34, 6=35~39, 7=40~44, 8=45~49, 9=50~54, 10=55~59, 11=60+.
    {"label": "20대", "ages": ["3", "4"]},
    {"label": "30대", "ages": ["5", "6"]},
    {"label": "40대", "ages": ["7", "8"]},
    {"label": "50대+", "ages": ["9", "10", "11"]},
]

PERIOD_OPTIONS = {
    "snapshot": {"snapshot": True, "time_unit": "date"},
    "1m": {"day_count": 30, "time_unit": "date"},
    "6m": {"day_count": 180, "time_unit": "week"},
    "1y": {"day_count": 365, "time_unit": "week"},
    "3y": {"day_count": 1095, "time_unit": "month"},
}

INGREDIENT_COLORS = {
    "레티놀": "#3B66A6",
    "PDRN": "#2CA6A4",
    "나이아신아마이드": "#E6A23C",
    "히알루론산": "#8B7CC8",
    "병풀/시카": "#5AAA6E",
}


def _today_for_query() -> date:
    return date.today()


def date_range(day_count: int) -> tuple[str, str]:
    end = _today_for_query() - timedelta(days=1)
    start = end - timedelta(days=max(1, day_count) - 1)
    return start.isoformat(), end.isoformat()


def snapshot_date_range() -> tuple[str, str]:
    if SNAPSHOT_START_DATE and SNAPSHOT_END_DATE:
        return SNAPSHOT_START_DATE, SNAPSHOT_END_DATE
    return date_range(SNAPSHOT_DAY_COUNT)


def average(values: list[float]) -> float:
    nums = [float(value) for value in values if isinstance(value, (int, float))]
    return sum(nums) / len(nums) if nums else 0.0


def calculate_growth(values: list[float]) -> float:
    nums = [float(value) for value in values if isinstance(value, (int, float))]
    if len(nums) < 2:
        return 0.0
    midpoint = max(1, len(nums) // 2)
    previous_avg = average(nums[:midpoint])
    current_avg = average(nums[midpoint:])
    if previous_avg <= 0:
        return 100.0 if current_avg > 0 else 0.0
    return ((current_avg - previous_avg) / previous_avg) * 100


def build_ingredient_keywords(group: dict[str, Any]) -> list[str]:
    templates = ["{stem} 세럼", "{stem} 앰플", "{stem} 에센스", "{stem} 세럼 추천", "{stem} 앰플 추천"]
    keywords: list[str] = []
    for stem in group.get("stems", []):
        keywords.extend(template.replace("{stem}", stem) for template in templates)
        keywords.extend(f"{stem} {func}" for func in group.get("funcs", []))
    return list(dict.fromkeys(keywords))[:20]


def build_ingredient_keyword_group(definition: dict[str, Any]) -> dict[str, Any]:
    return {
        "key": definition["key"],
        "label": definition["label"],
        "keywords": build_ingredient_keywords(definition),
    }


def build_compact_ingredient_keyword_group(definition: dict[str, Any]) -> dict[str, Any]:
    """Smaller keyword group for the Page 2 trend chart.

    The full ingredient group can contain many Korean/English/function combinations.
    Naver DataLab occasionally closes the connection on heavy payloads, so the
    trend chart uses a compact, stable keyword set for the five main ingredients.
    """
    label = definition["label"]
    stems = [str(stem).strip() for stem in definition.get("stems", []) if str(stem).strip()]
    keywords: list[str] = []
    for stem in stems[:2]:
        keywords.extend([stem, f"{stem} 세럼", f"{stem} 앰플"])
    keywords.extend([f"{label} 세럼", f"{label} 앰플"])
    return {"key": definition["key"], "label": label, "keywords": list(dict.fromkeys(keywords))[:6]}


def chunk_groups(groups: list[dict[str, Any]], size: int = 4, with_anchor: bool = True) -> list[list[dict[str, Any]]]:
    chunks = []
    for index in range(0, len(groups), size):
        chunk = groups[index : index + size]
        chunks.append([*chunk, ANCHOR_GROUP] if with_anchor else chunk)
    return chunks


def _request_datalab(payload: dict[str, Any]) -> dict[str, Any]:
    """Call Naver DataLab in a conservative way.

    Naver sometimes closes the connection when several DataLab requests hit it at
    nearly the same time. The browser loads dashboard-signals and ingredient-trend
    on page load, so we serialize every outbound request and keep a small gap.
    """
    global _LAST_DATALAB_REQUEST_AT
    client_id = os.getenv("NAVER_CLIENT_ID")
    client_secret = os.getenv("NAVER_CLIENT_SECRET")
    if not client_id or not client_secret:
        raise RuntimeError("NAVER_CLIENT_ID 또는 NAVER_CLIENT_SECRET 환경변수가 설정되지 않았습니다.")
    headers = {
        "X-Naver-Client-Id": client_id,
        "X-Naver-Client-Secret": client_secret,
        "Content-Type": "application/json",
        "Accept": "application/json",
        "User-Agent": "BeautyMD-Insight-Dashboard/0.3",
    }
    last_error: Exception | None = None
    with _DATALAB_LOCK:
        for attempt in range(1, NAVER_DATALAB_MAX_RETRIES + 1):
            elapsed = time.monotonic() - _LAST_DATALAB_REQUEST_AT
            if elapsed < NAVER_DATALAB_REQUEST_GAP_SECONDS:
                time.sleep(NAVER_DATALAB_REQUEST_GAP_SECONDS - elapsed)
            try:
                response = requests.post(NAVER_DATALAB_URL, headers=headers, json=payload, timeout=(5, 45))
                _LAST_DATALAB_REQUEST_AT = time.monotonic()
                try:
                    body = response.json() if response.text else {}
                except ValueError:
                    body = {"message": response.text or "네이버 데이터랩 응답을 JSON으로 파싱하지 못했습니다."}
                if response.ok:
                    return body
                message = body.get("errorMessage") or body.get("message") or f"네이버 데이터랩 API 요청에 실패했습니다. HTTP {response.status_code}"
                last_error = RuntimeError(message)
                if response.status_code not in {408, 429, 500, 502, 503, 504}:
                    raise last_error
            except (requests.ConnectionError, requests.Timeout, requests.RequestException) as error:
                _LAST_DATALAB_REQUEST_AT = time.monotonic()
                last_error = error
            if attempt < NAVER_DATALAB_MAX_RETRIES:
                time.sleep(NAVER_DATALAB_BACKOFF_SECONDS * attempt)
    raise RuntimeError(_summarize_datalab_error(last_error))


def datalab_request(payload: dict[str, Any]) -> dict[str, Any]:
    return _request_datalab(payload)


def _summarize_datalab_error(error: Exception | None) -> str:
    message = str(error or "네이버 데이터랩 API 요청에 실패했습니다.")
    if "RemoteDisconnected" in message or "Remote end closed connection" in message or "Connection aborted" in message:
        return (
            "네이버 DataLab 서버가 연결을 중간에 끊었습니다. "
            "요청을 순차 처리하고 키워드 수를 줄여 재시도했지만 실패했습니다. "
            "잠시 후 새로고침하거나 .env에서 NAVER_DATALAB_REQUEST_GAP_SECONDS=2.0으로 올려보세요."
        )
    return message


def to_keyword_payload(groups: list[dict[str, Any]]) -> list[dict[str, Any]]:
    payload_groups = []
    for group in groups[:5]:
        keywords = [str(keyword).strip() for keyword in group.get("keywords", []) if str(keyword).strip()]
        payload_groups.append(
            {
                "groupName": str(group.get("label") or group.get("groupName")),
                "keywords": list(dict.fromkeys(keywords))[:NAVER_DATALAB_KEYWORDS_PER_GROUP],
            }
        )
    return payload_groups


def build_search_payload(
    groups: list[dict[str, Any]],
    day_count: int = 14,
    time_unit: str = "date",
    ages: list[str] | None = None,
    start_date: str | None = None,
    end_date: str | None = None,
) -> dict[str, Any]:
    if not start_date or not end_date:
        start_date, end_date = date_range(day_count)
    payload: dict[str, Any] = {
        "startDate": start_date,
        "endDate": end_date,
        "timeUnit": time_unit,
        "keywordGroups": to_keyword_payload(groups),
    }
    if ages:
        payload["ages"] = ages
    return payload


def rows_from_datalab_results(results: dict[str, Any], source_groups: list[dict[str, Any]]) -> list[dict[str, Any]]:
    result_list = results.get("results", [])
    by_title = {item.get("title"): item for item in result_list}
    anchor = by_title.get("__anchor__")
    anchor_by_date = {
        point.get("period"): max(float(point.get("ratio", 0) or 0), 0.0001)
        for point in anchor.get("data", [])
    } if anchor else {}

    rows = []
    for group in source_groups:
        if group.get("key") == "__anchor__":
            continue
        result = by_title.get(group["label"])
        if not result:
            continue
        values = []
        for point in result.get("data", []):
            ratio = float(point.get("ratio", 0) or 0)
            anchor_value = anchor_by_date.get(point.get("period"), 1.0)
            values.append(ratio / anchor_value if anchor else ratio)
        current_index = average(values[len(values) // 2 :])
        rows.append({
            "key": group["key"],
            "label": group["label"],
            "rawIndex": current_index,
            "growth": round(calculate_growth(values), 1),
        })
    return rows


def normalize_search_index(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    max_index = max([float(row.get("rawIndex", 0) or 0) for row in rows] or [1.0])
    if max_index <= 0:
        max_index = 1.0
    return [
        {
            **row,
            "rawIndex": round(float(row.get("rawIndex", 0) or 0), 4),
            "searchIndex": round((float(row.get("rawIndex", 0) or 0) / max_index) * 100),
        }
        for row in rows
    ]


def build_function_risers(warnings: list[str] | None = None) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for chunk in chunk_groups(FUNCTION_SIGNAL_GROUPS, 4, True):
        start_date, end_date = snapshot_date_range()
        try:
            response = datalab_request(build_search_payload(chunk, time_unit="date", start_date=start_date, end_date=end_date))
            rows.extend(rows_from_datalab_results(response, chunk))
        except Exception as error:
            if warnings is not None:
                labels = ", ".join(group["label"] for group in chunk if group.get("key") != "__anchor__")
                warnings.append(f"기능 TOP5 일부 요청 실패: {labels} ({error})")
    rows = normalize_search_index(rows)
    return sorted(rows, key=lambda row: row.get("growth", 0), reverse=True)[:5]


def build_ingredient_popularity(warnings: list[str] | None = None) -> list[dict[str, Any]]:
    groups = [build_ingredient_keyword_group(group) for group in INGREDIENT_SIGNAL_GROUPS]
    rows: list[dict[str, Any]] = []
    for chunk in chunk_groups(groups, 4, True):
        start_date, end_date = snapshot_date_range()
        try:
            response = datalab_request(build_search_payload(chunk, time_unit="date", start_date=start_date, end_date=end_date))
            rows.extend(rows_from_datalab_results(response, chunk))
        except Exception as error:
            if warnings is not None:
                labels = ", ".join(group["label"] for group in chunk if group.get("key") != "__anchor__")
                warnings.append(f"성분 인기 TOP5 일부 요청 실패: {labels} ({error})")
    rows = normalize_search_index(rows)
    return sorted(rows, key=lambda row: row.get("rawIndex", 0), reverse=True)[:5]


def build_concern_table(warnings: list[str] | None = None) -> list[dict[str, Any]]:
    raw_rows = []
    max_value = 1.0
    for age_group in AGE_GROUPS:
        start_date, end_date = snapshot_date_range()
        try:
            response = datalab_request(build_search_payload(CONCERN_SIGNAL_GROUPS, time_unit="date", ages=age_group["ages"], start_date=start_date, end_date=end_date))
        except Exception as error:
            if warnings is not None:
                warnings.append(f"연령대 히트맵 일부 요청 실패: {age_group['label']} ({error})")
            continue
        by_title = {item.get("title"): item for item in response.get("results", [])}
        row: dict[str, Any] = {"age": age_group["label"]}
        for concern in CONCERN_SIGNAL_GROUPS:
            data = by_title.get(concern["label"], {}).get("data", [])
            value = average([float(point.get("ratio", 0) or 0) for point in data])
            row[concern["key"]] = value
            max_value = max(max_value, value)
        raw_rows.append(row)
    normalized = []
    for row in raw_rows:
        normalized_row = {"age": row["age"]}
        for concern in CONCERN_SIGNAL_GROUPS:
            value = round((float(row.get(concern["key"], 0)) / max_value) * 100)
            normalized_row[concern["key"]] = value
            if concern.get("legacyKey"):
                normalized_row[concern["legacyKey"]] = value
        normalized.append(normalized_row)
    return normalized


def build_market_products() -> list[dict[str, Any]]:
    stats_path = BASE_DIR / "data" / "processed" / "ingredient_candidate_stats.csv"
    if not stats_path.exists():
        return []
    stats = pd.read_csv(stats_path)
    if stats.empty or "canonical_id" not in stats.columns:
        return []

    stats = stats.set_index("canonical_id")
    group_lookup = {group["key"]: group for group in INGREDIENT_SIGNAL_GROUPS}
    rows: list[dict[str, Any]] = []
    for datalab_key in MAIN_INGREDIENT_KEYS:
        stats_key = MARKET_PRODUCT_KEY_BY_DATALAB_KEY.get(datalab_key, datalab_key)
        if stats_key not in stats.index or datalab_key not in group_lookup:
            continue
        source = stats.loc[stats_key]
        product_count = int(source.get("product_occurrence", 0) or 0)
        rows.append(
            {
                "ingredient_key": datalab_key,
                "ingredient_label": group_lookup[datalab_key]["label"],
                "product_count": product_count,
                "unique_product_count": product_count,
                "brand_count": 0,
                "source": str(source.get("retailers", "processed_retailer_data") or "processed_retailer_data"),
                "is_mock": False,
            }
        )
    return sorted(rows, key=lambda row: row["product_count"], reverse=True)


def build_ingredient_trend(period_key: str) -> dict[str, Any]:
    option = PERIOD_OPTIONS.get(period_key, PERIOD_OPTIONS["snapshot"])
    group_lookup = {group["key"]: build_compact_ingredient_keyword_group(group) for group in INGREDIENT_SIGNAL_GROUPS}
    groups = [group_lookup[key] for key in MAIN_INGREDIENT_KEYS if key in group_lookup]
    if option.get("snapshot"):
        start_date, end_date = snapshot_date_range()
    else:
        start_date, end_date = date_range(int(option["day_count"]))
    response = datalab_request(build_search_payload(groups, time_unit=option["time_unit"], start_date=start_date, end_date=end_date))
    results = response.get("results", [])
    result_by_title = {item.get("title"): item for item in results}
    first_with_data = next((result_by_title.get(group["label"]) for group in groups if result_by_title.get(group["label"], {}).get("data")), None)
    dates = [point.get("period") for point in first_with_data.get("data", [])] if first_with_data else []
    series = []
    for group in groups:
        label = group["label"]
        item = result_by_title.get(label, {})
        series.append({
            "ingredient_key": group["key"],
            "ingredient": label,
            "values": [round(float(point.get("ratio", 0) or 0), 2) for point in item.get("data", [])],
            "color": INGREDIENT_COLORS.get(label, "#6B7280"),
        })
    lead = series[0] if series else {"ingredient": "", "values": []}
    growth = calculate_growth(lead.get("values", [])) if lead else 0.0
    peak_date = ""
    if lead.get("values") and dates:
        peak_index = max(range(len(lead["values"])), key=lambda i: lead["values"][i])
        peak_date = dates[peak_index]
    return {
        "periodLabel": f"{dates[0]} ~ {dates[-1]}" if dates else "",
        "selectedIngredient": lead.get("ingredient", ""),
        "selectedSummary": {"growthRate": round(growth, 1), "peakDate": peak_date},
        "searchTrend": {"dates": dates, "series": series},
    }


@app.get("/")
@app.get("/index.html")
def read_index() -> FileResponse:
    return FileResponse(BASE_DIR / "index.html")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/datalab/status")
def datalab_status() -> dict[str, Any]:
    start_date, end_date = snapshot_date_range()
    return {
        "status": "ready" if os.getenv("NAVER_CLIENT_ID") and os.getenv("NAVER_CLIENT_SECRET") else "missing_credentials",
        "dataRange": f"{start_date} ~ {end_date}",
        "functionGroupCount": len(FUNCTION_SIGNAL_GROUPS),
        "ingredientGroupCount": len(INGREDIENT_SIGNAL_GROUPS),
        "concernGroupCount": len(CONCERN_SIGNAL_GROUPS),
        "concernLabels": [item["label"] for item in CONCERN_SIGNAL_GROUPS],
    }


def _cache_is_fresh(cache: dict[str, Any]) -> bool:
    return bool(cache.get("data")) and (time.monotonic() - float(cache.get("created_at", 0))) < DATALAB_CACHE_TTL_SECONDS


def _compact_error_message(warnings: list[str]) -> str:
    if not warnings:
        return "네이버 DataLab 응답에 표시할 데이터가 없습니다."
    remote_count = sum("RemoteDisconnected" in warning or "Remote end closed connection" in warning for warning in warnings)
    if remote_count:
        return (
            f"네이버 DataLab 연결이 {remote_count}개 요청에서 중간에 끊겼습니다. "
            "요청을 순차 처리하도록 수정했지만, 계속 발생하면 잠시 후 새로고침하거나 "
            ".env의 NAVER_DATALAB_REQUEST_GAP_SECONDS를 1.5~2.0으로 늘려주세요. "
            f"첫 오류: {warnings[0]}"
        )
    return "; ".join(warnings[:3]) + (f"; 외 {len(warnings) - 3}건" if len(warnings) > 3 else "")


@app.post("/api/datalab/search")
def datalab_search(payload: dict[str, Any] = Body(default_factory=dict)) -> JSONResponse:
    try:
        return JSONResponse(content=datalab_request(payload or {}))
    except RuntimeError as error:
        return JSONResponse(status_code=500, content={"status": 500, "message": str(error)})
    except requests.RequestException as error:
        return JSONResponse(status_code=500, content={"status": 500, "message": str(error)})


@app.get("/api/datalab/dashboard-signals")
def datalab_dashboard_signals() -> JSONResponse:
    try:
        if _cache_is_fresh(_DASHBOARD_SIGNALS_CACHE):
            return JSONResponse(content=_DASHBOARD_SIGNALS_CACHE["data"])

        warnings: list[str] = []
        function_risers = build_function_risers(warnings)
        ingredient_popularity = build_ingredient_popularity(warnings)
        concern_table = build_concern_table(warnings)
        if not function_risers and not ingredient_popularity and not concern_table:
            raise RuntimeError(_compact_error_message(warnings))
        market_products = build_market_products()
        concern_metrics = [{"key": item["key"], "legacyKey": item.get("legacyKey", ""), "label": item["label"]} for item in CONCERN_SIGNAL_GROUPS]
        start_date, end_date = snapshot_date_range()
        payload = {
            "meta": {
                "source": "naver_datalab",
                "dataRange": f"{start_date} ~ {end_date}",
                "lastUpdated": _today_for_query().isoformat(),
                "comparisonLabel": "기간 내 전반부 대비 후반부",
                "functionGroupCount": len(FUNCTION_SIGNAL_GROUPS),
                "ingredientGroupCount": len(INGREDIENT_SIGNAL_GROUPS),
                "concernGroupCount": len(CONCERN_SIGNAL_GROUPS),
                "warnings": warnings,
            },
            "page1": {
                "functionRisers": function_risers,
                "ingredientPopularity": ingredient_popularity,
            },
            "page2": {
                "concernMetrics": concern_metrics,
                "concernTable": concern_table,
                "marketProducts": market_products,
                "insights": [
                    "연령대별 피부 고민 집중도는 주름/탄력, 잡티/톤, 트러블/진정, 건조/장벽, 모공/피지 키워드 그룹의 DataLab ratio를 정규화한 값입니다.",
                    "기능 급상승 순위와 성분 인기 순위는 현재 서버의 FUNCTION_SIGNAL_GROUPS, INGREDIENT_SIGNAL_GROUPS 기준으로 네이버 DataLab API에서 산출됩니다.",
                    "DataLab ratio는 실제 검색 건수가 아닌 상대 검색 관심도 지수이므로 후보군 내 비교 지표로 해석합니다.",
                ],
            },
        }
        _DASHBOARD_SIGNALS_CACHE["data"] = payload
        _DASHBOARD_SIGNALS_CACHE["created_at"] = time.monotonic()
        return JSONResponse(content=payload)
    except Exception as error:
        return JSONResponse(status_code=500, content={"status": 500, "message": str(error)})


@app.post("/api/datalab/ingredient-trend")
def datalab_ingredient_trend(payload: dict[str, Any] = Body(default_factory=dict)) -> JSONResponse:
    try:
        period_key = str(payload.get("periodKey") or "snapshot")
        cache = _INGREDIENT_TREND_CACHE.get(period_key)
        if cache and _cache_is_fresh(cache):
            return JSONResponse(content=cache["data"])
        data = build_ingredient_trend(period_key)
        _INGREDIENT_TREND_CACHE[period_key] = {"data": data, "created_at": time.monotonic()}
        return JSONResponse(content=data)
    except Exception as error:
        return JSONResponse(status_code=500, content={"status": 500, "message": str(error)})


if __name__ == "__main__":
    uvicorn.run(
        "fastapi_app:app",
        host=os.getenv("HOST", "127.0.0.1"),
        port=int(os.getenv("PORT", "3000")),
        reload=os.getenv("RELOAD", "").lower() in {"1", "true", "yes"},
    )
