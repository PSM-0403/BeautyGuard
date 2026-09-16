# Beauty Guard — Ingredient Intelligence Dashboard

화장품 MD를 위한 **성분 기반 시장 분석 대시보드**입니다.  
네이버 DataLab 검색 트렌드, 올리브영 리뷰 감성 분석, 수요-공급 매트릭스를 하나의 화면에서 제공합니다.

## 배포

| 구성요소 | 플랫폼 | 주소 |
|---|---|---|
| 프론트엔드 (Next.js) | Vercel | https://beautyguard-dashboard.vercel.app |
| 백엔드 (FastAPI) | Render (무료 티어) | https://beautyguard-api.onrender.com |

백엔드는 Render 무료 티어라 15분 미사용 시 슬립되고, 첫 요청 시 재기동에 30~60초 정도 걸릴 수 있습니다.

---

## 기술 스택

| 레이어 | 기술 |
|--------|------|
| 프론트엔드 | Next.js 14, React 18, TypeScript |
| 백엔드 | FastAPI (Python), uvicorn |
| 데이터베이스 | Supabase (PostgreSQL) — 올리브영 상품/리뷰 일 단위 크롤링 |
| 감성 분석 | `monologg/koelectra-small-finetuned-nsmc` (한국어 전용 ELECTRA-small, 긍정/부정 + 확신도 임계값으로 중립 합성) |
| AI 인사이트 | OpenAI `gpt-4.1-mini` (선택적 활성화) |
| 외부 API | 네이버 DataLab |

---

## 실행 방법

### 사전 요구사항

- Node.js 18+
- Python 3.10+ (conda / venv / 시스템 Python 모두 가능)

### 1. 패키지 설치

```bash
# 프론트엔드
npm install

# 백엔드 — 사용할 Python 환경에서 실행
pip install -r backend/requirements.txt
```

### 2. 환경변수 설정

**.env** (루트 — FastAPI용)
```env
NAVER_CLIENT_ID=
NAVER_CLIENT_SECRET=
OPENAI_API_KEY=
HF_TOKEN=
PORT=8000
CORS_ORIGINS=http://localhost:3000,http://127.0.0.1:3000

# AI 인사이트 on/off (true: 켜짐, false: 꺼짐)
ENABLE_AI_INSIGHTS=false
```

**.env.local** (루트 — Next.js용)
```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
NEXT_PUBLIC_DATALAB_API_BASE_URL=http://localhost:8000
```

### 3. 실행

```bash
# (Python 환경이 있다면 먼저 activate)
# conda: conda activate <환경이름>
# venv:  source venv/bin/activate  (Windows: venv\Scripts\activate)

npm run dev
```

- 대시보드: http://localhost:3000
- FastAPI 문서: http://localhost:8000/docs

---

## 화면 구성 (5페이지)

### 01 시장 요약
- 성분별 **수요-공급 매트릭스** (기회 / 성장 / 공급 과잉 / 관찰)
- 기능 급상승 TOP 5 · 성분 인기 TOP 5 (네이버 주간·월간 / 올리브영)
- 주요 성분 **가격 분포** (10ml 기준, 바이올린 차트)
- GPT 기반 MD 인사이트 (선택적)

### 02 검색 트렌드 분석
- 네이버 DataLab 성분 **검색 관심도 추이** (기간·성분 세트 선택)
- **연령대별 피부 고민 집중도** 히트맵
- 성분별 시장 제품 수 현황

### 03 소비자 리뷰 분석
- 성분 선택 → KoELECTRA 감성 분석 (최대 300건)
- 긍·부정 키워드 TOP 5, 피부 타입별 감정 비율
- 리뷰 반응 상위 제품 TOP 3
- 기회 성분 자동 드롭다운 추가 (2페이지 매트릭스 연동)

### 04 경보
- 수요-공급 격차 → **신제품 기획 후보 / 재고 리스크** 감지
- 부정 키워드 빈도 → **부정 리뷰 이슈** 감지
- 하루 1회 계산 후 결과를 저장해두고 재사용 (같은 날 재방문 시 즉시 응답)

### 05 AI Agent
- 대시보드 데이터 기반 자연어 질의 → 타깃 전략 생성

---

## 주요 성분 5개 선정 근거

성분 목록은 [`src/lib/main-ingredients.ts`](src/lib/main-ingredients.ts) 한 곳에서 관리합니다.  
수정 시 가격 분포 · 검색 트렌드 · 리뷰 분석 전체에 자동 반영됩니다.

| 성분 | 포지션 | 선정 이유 |
|------|--------|---------|
| 나이아신아마이드 | 범용 기능성 대표 | 제품 수 최다, 가격·리뷰 분석 기준점 |
| 히알루론산 | 보습 대표 | 보습/수분 제품군 대표, 키워드 안정적 |
| 레티놀 | 안티에이징 대표 | 탄력/주름 카테고리, 부정 리뷰도 명확 |
| 병풀/시카 | 진정·민감성 대표 | K-뷰티 진정/장벽 대표, 피부 타입 분석 유리 |
| PDRN | 신흥 기회 성분 | 급상승 트렌드, "기회 성분 발굴" 목적 |

---

## 주요 로직

### 감성 분석 흐름 — 적재 시점에 미리 계산, 조회는 저장된 값만 읽음

```
[적재 시] scripts/import_csv_to_supabase.py
    ↓ 리뷰 본문 → FastAPI /sentiment → KoELECTRA 감성 분류 (배치 20건)
       긍정확률 ≥ 65% → positive / 부정확률 ≥ 65% → negative / 그 외 → neutral
    ↓ product_reviews.sentiment 컬럼에 저장

[조회 시] 3페이지 리뷰 분석 / 4페이지 경보
    ↓ product_reviews (Supabase) — 성분 별칭 포함 검색 → 최신순 정렬 → 저장된 sentiment 값 바로 읽기
    ↓ 3페이지: 상위 300건 / 4페이지 경보: 상위 50건 (성분당) → 키워드 매칭 · 스코어링 · 경보 생성
```

리뷰 텍스트는 한 번 적재되면 바뀌지 않으므로, 조회할 때마다 감성분석을 다시 돌리지 않고
**적재 시점에 한 번만 계산해서 DB에 저장**해둡니다. 처음에는 3페이지/4페이지에서 매번 실시간으로
FastAPI를 호출하는 구조였는데, 리뷰 데이터가 충분히 쌓이자 Render 무료 티어(CPU 제한)가 감당 못 해
경보 API가 통째로 타임아웃 나는 문제가 있었습니다. 감성분석을 적재 시점으로 옮기면서 리뷰 분석은
약 8초, 경보 재계산은 약 6초로 단축됐고(이전엔 3분 이상 걸리다 실패), 매 요청마다 반복 계산하던
비효율도 함께 해소했습니다.

`monologg/koelectra-small-finetuned-nsmc`는 긍정/부정 2-class만 예측하는 한국어 전용 모델이라,
두 확률 모두 임계값(65%) 미만인 애매한 구간을 neutral로 합성해 3단계 분류를 유지합니다.
Render 무료 티어(RAM 512MB)에서도 안정적으로 돌아가도록 원래 쓰던 다국어 BERT-base(약 110M 파라미터,
한국어는 학습 데이터에 없었음) 대신 한국어로 직접 학습된 ELECTRA-small(약 14M 파라미터)로 교체했습니다.
또한 Render의 제한된 CPU에서 PyTorch가 기본 설정대로 여러 스레드를 쓰려다 서로 경합해 추론이
비정상적으로 느려지는 문제가 있어, 스레드 수를 1로 고정해 추론 속도를 개선했습니다.

### 기능 급상승 순위 정렬 기준

```
정렬 기준: (현재 기간 검색 지수) - (이전 기간 검색 지수) [%p 절대 증가량]
표시 값: 동일 기준의 p 단위 수치
```

### AI 인사이트 (`ENABLE_AI_INSIGHTS=true` 시 활성화)

각 페이지 데이터를 JSON으로 OpenAI `gpt-4.1-mini`에 전달,  
MD 의사결정에 바로 쓸 수 있는 문장 2~5개를 JSON Schema로 강제 출력합니다.

### 데이터 수집 (올리브영 크롤러)

`올리브영 크롤러/[Module]oliveyoung_crawler/`의 Selenium 크롤러로 매일 두 카테고리(스킨케어 > 크림, 스킨케어 > 에센스/세럼/앰플)의
판매순·신상품순 상위 24개 **상품 정보**를 수집해 `scripts/import_csv_to_supabase.py`로 Supabase에 적재합니다.
사용법은 해당 폴더의 [README](<올리브영 크롤러/[Module]oliveyoung_crawler/README.md>) 참고.

**리뷰**는 매일 수집하지 않고, N일치 상품 CSV를 상품 URL(goods_no) 기준으로 병합·중복 제거한 뒤
그 전체 상품 목록에 대해 한 번에 수집합니다 (`--review-only-product-csv` 옵션). 같은 상품 리뷰를 매일
반복 수집하지 않아도 되고, 올리브영의 접속 방어(짧은 시간에 너무 많은 상세페이지 요청 시 발생)를
피하려면 시간 간격을 두고 나눠서 재시도하는 게 안전합니다.

현재 5일치(9/11~9/15) 수집분 기준 고유 상품 107개 중 101개 상품에 리뷰(973건)를 확보했습니다.
나머지 6개는 신상품이라 원래 리뷰가 없거나 판매 종료된 상품이라 채울 수 없는 케이스입니다.

---

## 디렉터리 구조

```
.
├── backend/
│   └── fastapi_app.py            # 감성 분석 API (KoELECTRA), DataLab 프록시
├── 올리브영 크롤러/
│   └── [Module]oliveyoung_crawler/  # 상품/리뷰 수집 크롤러 (Selenium)
├── scripts/
│   ├── import_csv_to_supabase.py     # 크롤러 CSV → Supabase 적재 (리뷰는 감성분석까지 계산해서 저장)
│   └── backfill_review_sentiment.py  # 기존에 sentiment 없이 적재된 리뷰 일괄 백필 (일회성)
├── src/
│   ├── app/
│   │   └── api/
│   │       ├── dashboard/        # 각 페이지 GPT 인사이트 API
│   │       ├── review-analysis/  # 리뷰 분석 API
│   │       └── alerts/daily/     # 경보 생성 API
│   ├── components/
│   │   ├── dashboard/Dashboard.tsx
│   │   └── review-analysis/
│   └── lib/
│       ├── main-ingredients.ts   # 주요 성분 단일 소스 (여기만 수정)
│       ├── reviewAnalysis.ts     # 리뷰 조회(적재 시 계산된 sentiment 사용)·키워드·스코어링
│       ├── reviewConstants.ts    # 긍/부정 키워드 사전
│       ├── generateInsights.ts   # OpenAI 인사이트 생성
│       ├── daily-alert-service.ts # 경보 계산 서비스
│       ├── demand-supply-matrix.ts
│       └── alerts.ts
└── README.md
```
