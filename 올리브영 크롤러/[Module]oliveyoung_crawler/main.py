"""
올리브영 크롤러 실행 진입점입니다.

나중에 이 파일 하나만 실행하면:
상품 수집 → 리뷰 수집 → DB 적재

순서로 실행되게 만들 예정입니다.
"""

from oliveyoung_crawler.run_pipeline import main


if __name__ == "__main__":
    main()