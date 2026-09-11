# [모듈] 올리브영 크롤러

이 모듈은 올리브영 상품 / 리뷰 데이터를 수집하고 DB에 적재 합니다.

# [실행 방법]

# 1. 패키지 설치 / 최초 1회 실행
pip install -r requirements.txt

# 1-1. GPT OCR 사용 시 .env 설정
프로젝트 루트 또는 이 크롤러 폴더에 .env 파일을 두고 아래 키를 설정합니다.

OPENAI_API_KEY=sk-...

모델을 바꾸고 싶으면 선택적으로 아래 값을 추가합니다.

OPENAI_OCR_MODEL=gpt-4.1-mini

# 2. 코드 실행
python .\main.py `
  --total-pages 2 `
  --max-products 24 `
  --major-category "스킨케어" `
  --middle-category "에센스/세럼/앰플" `
  --sorts best,new `
  --reviews-per-product 10 `
  --chrome-version 147 `
  --interim-save-interval 50 `
  --access-check-timeout-seconds 300 `
  --skip-import

# 3. 결과 

실행 결과로 Data/ 폴더에 CSV 파일이 생성됩니다.

Data/
├─ oliveyoung_판매순(info)_YYMMDD.csv
├─ oliveyoung_판매순(review)_YYMMDD.csv
├─ oliveyoung_신상품순(info)_YYMMDD.csv
└─ oliveyoung_신상품순(review)_YYMMDD.csv

수집 순서:
판매순 info → 판매순 review → 신상품순 info → 신상품순 review

상품명에서 용량/기획 구성만 다른 중복 상품은 앞 순위 상품만 남깁니다.
예: 30ml/60ml 용량만 다른 같은 상품은 1개만 저장됩니다.

제품 CSV 컬럼:
date, platform, sort_type, rank, product_name, brand, volume_ml, regular_price, discount, sales_price, rating, review_count, main_ingredients, ingredients, ing_source, url

main_ingredients는 상품설명 이미지 URL을 GPT Vision/OCR에 보내 확인되는 주요 성분만 최대 3개까지 한글로 추출한 값입니다.
OPENAI_API_KEY가 없거나 API 호출에 실패하면 빈 값으로 저장하고 크롤링은 계속 진행됩니다.

리뷰 CSV 컬럼:
date, platform, sort_type, main_ingredients, product_name, review_count, review_rating, skin_type, review_text, url

# [실행 관련 옵션은 하단에 기재]

# [모듈 구조]
[Module]oliveyoung_crawler/
│
├─ main.py : 전체 실행 진입점
├─ README.MD : 설명
├─ requirements.txt : 패키지 → 목록 및 설치
│
└─ oliveyoung_crawler/
   ├─ __init__.py : 모듈 인식 파일
   ├─ config.py : 실행 옵션, 정렬 코드, 기본 저장 경로
   ├─ common.py : 텍스트 정리, 숫자 변환, 용량 파싱, CSV 파일명 생성
   ├─ browser.py : 크롬 드라이버 생성, 종료, 올리브영 접근 확인 대기
   ├─ category.py : 올리브영 대카테고리/중카테고리 진입
   ├─ product_parser.py : HTML에서 상품명, 가격, 전성분, 용량 등 추출
   ├─ product_collector.py : 목록 + 상세정보 수집 후 상품 CSV 저장
   ├─ review_collector.py : CSV 기준으로 리뷰 수집 후 리뷰 CSV 저장
   ├─ db_importer.py : 기존 DB 적재 로직과 연결
   └─ run_pipeline.py : 상품 → 리뷰 → DB 적재 전체 관리

# [ 최초 실행 전]

# 1. 문법확인 : 아래 코드 실행

python -m py_compile `
  .\main.py `
  .\oliveyoung_crawler\config.py `
  .\oliveyoung_crawler\common.py `
  .\oliveyoung_crawler\browser.py `
  .\oliveyoung_crawler\category.py `
  .\oliveyoung_crawler\product_parser.py `
  .\oliveyoung_crawler\product_collector.py `
  .\oliveyoung_crawler\review_collector.py `
  .\oliveyoung_crawler\db_importer.py `
  .\oliveyoung_crawler\run_pipeline.py

→ 아무 메시지가 나오지 않으면 문법상 정상

# 2. 상품+리뷰 CSV 수집 테스트 : 최초 DB 적재를 제외하기 위해 --skip-import 사용

python .\main.py `
  --total-pages 2 `
  --max-products 24 `
  --major-category "스킨케어" `
  --middle-category "에센스/세럼/앰플" `
  --sorts best,new `
  --reviews-per-product 10 `
  --chrome-version 147 `
  --interim-save-interval 50 `
  --access-check-timeout-seconds 300 `
  --skip-import

실행 결과로 Data/ 폴더에 CSV 파일이 생성됩니다.

Data/
├─ oliveyoung_판매순(info)_YYMMDD.csv
├─ oliveyoung_판매순(review)_YYMMDD.csv
├─ oliveyoung_신상품순(info)_YYMMDD.csv
└─ oliveyoung_신상품순(review)_YYMMDD.csv

제품 CSV 컬럼:
date, platform, sort_type, rank, product_name, brand, volume_ml, regular_price, discount, sales_price, rating, review_count, main_ingredients, ingredients, ing_source, url

리뷰 CSV 컬럼:
date, platform, sort_type, main_ingredients, product_name, review_count, review_rating, skin_type, review_text, url

# 3. 상품 수집만 테스트

python .\main.py `
  --total-pages 2 `
  --max-products 24 `
  --sorts best,new `
  --skip-reviews `
  --skip-import

# 4. 기존 상품 CSV로 리뷰만 다시 수집

python .\main.py `
  --review-only-product-csv ".\Data\oliveyoung_판매순(info)_YYMMDD.csv" `
  --reviews-per-product 10 `
  --chrome-version 147 `
  --access-check-timeout-seconds 300 `
  --skip-import

# [실행 관련 옵션]

--total-pages	수집할 페이지 수	2
--max-products	최대 상품 수	24
--major-category	대카테고리	"스킨케어"
--middle-category	중카테고리	"에센스/세럼/앰플"
--sorts	정렬 기준	best,new, best, new, hot
--reviews-per-product	상품당 리뷰 수	10
--chrome-version	Chrome 버전	147
--interim-save-interval	중간 저장 간격	50
--review-only-product-csv	기존 상품 CSV로 리뷰만 다시 수집	선택
--skip-reviews	리뷰 수집 생략	상품 CSV만 확인
--skip-import	DB 적재 생략	CSV까지만 확인

# [모듈화 목적]

기존 크롤러는 하나의 파일에 여러 기능이 섞여 있었습니다.

본 프로젝트에서는 다음과 같이 역할을 나누었습니다.

브라우저 실행       → browser.py
카테고리 진입       → category.py
상품 HTML 파싱      → product_parser.py
상품 수집 실행      → product_collector.py
리뷰 수집 실행      → review_collector.py
DB 적재 연결        → db_importer.py
전체 실행 순서 관리 → run_pipeline.py

이를 통해 다음과 같은 장점이 있습니다.

기능별 파일 분리로 코드 이해가 쉬움
오류 발생 시 수정 위치를 빠르게 찾을 수 있음
팀원별 역할 분담이 쉬움
향후 네이버/다이소 등 다른 크롤러로 확장하기 쉬움
교육용 프로젝트에서 코드 구조를 설명하기 좋음
