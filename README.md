# Beauty Guard — Ingredient Intelligence Dashboard

화장품 MD를 위한 **성분 기반 시장 분석 대시보드**입니다.  
네이버 DataLab 검색 트렌드, 올리브영 리뷰 감성 분석(BERT), 수요-공급 매트릭스를 하나의 화면에서 제공합니다.

---

## 기술 스택

| 레이어 | 기술 |
|--------|------|
| 프론트엔드 | Next.js 14, React 18, TypeScript |
| 백엔드 | FastAPI (Python), uvicorn |
| 데이터베이스 | Supabase (PostgreSQL) — 2025-05-01부터 일 단위 크롤링 |
| 감성 분석 | `nlptown/bert-base-multilingual-uncased-sentiment` (HuggingFace) |
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
- 성분 선택 → BERT 감성 분석 (최대 300건)
- 긍·부정 키워드 TOP 5, 피부 타입별 감정 비율
- 리뷰 반응 상위 제품 TOP 3
- 기회 성분 자동 드롭다운 추가 (2페이지 매트릭스 연동)

### 04 경보
- 수요-공급 격차 → **신제품 기획 후보 / 재고 리스크** 감지
- 부정 키워드 빈도 → **부정 리뷰 이슈** 감지
- 페이지 로드 시 자동 계산 (BERT 100건 기준, 최초 로드 시 소요)

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

### 감성 분석 흐름 (3페이지 / 4페이지 경보)

```
product_reviews (Supabase)
    ↓ 성분 별칭 포함 검색 → 최신순 정렬
    ↓ 3페이지: 상위 300건 / 4페이지 경보: 상위 100건
    ↓ FastAPI /sentiment → BERT 감성 분류 (배치 16건)
       1~2점 → negative / 3점 → neutral / 4~5점 → positive
    ↓ 키워드 매칭 · 스코어링 · 경보 생성
```

### 기능 급상승 순위 정렬 기준

```
정렬 기준: (현재 기간 검색 지수) - (이전 기간 검색 지수) [%p 절대 증가량]
표시 값: 동일 기준의 p 단위 수치
```

### AI 인사이트 (`ENABLE_AI_INSIGHTS=true` 시 활성화)

각 페이지 데이터를 JSON으로 OpenAI `gpt-4.1-mini`에 전달,  
MD 의사결정에 바로 쓸 수 있는 문장 2~5개를 JSON Schema로 강제 출력합니다.

---

## 디렉터리 구조

```
.
├── backend/
│   └── fastapi_app.py            # 감성 분석 API (BERT), DataLab 프록시
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
│       ├── reviewAnalysis.ts     # 리뷰 수집·BERT·키워드·스코어링
│       ├── reviewConstants.ts    # 긍/부정 키워드 사전
│       ├── generateInsights.ts   # OpenAI 인사이트 생성
│       ├── daily-alert-service.ts # 경보 계산 서비스
│       ├── demand-supply-matrix.ts
│       └── alerts.ts
└── README.md
```
