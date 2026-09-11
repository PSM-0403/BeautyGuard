from __future__ import annotations

import csv
import re
import time
from pathlib import Path
from typing import Any

from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait

from .browser import create_driver, safe_quit_driver, wait_for_oliveyoung_access
from .common import clean_text, make_output_path, parse_int
from .config import ReviewCrawlConfig, SORT_ORDER_MAP


# ============================================================
# review_collector.py
# ------------------------------------------------------------
# 역할:
# - 상품 CSV를 읽음
# - 각 상품 상세 페이지로 이동
# - 리뷰 탭 클릭
# - 리뷰 데이터 추출
# - 리뷰 CSV 저장
#
# 기존 collect_reviews.py의 역할을 유지하되,
# 교육용으로 함수 단위와 주석을 더 명확하게 나눈 버전입니다.
# ============================================================


CLICK_REVIEW_TAB_JS = """
const candidates = [
    ...document.querySelectorAll('button.GoodsDetailTabs_tab-item__tgAnU'),
    ...document.querySelectorAll('button[role="tab"]')
];
const tab = candidates.find(button => (button.innerText || '').includes('리뷰'));
if (!tab) return false;
tab.scrollIntoView({block: 'center'});
tab.click();
return true;
"""

REVIEW_HOST_READY_JS = """
const host = document.querySelector('oy-review-review-in-product');
if (!host) return false;
const list = host.shadowRoot?.querySelector('oy-review-review-list');
return !!list;
"""

REVIEW_ITEM_COUNT_JS = """
const s1 = document.querySelector('oy-review-review-in-product')?.shadowRoot;
const s2 = s1?.querySelector('oy-review-review-list')?.shadowRoot;
return s2 ? s2.querySelectorAll('oy-review-review-item').length : 0;
"""

SCROLL_REVIEW_AREA_JS = """
const host = document.querySelector('oy-review-review-in-product');
if (host) {
    host.scrollIntoView({block: 'start'});
}
window.scrollBy(0, arguments[0] || 1200);
return window.scrollY;
"""


EXTRACT_REVIEWS_JS = """
const s1 = document.querySelector('oy-review-review-in-product')?.shadowRoot;
const s2 = s1?.querySelector('oy-review-review-list')?.shadowRoot;
if (!s2) return [];
const items = s2.querySelectorAll('oy-review-review-item');
const results = [];
items.forEach(item => {
    try {
        const s3 = item.shadowRoot;
        if (!s3) return;
        const starIcons = s3.querySelectorAll('oy-review-star-icon');
        let stars = 0;
        starIcons.forEach(icon => {
            const sh = icon.shadowRoot;
            if (sh) {
                const path = sh.querySelector('path');
                if (path && path.getAttribute('fill') === '#FF5753') stars++;
            }
        });
        const date = s3.querySelector('span.date')?.innerText?.trim() || '';
        const tags = Array.from(s3.querySelectorAll('.tag') || [])
            .map(t => t.innerText.trim())
            .filter(Boolean)
            .join('/');
        const userEl = s3.querySelector('oy-review-review-user');
        const su = userEl?.shadowRoot;
        const nickname = su?.querySelector('.name')?.innerText?.trim() || '';
        const skinTypes = Array.from(su?.querySelectorAll('.skin-type') || [])
            .map(s => s.innerText.trim()).join('/');
        const contEl = s3.querySelector('oy-review-review-content');
        const sc = contEl?.shadowRoot;
        const content = sc?.querySelector('p')?.innerText?.trim() || '';
        if (!content) return;
        results.push({nickname, skinTypes, stars, date, content, tags});
    } catch(e) {}
});
return results;
"""

ADVANCE_REVIEW_LIST_JS = """
const host = document.querySelector('oy-review-review-in-product');
const s1 = host?.shadowRoot;
const list = s1?.querySelector('oy-review-review-list');
const s2 = list?.shadowRoot;
if (!s2) return {action: 'missing_review_list'};

const items = Array.from(s2.querySelectorAll('oy-review-review-item'));
if (items.length) {
    items[items.length - 1].scrollIntoView({block: 'end'});
}
window.scrollBy(0, arguments[0] || 1600);

const roots = [s2, s1].filter(Boolean);
const candidates = [];

const collectClickables = root => {
    root.querySelectorAll('*').forEach(element => {
        if (element.matches('button,a,[role="button"]') && !candidates.includes(element)) {
            candidates.push(element);
        }

        const tagName = String(element.tagName || '').toLowerCase();
        if (element.shadowRoot && tagName !== 'oy-review-review-item') {
            collectClickables(element.shadowRoot);
        }
    });
};

roots.forEach(root => {
    collectClickables(root);
    root.querySelectorAll('button,a,[role="button"]').forEach(element => {
        if (!candidates.includes(element)) candidates.push(element);
    });
});

const textOf = element => [
    element.innerText || '',
    element.textContent || '',
    element.getAttribute('aria-label') || '',
    element.getAttribute('title') || '',
    element.className || '',
].join(' ').replace(/\\s+/g, ' ').trim();

const isVisible = element => (
    !!(element.offsetWidth || element.offsetHeight || element.getClientRects().length)
);

const isDisabled = element => {
    const className = String(element.className || '').toLowerCase();
    return (
        element.disabled ||
        element.getAttribute('aria-disabled') === 'true' ||
        className.includes('disabled') ||
        className.includes('inactive')
    );
};

const clickElement = (element, action) => {
    element.scrollIntoView({block: 'center'});
    element.click();
    return {action, label: textOf(element), itemCount: items.length};
};

const usable = candidates.filter(element => isVisible(element) && !isDisabled(element));

const moreButton = usable.find(element => {
    const label = textOf(element);
    return /(더보기|더 보기|more|load more)/i.test(label) && !/(접기|close)/i.test(label);
});
if (moreButton) return clickElement(moreButton, 'click_more');

const nextButton = usable.find(element => /(다음|next|paging-next|btn-next)/i.test(textOf(element)));
if (nextButton) return clickElement(nextButton, 'click_next');

const pageButtons = usable
    .map(element => ({element, number: parseInt((element.innerText || element.textContent || '').trim(), 10)}))
    .filter(item => Number.isInteger(item.number));

const selected = pageButtons.find(item => {
    const element = item.element;
    const className = String(element.className || '').toLowerCase();
    return (
        element.getAttribute('aria-current') === 'page' ||
        className.includes('active') ||
        className.includes('selected') ||
        className.includes('on')
    );
});

if (selected) {
    const nextPage = pageButtons.find(item => item.number === selected.number + 1);
    if (nextPage) return clickElement(nextPage.element, 'click_page');
}

return {action: 'scroll', scrollY: window.scrollY, itemCount: items.length};
"""

REVIEW_OUTPUT_COLUMNS = [
    "product_name",
    "review_rating",
    "review_count",
    "skin_type",
    "review_text",
    "url",
]

SORT_LABEL_TO_KEY = {
    sort_name: sort_key
    for sort_key, (_, sort_name) in SORT_ORDER_MAP.items()
}


def read_product_rows(path: Path) -> list[dict[str, str]]:
    """
    상품 CSV를 읽어서 딕셔너리 리스트로 반환합니다.
    """
    with path.open("r", encoding="utf-8-sig", newline="") as file:
        return list(csv.DictReader(file))


def save_review_rows(rows: list[dict[str, str]], path: Path) -> None:
    """
    리뷰 행 목록을 CSV로 저장합니다.
    """
    path.parent.mkdir(parents=True, exist_ok=True)

    with path.open("w", encoding="utf-8-sig", newline="") as file:
        writer = csv.DictWriter(file, fieldnames=REVIEW_OUTPUT_COLUMNS)
        writer.writeheader()
        writer.writerows(
            {
                column: row.get(column, "")
                for column in REVIEW_OUTPUT_COLUMNS
            }
            for row in rows
        )


def suffix_from_product_csv(path: Path, fallback: str = "best") -> str:
    """
    상품 CSV 파일명에서 정렬 suffix를 추출합니다.

    예:
    2026-04-28_Data(oliveyoung)_hot.csv -> hot
    oliveyoung_판매순(info)_260429.csv -> best
    """
    stem = path.stem
    match = re.match(r"oliveyoung_(.+?)\(info\)_\d{6}$", stem)

    if match:
        sort_label = match.group(1)
        return SORT_LABEL_TO_KEY.get(sort_label, sort_label)

    if "_" not in stem:
        return fallback

    return stem.split("_")[-1] or fallback


def product_value(product: dict[str, str], english_key: str, korean_key: str) -> str:
    """
    새 출력 스키마와 기존 한글 스키마를 모두 읽을 수 있게 합니다.
    """
    return clean_text(product.get(english_key) or product.get(korean_key))


def normalize_skin_type(value) -> str:
    """
    올리브영 사용자 피부 정보를 건성/지성/복합성/없음 중 하나로 정리합니다.
    """
    text = clean_text(value)

    for skin_type in ("건성", "지성", "복합성"):
        if skin_type in text:
            return skin_type

    return "없음"


def review_key(raw_review: dict[str, Any]) -> tuple[str, str, str, str]:
    """
    스크롤/페이지 이동 중 같은 리뷰가 다시 잡힐 때 중복 저장을 막습니다.
    """
    return (
        clean_text(raw_review.get("date")),
        clean_text(raw_review.get("content")),
        clean_text(raw_review.get("skinTypes")),
        clean_text(raw_review.get("stars")),
    )


def merge_raw_reviews(
    collected: list[dict[str, Any]],
    raw_reviews: list[dict[str, Any]],
    seen_keys: set[tuple[str, str, str, str]],
) -> int:
    """
    새로 추출한 리뷰를 기존 목록에 중복 없이 추가합니다.
    """
    added_count = 0

    for raw_review in raw_reviews:
        key = review_key(raw_review)

        if not key[1] or key in seen_keys:
            continue

        seen_keys.add(key)
        collected.append(raw_review)
        added_count += 1

    return added_count


def normalize_review_row(
    product: dict[str, str],
    raw_review: dict[str, Any],
) -> dict[str, str]:
    """
    JS로 추출한 리뷰 데이터를 요청받은 리뷰 CSV 스키마에 맞게 변환합니다.
    """
    content = clean_text(raw_review.get("content"))

    return {
        "product_name": product_value(product, "product_name", "상품명"),
        "review_rating": raw_review.get("stars", ""),
        "review_count": product_value(product, "review_count", "전체리뷰수"),
        "skin_type": normalize_skin_type(raw_review.get("skinTypes")),
        "review_text": content,
        "url": product_value(product, "url", "상품링크"),
    }


def failed_review_row(product: dict[str, str], error_code: str) -> dict[str, str]:
    """
    리뷰 수집 실패 시에도 상품 행을 버리지 않고 실패 사유를 review_text에 저장합니다.
    """
    return {
        "product_name": product_value(product, "product_name", "상품명"),
        "review_rating": "",
        "review_count": product_value(product, "review_count", "전체리뷰수"),
        "skin_type": "없음",
        "review_text": f"리뷰 수집 실패: {error_code}",
        "url": product_value(product, "url", "상품링크"),
    }


def collect_reviews_for_product(
    driver,
    product: dict[str, str],
    *,
    limit: int,
    access_check_timeout_seconds: int,
) -> list[dict[str, str]]:
    """
    상품 1개에 대해 리뷰를 수집합니다.
    """

    product_name = product_value(product, "product_name", "상품명")
    product_url = product_value(product, "url", "상품링크")
    available_review_count = parse_int(
        product_value(product, "review_count", "전체리뷰수")
    )
    target_limit = (
        min(limit, available_review_count)
        if available_review_count is not None
        else limit
    )

    if not product_url:
        return [failed_review_row(product, "missing_product_url")]

    if target_limit <= 0:
        print("  [리뷰 없음] 0건")
        return []

    print(f"[리뷰] {product_name}")

    try:
        driver.get(product_url)

        wait_for_oliveyoung_access(
            driver,
            timeout_seconds=access_check_timeout_seconds,
            context="리뷰 상품 상세",
        )

        WebDriverWait(driver, 15).until(
            lambda d: d.execute_script("return document.readyState") == "complete"
        )

        time.sleep(2)

        clicked = driver.execute_script(CLICK_REVIEW_TAB_JS)

        if not clicked:
            print("  [리뷰 실패] 리뷰 탭 클릭 실패")
            return [failed_review_row(product, "review_tab_not_clicked")]

        time.sleep(2)

        # 리뷰 Web Component가 실제로 마운트될 때까지 대기 (최대 6회 폴링)
        for _ in range(6):
            if (
                bool(driver.execute_script(REVIEW_HOST_READY_JS))
                or int(driver.execute_script(REVIEW_ITEM_COUNT_JS) or 0) > 0
            ):
                break
            driver.execute_script(SCROLL_REVIEW_AREA_JS, 1200)
            time.sleep(1)

        raw_reviews: list[dict[str, Any]] = []
        seen_review_keys: set[tuple[str, str, str, str]] = set()
        stalled_attempts = 0
        max_attempts = max(8, target_limit * 3)

        for _ in range(max_attempts):
            before_count = len(raw_reviews)
            current_reviews = driver.execute_script(EXTRACT_REVIEWS_JS) or []
            merge_raw_reviews(raw_reviews, current_reviews, seen_review_keys)

            if len(raw_reviews) >= target_limit:
                break

            advance_result = driver.execute_script(ADVANCE_REVIEW_LIST_JS, 1600) or {}
            time.sleep(1.5)

            current_reviews = driver.execute_script(EXTRACT_REVIEWS_JS) or []
            merge_raw_reviews(raw_reviews, current_reviews, seen_review_keys)

            if len(raw_reviews) >= target_limit:
                break

            if len(raw_reviews) == before_count:
                stalled_attempts += 1
            else:
                stalled_attempts = 0

            if stalled_attempts >= 4:
                print(
                    "  [리뷰 추가 로드 중단] "
                    f"{advance_result.get('action', 'unknown')}, "
                    f"{len(raw_reviews)}/{target_limit}건"
                )
                break

        if not raw_reviews:
            print("  [리뷰 실패] 리뷰 컴포넌트 또는 리뷰 아이템 미확인")
            return [failed_review_row(product, "review_component_or_items_not_loaded")]

        result: list[dict[str, str]] = []

        for raw_review in raw_reviews[:target_limit]:
            result.append(normalize_review_row(product, raw_review))

        if len(result) < target_limit:
            print(f"  [리뷰 일부 성공] {len(result)}/{target_limit}건")
        else:
            print(f"  [리뷰 성공] {len(result)}건")

        return result

    except Exception as error:
        print(f"  [리뷰 예외] {str(error)[:120]}")
        return [failed_review_row(product, f"exception:{str(error)[:80]}")]


def run(config: ReviewCrawlConfig) -> Path | None:
    """
    리뷰 수집 전체 실행 함수입니다.

    흐름:
    1. 상품 CSV 읽기
    2. 브라우저 생성
    3. 상품별 리뷰 수집
    4. 리뷰 CSV 저장
    5. 브라우저 종료
    """

    product_rows = read_product_rows(config.product_csv)

    if not product_rows:
        print("[리뷰] 상품 CSV에 데이터가 없습니다.")
        return None

    suffix = suffix_from_product_csv(config.product_csv, fallback=config.sorts)

    save_path = make_output_path(config.output_dir, "Review", suffix)

    all_review_rows: list[dict[str, str]] = []

    driver = create_driver(
        chrome_version=config.chrome_version,
        headless=config.headless,
    )

    try:
        for index, product in enumerate(product_rows, start=1):
            print(f"[리뷰 진행] {index}/{len(product_rows)}")

            rows = collect_reviews_for_product(
                driver,
                product,
                limit=config.reviews_per_product,
                access_check_timeout_seconds=config.access_check_timeout_seconds,
            )

            all_review_rows.extend(rows)

            if (
                config.interim_save_interval > 0
                and index % config.interim_save_interval == 0
            ):
                save_review_rows(all_review_rows, save_path)
                print(f"[리뷰 CSV 중간 저장] {save_path} ({index}개 상품)")

    finally:
        safe_quit_driver(driver)
        save_review_rows(all_review_rows, save_path)

    print(f"[리뷰 CSV 저장 완료] {save_path}")

    return save_path
