from __future__ import annotations

import re
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urljoin
from zoneinfo import ZoneInfo

from .config import DEFAULT_OUTPUT_DIR, SORT_ORDER_MAP

KST = ZoneInfo("Asia/Seoul")


# ============================================================
# 1. 시간 관련 함수
# ============================================================

def now_iso() -> str:
    """
    현재 시간을 ISO 형식 문자열로 반환합니다.

    사용 예: 크롤링한 시점을 CSV에 저장할 때 사용합니다.
    """
    return datetime.now(timezone.utc).astimezone(KST).isoformat(timespec="seconds")


def today_ymd_suffix() -> str:
    """
    파일명에 넣을 실행일을 한국 시간 기준 YYMMDD로 반환합니다.

    예:
    2026-04-29 실행 -> 260429
    2026-04-30 실행 -> 260430
    """
    return datetime.now(KST).strftime("%y%m%d")


# ============================================================
# 2. 텍스트 정리 함수
# ============================================================

def clean_text(value) -> str:
    """
    크롤링한 텍스트에서 불필요한 공백, 줄바꿈, 탭을 제거합니다.

    예:
    '  토리든\\n 다이브인 세럼  '
    -> '토리든 다이브인 세럼'

    왜 필요한가?
    - 웹페이지 텍스트는 줄바꿈/공백이 지저분한 경우가 많음
    - CSV 저장 전에 정리해야 분석하기 좋음
    """
    if value is None:
        return ""

    text = str(value)
    text = re.sub(r"\s+", " ", text)

    return text.strip()


# ============================================================
# 3. 숫자 추출 함수
# ============================================================

def parse_int(value) -> int | None:
    """
    문자열에서 숫자만 추출해서 int로 변환합니다.

    예:
    '12,900원' -> 12900
    '리뷰 1,234개' -> 1234

    변환할 숫자가 없으면 None을 반환합니다.
    """
    text = clean_text(value)

    numbers = re.sub(r"[^0-9]", "", text)

    if not numbers:
        return None

    return int(numbers)


# ============================================================
# 4. URL 정리 함수
# ============================================================

def ensure_absolute_oliveyoung_url(url: str) -> str:
    """
    올리브영 상대경로 URL을 절대경로 URL로 바꿉니다.

    예:
    /store/goods/getGoodsDetail.do?goodsNo=...
    -> https://www.oliveyoung.co.kr/store/goods/getGoodsDetail.do?goodsNo=...

    왜 필요한가?
    - HTML 안에는 상대경로로 들어있는 링크가 많음
    - 나중에 Selenium으로 접속하려면 완전한 URL이 필요함
    """
    url = clean_text(url)

    if not url:
        return ""

    return urljoin("https://www.oliveyoung.co.kr", url)


# ============================================================
# 5. 정렬 옵션 파싱 함수
# ============================================================

def parse_sorts(sorts: str) -> list[tuple[str, str, str]]:
    """
    사용자가 입력한 정렬 옵션을 올리브영 정렬 코드로 변환합니다.

    입력:
    'hot,new'

    출력:
    [
        ('01', '인기순', 'hot'),
        ('02', '신상품순', 'new')
    ]

    반환값 구조:
    sort_code : 올리브영 URL에 들어가는 코드
    sort_name : 사람이 읽는 이름
    suffix    : 파일명에 붙일 이름
    """
    result = []

    for raw_key in sorts.split(","):
        key = raw_key.strip()

        if not key:
            continue

        if key not in SORT_ORDER_MAP:
            raise ValueError(f"지원하지 않는 정렬 옵션입니다: {key}")

        sort_code, sort_name = SORT_ORDER_MAP[key]
        result.append((sort_code, sort_name, key))

    return result


# ============================================================
# 6. 저장 파일 경로 생성 함수
# ============================================================

OUTPUT_KIND_LABELS = {
    "Data": "info",
    "Review": "review",
    "info": "info",
    "review": "review",
}


def sort_label_from_suffix(suffix: str) -> str:
    """
    정렬 suffix를 파일명에 들어갈 한글 정렬명으로 변환합니다.

    예:
    best -> 판매순
    hot  -> 인기순
    """
    suffix = clean_text(suffix)

    if suffix in SORT_ORDER_MAP:
        return SORT_ORDER_MAP[suffix][1]

    for _, sort_name in SORT_ORDER_MAP.values():
        if suffix == sort_name:
            return sort_name

    return suffix


def make_output_path(
    output_dir: Path = DEFAULT_OUTPUT_DIR,
    kind: str = "Data",
    suffix: str = "best",
    source: str = "oliveyoung",
) -> Path:
    """
    CSV 저장 경로를 만듭니다.

    예:
    Data/oliveyoung_판매순(info)_260429.csv
    Data/oliveyoung_판매순(review)_260429.csv

    kind:
    - Data   : 상품 데이터
    - Review : 리뷰 데이터
    """
    output_dir.mkdir(parents=True, exist_ok=True)

    today = today_ymd_suffix()
    kind_label = OUTPUT_KIND_LABELS.get(kind, kind)
    sort_label = sort_label_from_suffix(suffix)
    file_name = f"{source}_{sort_label}({kind_label})_{today}.csv"

    return output_dir / file_name


# ============================================================
# 7. 용량 파싱 함수
# ============================================================

def parse_volume_package(volume_text: str, product_name: str = "") -> dict[str, object]:
    """
    상품 용량 정보를 분석합니다.

    예:
    '30ml x 2개'
    -> 단품용량: 30ml
    -> 구성수량: 2
    -> 총용량: 60ml

    이 함수의 목적:
    - 제품별 용량 비교
    - ml당 가격 계산
    - 대시보드에서 용량 기준 필터링

    완벽한 자연어 분석은 아니고,
    기본적인 ml/g 패턴을 잡는 함수입니다.
    """
    text = clean_text(volume_text) or clean_text(product_name)

    result = {
        "package_volume_text": text,
        "unit_volume_text": "",
        "unit_volume_value": None,
        "unit_volume_unit": "",
        "package_quantity": 1,
        "total_volume_value": None,
        "total_volume_text": "",
    }

    # 30ml, 50 mL, 100g 같은 패턴 찾기
    matches = list(re.finditer(r"(\d+(?:\.\d+)?)\s*(ml|mL|ML|g|G)", text))

    if not matches:
        return result

    first_match = matches[0]
    unit = first_match.group(2).lower()

    same_unit_matches = [
        match
        for match in matches
        if match.group(2).lower() == unit
    ]

    def quantity_after(match: re.Match[str]) -> int:
        tail = text[match.end(): match.end() + 16]
        quantity_match = re.search(r"^\s*(?:[xX×*]\s*(\d+)|(\d+)\s*개)", tail)

        if quantity_match:
            return int(quantity_match.group(1) or quantity_match.group(2))

        return 1

    if len(same_unit_matches) > 1 and re.search(r"\+|본품|리필|증정|기획", text):
        total_value = sum(
            float(match.group(1)) * quantity_after(match)
            for match in same_unit_matches
        )
        value = float(first_match.group(1))
        quantity = sum(quantity_after(match) for match in same_unit_matches)
    else:
        value = float(first_match.group(1))
        quantity = quantity_after(first_match)

        # [1+1] 30ml처럼 용량 뒤에 수량이 붙지 않는 기획 구성도 반영합니다.
        event_quantity_match = re.search(r"(?<!\d)(\d+)\s*\+\s*(\d+)(?!\d)", text)

        if quantity == 1 and event_quantity_match:
            left_quantity = int(event_quantity_match.group(1))
            right_quantity = int(event_quantity_match.group(2))

            if left_quantity <= 5 and right_quantity <= 5:
                quantity = left_quantity + right_quantity

        total_value = value * quantity

    result.update(
        {
            "unit_volume_text": f"{value:g}{unit}",
            "unit_volume_value": value,
            "unit_volume_unit": unit,
            "package_quantity": quantity,
            "total_volume_value": total_value,
            "total_volume_text": f"{total_value:g}{unit}",
        }
    )

    return result


# ============================================================
# 8. 할인율 파싱 함수
# ============================================================

def parse_discount(value) -> int | None:
    """
    할인율 문자열에서 숫자만 추출합니다.

    예:
    '30%' -> 30
    '할인 15%' -> 15

    DB 적재나 할인율 분석 시 사용합니다.
    """
    return parse_int(value)
