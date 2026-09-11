from __future__ import annotations

import argparse
from pathlib import Path

from .common import parse_sorts
from .config import DEFAULT_DB_PATH, ProductCrawlConfig, ReviewCrawlConfig
from .db_importer import import_to_database
from .product_collector import run as run_product_collector
from .review_collector import run as run_review_collector


# ============================================================
# run_pipeline.py
# ------------------------------------------------------------
# 역할:
# - 전체 실행 순서 관리
#
# 전체 흐름:
# 1. 정렬별 상품 수집
# 2. 해당 정렬 리뷰 수집
# 3. 다음 정렬 반복
# 4. DB 적재
#
# 이 파일은 실제 수집 로직을 직접 들고 있지 않습니다.
# 각 모듈을 순서대로 호출하는 조정자 역할입니다.
# ============================================================


def parse_args() -> argparse.Namespace:
    """
    터미널에서 입력받는 옵션을 정의합니다.
    """

    parser = argparse.ArgumentParser(
        description="올리브영 상품/리뷰 수집 후 DB 적재까지 실행합니다."
    )

    parser.add_argument("--total-pages", type=int, default=2)
    parser.add_argument("--max-products", type=int, default=24)
    parser.add_argument("--major-category", default="스킨케어")
    parser.add_argument("--middle-category", default="에센스/세럼/앰플")
    parser.add_argument("--sorts", default="best,new")
    parser.add_argument("--interim-save-interval", type=int, default=50)

    parser.add_argument("--reviews-per-product", type=int, default=10)

    parser.add_argument("--chrome-version", type=int, default=147)
    parser.add_argument("--headless", action="store_true")

    parser.add_argument("--access-check-timeout-seconds", type=int, default=180)

    parser.add_argument("--output-dir", type=Path, default=None)
    parser.add_argument("--db-path", type=Path, default=DEFAULT_DB_PATH)
    parser.add_argument(
        "--review-only-product-csv",
        type=Path,
        default=None,
        help="기존 상품 CSV를 사용해서 리뷰만 다시 수집합니다.",
    )

    parser.add_argument(
        "--skip-reviews",
        action="store_true",
        help="리뷰 수집을 건너뜁니다.",
    )

    parser.add_argument(
        "--skip-import",
        action="store_true",
        help="DB 적재를 건너뜁니다. 단독 모듈 테스트 시 권장합니다.",
    )

    parser.add_argument(
        "--no-analyze-ingredients",
        action="store_true",
        help="DB 적재 시 전성분 분석을 생략합니다.",
    )

    return parser.parse_args()


def main() -> None:
    """
    전체 파이프라인 실행 함수입니다.
    """

    args = parse_args()

    output_dir = args.output_dir

    if args.review_only_product_csv is not None:
        review_config_kwargs = {
            "product_csv": args.review_only_product_csv,
            "reviews_per_product": args.reviews_per_product,
            "sorts": args.sorts,
            "interim_save_interval": args.interim_save_interval,
            "chrome_version": args.chrome_version,
            "headless": args.headless,
            "access_check_timeout_seconds": args.access_check_timeout_seconds,
        }

        if output_dir is not None:
            review_config_kwargs["output_dir"] = output_dir

        print("=" * 70)
        print("기존 상품 CSV로 올리브영 리뷰만 수집 시작")
        print("=" * 70)

        review_config = ReviewCrawlConfig(**review_config_kwargs)
        review_csv = run_review_collector(review_config)

        if args.skip_import:
            print("\n[건너뜀] --skip-import 옵션으로 DB 적재를 생략합니다.")
            return

        counts = import_to_database(
            product_csv=args.review_only_product_csv,
            review_csv=review_csv,
            db_path=args.db_path,
            source_name="oliveyoung",
            analyze_ingredients=not args.no_analyze_ingredients,
        )

        print(f"\n[DB 적재 결과] {args.review_only_product_csv.name}")
        for key, value in counts.items():
            print(f"- {key}: {value}")

        return

    crawl_outputs: list[tuple[Path, Path | None]] = []

    for _, sort_name, sort_key in parse_sorts(args.sorts):
        product_config_kwargs = {
            "total_pages": args.total_pages,
            "max_products": args.max_products,
            "major_category": args.major_category,
            "middle_category": args.middle_category,
            "sorts": sort_key,
            "interim_save_interval": args.interim_save_interval,
            "chrome_version": args.chrome_version,
            "headless": args.headless,
            "access_check_timeout_seconds": args.access_check_timeout_seconds,
        }

        if output_dir is not None:
            product_config_kwargs["output_dir"] = output_dir

        product_config = ProductCrawlConfig(**product_config_kwargs)

        print("=" * 70)
        print(f"[{sort_name}] 올리브영 상품 수집 시작")
        print("=" * 70)

        product_csv_paths = run_product_collector(product_config)

        if not product_csv_paths:
            print(f"[{sort_name}] 생성된 상품 CSV가 없습니다.")
            continue

        for product_csv in product_csv_paths:
            print(f"\n[{sort_name}] 상품 CSV: {product_csv}")

            review_csv: Path | None = None

            if args.skip_reviews:
                print(f"[{sort_name}] --skip-reviews 옵션으로 리뷰 수집을 생략합니다.")
            else:
                print("\n" + "=" * 70)
                print(f"[{sort_name}] 올리브영 리뷰 수집 시작")
                print("=" * 70)

                review_config_kwargs = {
                    "product_csv": product_csv,
                    "reviews_per_product": args.reviews_per_product,
                    "sorts": sort_key,
                    "interim_save_interval": args.interim_save_interval,
                    "chrome_version": args.chrome_version,
                    "headless": args.headless,
                    "access_check_timeout_seconds": args.access_check_timeout_seconds,
                }

                if output_dir is not None:
                    review_config_kwargs["output_dir"] = output_dir

                review_config = ReviewCrawlConfig(**review_config_kwargs)
                review_csv = run_review_collector(review_config)

                if review_csv:
                    print(f"\n[{sort_name}] 리뷰 CSV: {review_csv}")

            crawl_outputs.append((product_csv, review_csv))

    if not crawl_outputs:
        print("[종료] 생성된 상품 CSV가 없습니다.")
        return

    # 3. DB 적재
    if args.skip_import:
        print("\n[건너뜀] --skip-import 옵션으로 DB 적재를 생략합니다.")
        return

    print("\n" + "=" * 70)
    print("3단계: DB 적재 시작")
    print("=" * 70)

    for product_csv, review_csv in crawl_outputs:
        counts = import_to_database(
            product_csv=product_csv,
            review_csv=review_csv,
            db_path=args.db_path,
            source_name="oliveyoung",
            analyze_ingredients=not args.no_analyze_ingredients,
        )

        print(f"\n[DB 적재 결과] {product_csv.name}")
        for key, value in counts.items():
            print(f"- {key}: {value}")

    print("\n전체 파이프라인 완료")


if __name__ == "__main__":
    main()
