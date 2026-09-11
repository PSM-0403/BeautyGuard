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

-- 로그인 없는 공개 대시보드라, 상품/리뷰류 테이블은 읽기 전용이라 RLS를 끕니다.
-- (쓰기는 항상 service_role 키로만 하므로 RLS를 켜도 꺼도 안전하지만, 단순하게 끕니다.)
alter table products disable row level security;
alter table product_main_ingredients disable row level security;
alter table product_snapshots disable row level security;
alter table product_rankings disable row level security;
alter table product_reviews disable row level security;

-- alerts / daily_metric_snapshot은 서버(API 라우트)가 직접 insert/update/delete를 하므로
-- RLS를 켜고 anon에는 읽기(select)만 허용합니다. 서버 쪽 쓰기는 service_role 키를 쓰므로
-- RLS를 그대로 우회합니다 (src/lib/alert-repository.ts 참고).
alter table daily_metric_snapshot enable row level security;
alter table alerts enable row level security;

create policy "Public read access" on daily_metric_snapshot for select using (true);
create policy "Public read access" on alerts for select using (true);
