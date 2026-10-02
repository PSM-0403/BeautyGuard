-- Beauty Guard 대시보드용 Supabase 스키마
-- 코드(src/lib, src/components)에서 실제 사용하는 테이블/컬럼을 역추적해서 작성했습니다.
-- 새 Supabase 프로젝트의 SQL Editor에 전체 붙여넣고 실행하세요.

create table if not exists products (
  goods_no text primary key,
  brand text,
  category_name text,
  product_name text,
  product_name_clean text,
  product_name_raw text,
  volume_ml numeric,
  updated_at timestamptz default now()
);

create table if not exists product_main_ingredients (
  id bigserial primary key,
  goods_no text not null references products(goods_no) on delete cascade,
  ingredient_name text not null,
  unique (goods_no, ingredient_name)
);
create index if not exists idx_pmi_goods_no on product_main_ingredients (goods_no);
create index if not exists idx_pmi_ingredient on product_main_ingredients (ingredient_name);

-- GPT OCR 주성분 추출이 같은 상품에서도 날마다 달라, product_main_ingredients에는 5일 중
-- 하루라도 추출된 성분이 모두 누적돼 있다. 원본은 그대로 두고, 수집일 과반에서 추출된
-- 성분만 남긴 정제본을 따로 둔다 (scripts/build_main_ingredients_majority.py로 채움).
-- 매트릭스·경보 계산은 이 정제본을 읽는다.
create table if not exists product_main_ingredients_majority (
  id bigserial primary key,
  goods_no text not null references products(goods_no) on delete cascade,
  ingredient_name text not null,
  unique (goods_no, ingredient_name)
);
create index if not exists idx_pmim_goods_no on product_main_ingredients_majority (goods_no);
create index if not exists idx_pmim_ingredient on product_main_ingredients_majority (ingredient_name);

create table if not exists product_snapshots (
  id bigserial primary key,
  goods_no text not null references products(goods_no) on delete cascade,
  collected_date date not null,
  regular_price numeric,
  sales_price numeric,
  discount text,
  review_count numeric,
  updated_at timestamptz default now(),
  unique (goods_no, collected_date)
);
create index if not exists idx_snapshots_goods_no on product_snapshots (goods_no);
create index if not exists idx_snapshots_date on product_snapshots (collected_date);

create table if not exists product_rankings (
  id bigserial primary key,
  goods_no text not null references products(goods_no) on delete cascade,
  rank int,
  collected_date date not null,
  sort_type text,
  unique (goods_no, collected_date, sort_type)
);
create index if not exists idx_rankings_goods_no on product_rankings (goods_no);
create index if not exists idx_rankings_date on product_rankings (collected_date);

create table if not exists product_reviews (
  id bigserial primary key,
  goods_no text,
  collected_date date,
  platform text default 'oliveyoung',
  sort_type text,
  rank int,
  main_ingredients text,
  review_rating numeric,
  skin_type text,
  review_text text,
  -- 리뷰 텍스트는 적재 후 바뀌지 않으므로, 조회할 때마다 감성분석을 다시 돌리지 않고
  -- 적재 시점에 한 번 계산해서 저장한다 (positive/neutral/negative).
  sentiment text,
  created_at timestamptz default now()
);
create index if not exists idx_reviews_goods_no on product_reviews (goods_no);
create index if not exists idx_reviews_collected_date on product_reviews (collected_date);

create table if not exists daily_metric_snapshot (
  snapshot_date date primary key,
  ingredient_matrix jsonb,
  review_issue_summary jsonb,
  created_at timestamptz default now()
);

create table if not exists alerts (
  id text primary key,
  alert_date date not null,
  alert_type text not null,
  severity text not null,
  title text not null,
  summary text not null,
  ingredient_name text not null,
  product_name text,
  detected_metric_name text not null,
  detected_metric_value text,
  baseline_metric_value text,
  reason_json jsonb default '{}'::jsonb,
  action_items_json jsonb default '[]'::jsonb,
  is_sent boolean default false,
  sent_channel text,
  created_at timestamptz default now()
);
create index if not exists idx_alerts_date on alerts (alert_date);

-- 모든 테이블에 RLS를 켜고 anon에는 읽기(select)만 허용합니다.
-- 서버(API 라우트, 크롤러 임포트 스크립트)의 쓰기는 항상 service_role 키를 쓰므로
-- RLS를 그대로 우회합니다 (src/lib/alert-repository.ts, scripts/import_csv_to_supabase.py 참고).
-- RLS를 끄면 브라우저에 노출된 anon 키로 "읽기"뿐 아니라 "쓰기/삭제"까지 가능해지므로
-- (Supabase 보안 어드바이저가 critical로 잡는 항목), 절대 disable로 두지 않습니다.
alter table products enable row level security;
alter table product_main_ingredients enable row level security;
alter table product_main_ingredients_majority enable row level security;
alter table product_snapshots enable row level security;
alter table product_rankings enable row level security;
alter table product_reviews enable row level security;
alter table daily_metric_snapshot enable row level security;
alter table alerts enable row level security;

create policy "Public read access" on products for select using (true);
create policy "Public read access" on product_main_ingredients for select using (true);
create policy "Public read access" on product_main_ingredients_majority for select using (true);
create policy "Public read access" on product_snapshots for select using (true);
create policy "Public read access" on product_rankings for select using (true);
create policy "Public read access" on product_reviews for select using (true);
create policy "Public read access" on daily_metric_snapshot for select using (true);
create policy "Public read access" on alerts for select using (true);
