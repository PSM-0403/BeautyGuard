from __future__ import annotations

import json
import re
from typing import Any
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from bs4 import BeautifulSoup

from .common import clean_text, ensure_absolute_oliveyoung_url


# ============================================================
# product_parser.py
# ------------------------------------------------------------
# 역할:
# - 상품 목록 페이지 HTML에서 상품 카드 데이터 추출
# - 상품 상세 페이지 HTML에서 평점/리뷰수/전성분/용량 추출
# - URL의 pageIdx, prdSort 값을 바꾸는 보조 함수 제공
#
# 왜 분리하는가?
# - Selenium으로 페이지를 여는 일과
#   BeautifulSoup으로 HTML을 분석하는 일은 성격이 다르기 때문입니다.
# - 올리브영 HTML 구조가 바뀌면 이 파일 위주로 수정하면 됩니다.
# ============================================================


NOTICE_FIELD_ALIASES = {
    "내용물의 용량 또는 중량": "용량",
    "제품 주요 사양": "제품주요사양",
    "사용기한(또는 개봉 후 사용기간)": "사용기한",
    "사용방법": "사용방법",
    "화장품제조업자,화장품책임판매업자 및 맞춤형화장품판매업자": "제조판매업자",
    "제조국": "제조국",
    "화장품법에 따라 기재해야 하는 모든 성분": "전성분",
    "기능성 화장품 식품의약품안전처 심사필 여부": "기능성화장품심사",
    "사용할 때의 주의사항": "사용시주의사항",
    "품질보증기준": "품질보증기준",
    "소비자상담 전화번호": "소비자상담전화번호",
}

DETAIL_IMAGE_SELECTORS = [
    "#goodsDetailContent img",
    "#goodsDetailInfo img",
    ".goods_detail_box img",
    ".prd_detail_box img",
    ".prd_detail img",
    ".contEditor img",
    ".detail_info_area img",
    ".GoodsDetailDescription img",
    "[class*='GoodsDetail'] img",
    "[class*='Description'] img",
    "[class*='detail'] img",
]

PRODUCT_DEDUPE_WORDS = [
    "단독기획",
    "한정기획",
    "더블기획",
    "듀오기획",
    "리필기획",
    "대용량기획",
    "기획",
    "더블",
    "듀오",
    "리필팩",
    "리필",
    "본품",
    "증정",
    "대용량",
    "리뉴얼",
    "NEW",
    "new",
]


def normalize_product_dedupe_key(product_name: str, brand: str = "") -> str:
    """
    용량/기획 구성만 다른 같은 상품을 하나로 묶기 위한 비교 키를 만듭니다.

    예:
    [트러블모공] 디오디너리 나이아신아마이드 10% + 징크 1% 30ml
    [트러블모공] 디오디너리 나이아신아마이드 10% + 징크 1% 60ml
    -> 같은 키
    """
    text = clean_text(product_name).lower()
    brand_text = clean_text(brand).lower()

    if not text:
        return ""

    text = re.sub(r"\[[^\]]*\]", " ", text)
    text = re.sub(r"\([^)]*\)", " ", text)
    text = re.sub(r"\d+(?:\.\d+)?\s*(?:ml|mL|ML|g|G)\b", " ", text)
    text = re.sub(r"\d+\s*(?:매입|매|개입|개|입|종|병)\b", " ", text)
    text = re.sub(r"\b\d+\s*\+\s*\d+\b", " ", text)

    for word in PRODUCT_DEDUPE_WORDS:
        text = re.sub(re.escape(word.lower()), " ", text)

    text = re.sub(r"[^0-9a-z가-힣%+]+", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    brand_text = re.sub(r"[^0-9a-z가-힣]+", "", brand_text)

    return f"{brand_text}:{text}" if brand_text else text


def with_page(url: str, page: int) -> str:
    """
    URL의 pageIdx 값을 바꿉니다.

    예:
    pageIdx=1 -> pageIdx=2
    """
    parts = urlsplit(url)
    query = dict(parse_qsl(parts.query, keep_blank_values=True))
    query["pageIdx"] = str(page)

    return urlunsplit(
        (
            parts.scheme,
            parts.netloc,
            parts.path,
            urlencode(query),
            parts.fragment,
        )
    )


def with_sort(url: str, sort_code: str) -> str:
    """
    URL의 prdSort 값을 바꿉니다.

    올리브영 정렬 코드:
    01 인기순
    02 신상품순
    03 판매순
    05 낮은가격순
    09 할인율순
    """
    parts = urlsplit(url)
    query = dict(parse_qsl(parts.query, keep_blank_values=True))
    query["prdSort"] = sort_code

    return urlunsplit(
        (
            parts.scheme,
            parts.netloc,
            parts.path,
            urlencode(query),
            parts.fragment,
        )
    )


def image_url_from_tag(tag: Any) -> str:
    """
    이미지 태그에서 이미지 URL을 추출합니다.

    src, data-src, data-original, srcset 순서로 확인합니다.
    """
    if not tag:
        return ""

    for attr in ("src", "data-src", "data-original"):
        value = clean_text(tag.get(attr))

        if value:
            return ensure_absolute_oliveyoung_url(value)

    srcset = clean_text(tag.get("srcset"))

    if srcset:
        first_url = srcset.split(",")[0].strip().split(" ")[0]
        return ensure_absolute_oliveyoung_url(first_url)

    return ""


def is_detail_description_image_url(url: str) -> bool:
    """
    대표 썸네일/아이콘이 아니라 상품설명 영역 이미지로 보이는 URL만 남깁니다.
    """
    lowered = clean_text(url).lower()

    if not lowered or lowered.startswith("data:"):
        return False

    skip_patterns = [
        "thumbnail",
        "thumbnails",
        "sprite",
        "logo",
        "icon",
        "ico_",
        "blank",
        "loading",
    ]

    if any(pattern in lowered for pattern in skip_patterns):
        return False

    detail_patterns = [
        "detail",
        "goodsdetail",
        "description",
        "contents",
        "content",
        "editor",
        "upload",
        "uploads",
        "cf-goods",
    ]

    return any(pattern in lowered for pattern in detail_patterns)


def extract_detail_image_urls(soup: BeautifulSoup) -> list[str]:
    """
    상품설명 영역에 포함된 이미지 URL을 추출합니다.

    올리브영 마크업은 자주 바뀌므로 여러 후보 셀렉터를 순서대로 시도하고,
    URL 패턴으로 대표 썸네일/아이콘을 걸러냅니다.
    """
    image_urls: list[str] = []
    seen_urls: set[str] = set()

    for selector in DETAIL_IMAGE_SELECTORS:
        for image_tag in soup.select(selector):
            image_url = image_url_from_tag(image_tag)

            if not image_url or image_url in seen_urls:
                continue

            if not is_detail_description_image_url(image_url):
                continue

            seen_urls.add(image_url)
            image_urls.append(image_url)

    if image_urls:
        return image_urls

    for image_tag in soup.find_all("img"):
        image_url = image_url_from_tag(image_tag)

        if not image_url or image_url in seen_urls:
            continue

        if not is_detail_description_image_url(image_url):
            continue

        seen_urls.add(image_url)
        image_urls.append(image_url)

    return image_urls


def meta_content(soup: BeautifulSoup, *selectors: str) -> str:
    """
    meta 태그에서 content 값을 추출합니다.

    상세설명, 대표이미지는 meta 태그에 들어있는 경우가 많습니다.
    """
    for selector in selectors:
        tag = soup.select_one(selector)
        value = clean_text(tag.get("content")) if tag else ""

        if value:
            return value

    return ""


def extract_notice_table(soup: BeautifulSoup) -> dict[str, str]:
    """
    상품정보 제공고시 테이블에서 주요 정보를 추출합니다.

    예:
    - 용량
    - 제품 주요 사양
    - 사용기한
    - 사용방법
    - 제조국
    - 전성분
    - 주의사항
    """
    details: dict[str, str] = {}

    for row in soup.find_all("tr"):
        header = row.find("th")
        cell = row.find("td")

        if not header or not cell:
            continue

        label = clean_text(header.get_text(" ", strip=True))
        value = clean_text(cell.get_text(" ", strip=True)).strip("'")

        if not label or not value:
            continue

        # 원래 라벨 그대로 저장
        details[label] = value

        # 분석하기 쉬운 컬럼명으로도 한 번 더 저장
        alias = NOTICE_FIELD_ALIASES.get(label)

        if alias:
            details[alias] = value

    return details


def parse_product_cards(
    html: str,
    *,
    page: int,
    sort_code: str,
    sort_name: str,
    suffix: str,
    major_category: str,
    middle_category: str,
    start_rank: int,
    seen_product_keys: set[str],
) -> list[dict[str, str | int]]:
    """
    상품 목록 페이지 HTML에서 상품 카드 정보를 추출합니다.

    반환되는 주요 컬럼:
    - 상품번호
    - 브랜드
    - 상품명
    - 정가
    - 할인가
    - 할인율
    - 상품링크
    - 이미지
    """

    soup = BeautifulSoup(html, "html.parser")

    # 기존 올리브영 목록 카드 기준
    cards = soup.select(".prd_info")

    rows: list[dict[str, str | int]] = []

    for card in cards:
        rank_value = start_rank + len(rows)

        name_tag = card.select_one(".tx_name")
        brand_tag = card.select_one(".tx_brand")
        price_org_tag = card.select_one(".tx_org .tx_num")
        price_sale_tag = card.select_one(".tx_cur .tx_num")
        link_tag = card.select_one("a.prd_thumb")
        image_tag = card.select_one("a.prd_thumb img, .prd_thumb img")

        link = link_tag.get("href") if link_tag else ""
        link = ensure_absolute_oliveyoung_url(link)

        product_key = clean_text(link_tag.get("data-ref-goodsno", "")) if link_tag else ""

        if not product_key:
            product_key = link

        brand_name = brand_tag.get_text(strip=True) if brand_tag else ""
        product_name = name_tag.get_text(strip=True) if name_tag else ""
        dedupe_name_key = normalize_product_dedupe_key(product_name, brand_name)
        seen_keys = [
            f"goods:{product_key}" if product_key else "",
            f"name:{dedupe_name_key}" if dedupe_name_key else "",
        ]

        # 같은 상품 중복 수집 방지
        if any(key and key in seen_product_keys for key in seen_keys):
            continue

        for key in seen_keys:
            if key:
                seen_product_keys.add(key)

        list_price = (
            clean_text(price_org_tag.get_text(strip=True)).replace(",", "")
            if price_org_tag
            else ""
        )

        sale_price = (
            clean_text(price_sale_tag.get_text(strip=True)).replace(",", "")
            if price_sale_tag
            else ""
        )

        try:
            discount_rate = (
                f"{round((int(list_price) - int(sale_price)) / int(list_price) * 100)}%"
            )
        except Exception:
            discount_rate = ""

        rows.append(
            {
                "소스": "oliveyoung",
                "페이지": page,
                "순위": rank_value,
                "정렬": sort_name,
                "정렬코드": sort_code,
                "정렬suffix": suffix,
                "대카테고리": major_category,
                "중카테고리": middle_category,
                "카테고리": f"{major_category} > {middle_category}",
                "상품번호": product_key,
                "브랜드": brand_name,
                "상품명": product_name,
                "정가": list_price,
                "할인가": sale_price,
                "할인율": discount_rate,
                "상품링크": link,
                "이미지": image_url_from_tag(image_tag),
            }
        )

    return rows


def build_detail_dict(soup: BeautifulSoup) -> dict[str, str]:
    """
    상품 상세 페이지 HTML에서 상세 데이터를 추출합니다.

    포함 정보:
    - 제품평점
    - 전체리뷰수
    - 상세설명
    - 대표이미지
    - 용량
    - 전성분
    - 사용방법
    - 제조국
    - 상세정보_JSON
    """

    rating_tag = soup.select_one(".ReviewArea_rating-star__al_PT .rating")
    product_rating = (
        rating_tag.get_text(strip=True).replace("평점", "").strip()
        if rating_tag
        else ""
    )

    review_count_tag = soup.select_one(".ReviewArea_btn-review__gZoOZ span")
    total_reviews = review_count_tag.get_text(strip=True) if review_count_tag else ""

    detail: dict[str, str] = {
        "제품평점": product_rating,
        "전체리뷰수": total_reviews,
        "상세설명": meta_content(
            soup,
            'meta[property="og:description"]',
            'meta[name="description"]',
            'meta[name="twitter:description"]',
        ),
        "대표이미지": meta_content(
            soup,
            'meta[property="og:image"]',
            'meta[name="twitter:image"]',
        ),
    }

    detail_image_urls = extract_detail_image_urls(soup)
    detail["상세이미지_URLS"] = json.dumps(detail_image_urls, ensure_ascii=False)

    notice_table = extract_notice_table(soup)

    for key, value in notice_table.items():
        if key in NOTICE_FIELD_ALIASES.values():
            detail[key] = value

    detail["상세정보_JSON"] = json.dumps(notice_table, ensure_ascii=False)

    return detail
