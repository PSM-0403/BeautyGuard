from __future__ import annotations

import sys
from pathlib import Path

from .config import DEFAULT_DB_PATH


# ============================================================
# db_importer.py
# ------------------------------------------------------------
# 역할:
# - 상품 CSV / 리뷰 CSV를 DB에 적재
#
# 중요한 기준:
# - DB 구조는 기존 프로젝트와 달라지면 안 됩니다.
# - 따라서 여기서 임의로 새 SQLite 테이블을 만들지 않습니다.
# - 기존 import_to_db.py 또는 src/cosmetic_dictionary 스키마가 있는 경우에만
#   기존 적재 로직을 호출합니다.
#
# 즉, 이 파일은 "DB 적재 로직을 새로 만드는 파일"이 아니라
# "기존 DB 적재 로직을 연결하는 파일"입니다.
# ============================================================


ROOT_DIR = Path(__file__).resolve().parents[1]
SRC_DIR = ROOT_DIR / "src"

if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

if str(SRC_DIR) not in sys.path:
    sys.path.insert(0, str(SRC_DIR))


def import_to_database(
    *,
    product_csv: Path | None,
    review_csv: Path | None,
    db_path: Path = DEFAULT_DB_PATH,
    source_name: str = "oliveyoung",
    analyze_ingredients: bool = True,
) -> dict[str, int]:
    """
    기존 import_to_db.py의 import_files 함수를 호출합니다.

    왜 직접 DB 코드를 만들지 않는가?
    - 기존 대시보드가 기대하는 DB 스키마가 있기 때문입니다.
    - 임의로 raw_products 같은 테이블을 만들면 대시보드와 연결이 깨질 수 있습니다.
    """

    try:
        # 같은 프로젝트 안에 기존 import_to_db.py가 있을 때 사용합니다.
        from oliveyoung_crawler.import_to_db import import_files

    except Exception as error:
        print("[DB 적재 생략]")
        print("기존 import_to_db.py를 찾지 못했습니다.")
        print("현재 모듈 실습 폴더만 단독으로 실행 중이라면 --skip-import 옵션으로 CSV까지만 확인하세요.")
        print("기존 new-chat 프로젝트에 붙일 경우 oliveyoung_crawler/import_to_db.py를 그대로 유지해야 합니다.")
        print(f"원인: {error}")

        return {
            "product_rows": 0,
            "image_rows": 0,
            "ingredient_rows": 0,
            "review_rows": 0,
        }

    counts = import_files(
        db_path=db_path,
        product_csv=product_csv,
        review_csv=review_csv,
        analyze_ingredients=analyze_ingredients,
        source_name=source_name,
    )

    return counts