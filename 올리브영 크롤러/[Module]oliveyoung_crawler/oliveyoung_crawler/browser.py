from __future__ import annotations

import time

from selenium import webdriver
from selenium.webdriver.chrome.service import Service
from webdriver_manager.chrome import ChromeDriverManager


# ============================================================
# browser.py
# ------------------------------------------------------------
# 역할:
# - Selenium Chrome Driver 생성
# - 크롬 브라우저 옵션 설정
# - 올리브영 접속 확인 화면 대기
# - 브라우저 안전 종료
#
# 왜 따로 분리하는가?
# - 상품 수집(product_collector.py)과 리뷰 수집(review_collector.py)이
#   둘 다 브라우저를 사용하기 때문입니다.
# - 드라이버 생성 코드를 여러 파일에 반복해서 쓰면 유지보수가 어려워집니다.
# ============================================================


def create_driver(chrome_version: int | None = 147, headless: bool = False):
    """
    Selenium Chrome Driver를 생성합니다.

    Parameters
    ----------
    chrome_version:
        사용자 PC에 설치된 Chrome 버전입니다.
        기존 프로젝트에서는 chrome_version=147 기준으로 실행했습니다.

        만약 버전 오류가 나면 None으로 바꿔서 자동 탐지 방식으로 실행할 수 있습니다.

    headless:
        True  = 브라우저 창을 띄우지 않고 실행
        False = 브라우저 창을 직접 띄우고 실행

        처음 테스트할 때는 False 권장입니다.
        왜냐하면 올리브영 페이지가 제대로 열리는지 눈으로 확인해야 하기 때문입니다.

    Returns
    -------
    driver:
        Selenium WebDriver 객체
    """

    options = webdriver.ChromeOptions()

    # 처음 테스트할 때는 headless=False 권장
    # headless=True면 브라우저 창이 보이지 않아 디버깅이 어렵습니다.
    if headless:
        options.add_argument("--headless=new")

    # 브라우저를 최대화해서 메뉴/버튼이 잘 보이도록 합니다.
    options.add_argument("--start-maximized")

    # 팝업 차단
    options.add_argument("--disable-popup-blocking")

    # 자동화 브라우저 특성을 조금 줄이는 기본 옵션입니다.
    # 단, 이것은 우회 목적이 아니라 테스트 안정성을 위한 일반적인 설정입니다.
    options.add_argument("--disable-blink-features=AutomationControlled")

    # 불필요한 로그를 줄입니다.
    options.add_argument("--log-level=3")

    # ChromeDriver 설치/연결
    # chrome_version이 있으면 해당 버전에 맞는 드라이버를 설치합니다.
    # None이면 webdriver-manager가 자동으로 맞는 버전을 찾습니다.
    if chrome_version:
        service = Service(
            ChromeDriverManager(driver_version=str(chrome_version)).install()
        )
    else:
        service = Service(ChromeDriverManager().install())

    driver = webdriver.Chrome(service=service, options=options)

    return driver


def safe_quit_driver(driver) -> None:
    """
    브라우저를 안전하게 종료합니다.

    왜 필요한가?
    - 크롤링 도중 오류가 나면 브라우저 창이 계속 남아 있을 수 있습니다.
    - finally 구문에서 이 함수를 호출하면 오류가 나도 브라우저를 닫을 수 있습니다.

    사용 예:
        driver = create_driver()
        try:
            ...
        finally:
            safe_quit_driver(driver)
    """
    try:
        if driver:
            driver.quit()
    except Exception:
        # 종료 중 발생하는 오류는 전체 실행을 막을 필요가 없으므로 무시합니다.
        pass


def wait_for_oliveyoung_access(
    driver,
    timeout_seconds: int = 180,
    context: str = "",
) -> None:
    """
    올리브영 페이지 접근 상태를 확인하며 기다립니다.

    기존 크롤러 흐름에서도 올리브영 접속 후 페이지가 완전히 열릴 때까지
    기다리는 과정이 필요합니다.

    이 함수의 목적:
    - 페이지가 아직 로딩 중이면 기다림
    - 접속 확인/보안 확인 화면이 보이면 사용자가 직접 확인할 시간을 줌
    - 지정된 시간 안에 정상 페이지로 넘어오지 않으면 오류 발생

    Parameters
    ----------
    driver:
        Selenium WebDriver 객체

    timeout_seconds:
        최대 대기 시간입니다.

    context:
        현재 어느 단계인지 표시하기 위한 설명입니다.
        예: "홈", "카테고리", "상품상세"
    """

    start_time = time.time()

    while True:
        title = driver.title or ""
        current_url = driver.current_url or ""
        page_source = driver.page_source or ""

        # 너무 긴 HTML 전체를 볼 필요는 없어서 앞부분만 확인합니다.
        page_sample = page_source[:2000]

        # 접속 확인 화면 또는 로딩/보안 화면에서 자주 보일 수 있는 단어들입니다.
        # 완벽한 판별 목적이 아니라, 사용자가 직접 확인할 시간을 주는 용도입니다.
        check_keywords = [
            "접속",
            "확인",
            "보안",
            "잠시만",
            "Access Denied",
            "Forbidden",
        ]

        is_check_page = any(
            keyword in title or keyword in page_sample
            for keyword in check_keywords
        )

        # 정상 페이지로 보이면 대기를 끝냅니다.
        if not is_check_page:
            return

        elapsed = time.time() - start_time

        if elapsed > timeout_seconds:
            raise TimeoutError(
                f"올리브영 접근 확인 대기 시간 초과: {context}, url={current_url}"
            )

        print(f"[대기] 올리브영 페이지 확인 중: {context}")
        print("      브라우저에 접속 확인 화면이 보이면 직접 완료해주세요.")

        time.sleep(5)