from __future__ import annotations

import re
import time

from selenium.webdriver.common.by import By
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.support.ui import WebDriverWait

from .browser import wait_for_oliveyoung_access
from .config import ProductCrawlConfig


# ============================================================
# category.py
# ------------------------------------------------------------
# 역할:
# - 올리브영 메인 페이지 접속
# - 전체 카테고리 메뉴 열기
# - 대카테고리/중카테고리 클릭
# - 카테고리 번호(dispCatNo) 추출
# - 페이지별 상품 목록 URL 템플릿 생성
#
# 왜 따로 분리하는가?
# - 카테고리 진입은 상품 파싱과 성격이 다릅니다.
# - 상품명/가격 추출 문제는 product_parser.py에서 보고,
#   카테고리 클릭 문제는 category.py에서 보게 만들기 위함입니다.
# ============================================================


def select_category(driver, config: ProductCrawlConfig) -> str:
    """
    올리브영에서 원하는 카테고리로 이동하고,
    상품 목록 페이지 URL 템플릿을 반환합니다.

    기존 방향:
    - 대카테고리: 스킨케어
    - 중카테고리: 에센스/세럼/앰플

    Parameters
    ----------
    driver:
        Selenium WebDriver 객체

    config:
        ProductCrawlConfig 설정 객체
        major_category, middle_category, page_delay_seconds 등을 사용합니다.

    Returns
    -------
    category_url_template:
        pageIdx만 바꿔가며 목록 페이지에 접근할 수 있는 URL 템플릿

        예:
        https://www.oliveyoung.co.kr/store/display/getMCategoryList.do?...&pageIdx={page}
    """

    print("=" * 60)
    print("0단계: 올리브영 카테고리 자동 선택")
    print(f"대카테고리: {config.major_category}")
    print(f"중카테고리: {config.middle_category}")
    print("=" * 60)

    # 1. 올리브영 메인 접속
    driver.get("https://www.oliveyoung.co.kr")

    wait_for_oliveyoung_access(
        driver,
        timeout_seconds=config.access_check_timeout_seconds,
        context="올리브영 홈",
    )

    # 2. 전체 카테고리 버튼이 나타날 때까지 대기
    # 기존 코드 흐름에서 btnGnbOpen을 기준으로 메뉴를 엽니다.
    WebDriverWait(driver, 15).until(
        EC.presence_of_element_located((By.ID, "btnGnbOpen"))
    )

    time.sleep(2)

    # 3. 전체 카테고리 메뉴 열기
    gnb_button = driver.find_element(By.ID, "btnGnbOpen")
    driver.execute_script("arguments[0].click();", gnb_button)

    time.sleep(1)

    # 4. 원하는 중카테고리 클릭
    #
    # 기존 방식:
    # data-attr 안에 '공통^드로우^스킨케어_에센스/세럼/앰플'
    # 형태의 값이 들어있다고 보고 XPath로 찾습니다.
    #
    # 이 부분은 올리브영 메뉴 구조가 바뀌면 가장 먼저 수정될 수 있는 부분입니다.
    target_data_attr = (
        f"공통^드로우^{config.major_category}_{config.middle_category}"
    )

    xpath = f'//a[contains(@data-attr, "{target_data_attr}")]'

    category_element = WebDriverWait(driver, 10).until(
        EC.element_to_be_clickable((By.XPATH, xpath))
    )

    driver.execute_script("arguments[0].click();", category_element)

    time.sleep(config.page_delay_seconds)

    wait_for_oliveyoung_access(
        driver,
        timeout_seconds=config.access_check_timeout_seconds,
        context="카테고리 페이지",
    )

    print(f"[완료] 카테고리 클릭: {config.major_category} > {config.middle_category}")
    print(f"[현재 URL] {driver.current_url}")

    # 5. 현재 URL에서 dispCatNo 추출
    #
    # dispCatNo는 올리브영 카테고리 번호입니다.
    # 이후 페이지 이동 URL을 만들 때 필요합니다.
    match = re.search(r"dispCatNo=(\d+)", driver.current_url)

    if not match:
        raise RuntimeError(
            "카테고리 번호(dispCatNo)를 찾지 못했습니다. "
            "올리브영 카테고리 URL 구조가 바뀌었을 수 있습니다."
        )

    disp_cat_no = match.group(1)

    print(f"[카테고리 번호] {disp_cat_no}")

    # 6. 상품 목록 URL 템플릿 생성
    #
    # pageIdx={page} 부분만 바꿔가면서 1페이지, 2페이지, 3페이지를 수집합니다.
    category_url_template = (
        "https://www.oliveyoung.co.kr/store/display/getMCategoryList.do"
        f"?dispCatNo={disp_cat_no}"
        "&isLoginCnt=2"
        "&aShowCnt=0"
        "&bShowCnt=0"
        "&cShowCnt=0"
        f"&trackingCd=Cat{disp_cat_no}_MID"
        "&pageIdx={page}"
    )

    return category_url_template