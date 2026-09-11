from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path


# ============================================================
# 1. 프로젝트 경로 설정
# ============================================================
# 현재 파일 위치:
# C:\Users\사용자명\OneDrive\Desktop\[Module]oliveyoung_crawler\oliveyoung_crawler\config.py
#
# parents[1]은 프로젝트 루트:
# C:\Users\사용자명\OneDrive\Desktop\[Module]oliveyoung_crawler
# ============================================================

ROOT_DIR = Path(__file__).resolve().parents[1]

# 크롤링 결과 CSV 저장 폴더
DEFAULT_OUTPUT_DIR = ROOT_DIR / "Data"

# SQLite DB 저장 경로
DEFAULT_DB_PATH = ROOT_DIR / "data" / "db" / "cosmetic_dictionary_v1.sqlite"


# ============================================================
# 2. 올리브영 정렬 코드
# ============================================================
# 올리브영 URL에는 정렬 기준이 코드로 들어갑니다.
#
# hot  : 인기순
# new  : 신상품순
# best : 판매순
# low  : 낮은가격순
# sale : 할인율순
# ============================================================

SORT_ORDER_MAP = {
    "hot": ("01", "인기순"),
    "new": ("02", "신상품순"),
    "best": ("03", "판매순"),
    "low": ("05", "낮은가격순"),
    "sale": ("09", "할인율순"),
}


# ============================================================
# 3. 상품 수집 설정
# ============================================================

@dataclass(frozen=True)
class ProductCrawlConfig:
    """
    상품 수집에 필요한 설정값을 모아둔 클래스입니다.

    왜 dataclass를 쓰는가?
    - 함수마다 total_pages, max_products, category 등을 따로 넘기면 복잡해짐
    - config.total_pages처럼 읽기 쉬움
    - 나중에 옵션이 늘어나도 관리하기 쉬움
    """

    # 몇 페이지까지 수집할지
    total_pages: int = 2

    # 최대 상품 수
    # None이면 제한 없음
    max_products: int | None = 24

    # 올리브영 대카테고리
    major_category: str = "스킨케어"

    # 올리브영 중카테고리
    middle_category: str = "에센스/세럼/앰플"

    # 수집할 정렬 기준
    # 예: "best" 또는 "best,new"
    sorts: str = "best,new"

    # 중간 저장 간격
    interim_save_interval: int = 50

    # CSV 저장 위치
    output_dir: Path = DEFAULT_OUTPUT_DIR

    # 사용 중인 크롬 버전
    # PC 크롬 버전과 맞지 않으면 None으로 두고 자동 설치하게 할 수 있음
    chrome_version: int | None = 147

    # True면 브라우저 창 없이 실행
    # 처음 테스트할 때는 False 권장
    headless: bool = False

    # 목록 페이지 이동 후 대기 시간
    page_delay_seconds: float = 3.0

    # 상세 페이지 이동 후 대기 시간
    detail_delay_seconds: float = 1.0

    # 접속 확인 화면이 나왔을 때 기다리는 최대 시간
    access_check_timeout_seconds: int = 180


# ============================================================
# 4. 리뷰 수집 설정
# ============================================================

@dataclass(frozen=True)
class ReviewCrawlConfig:
    """
    리뷰 수집에 필요한 설정값을 모아둔 클래스입니다.

    리뷰 수집은 상품 CSV가 먼저 있어야 합니다.
    그래서 product_csv 경로를 필수로 받습니다.
    """

    # 상품 CSV 파일 경로
    product_csv: Path

    # 상품 1개당 몇 개 리뷰를 수집할지
    reviews_per_product: int = 10

    # 어떤 정렬 기준 상품 CSV에서 온 리뷰인지
    sorts: str = "best"

    # 중간 저장 간격
    interim_save_interval: int = 50

    # 리뷰 CSV 저장 위치
    output_dir: Path = DEFAULT_OUTPUT_DIR

    # 크롬 버전
    chrome_version: int | None = 147

    # 브라우저 창 숨김 여부
    headless: bool = False

    # 접속 확인 대기 시간
    access_check_timeout_seconds: int = 180
