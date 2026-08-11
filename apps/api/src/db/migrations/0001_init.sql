-- SQLite schema for local-first monolith. See CONTEXT.md for domain language.

create table if not exists owners (
  id text primary key,
  name text not null,
  created_at text not null default (datetime('now'))
);

create table if not exists products (
  id text primary key,
  brand text not null,
  model text not null,
  model_year integer,
  category text not null default 'other',
  gtin text,
  specs text not null default '{}',
  created_at text not null default (datetime('now')),
  updated_at text not null default (datetime('now'))
);
create index if not exists products_brand_idx on products (lower(brand));
create index if not exists products_gtin_idx on products (gtin) where gtin is not null;

create table if not exists product_duplicate_reviews (
  id text primary key,
  new_product_id text not null references products(id) on delete cascade,
  candidate_product_id text not null references products(id) on delete cascade,
  score real not null,
  status text not null default 'pending' check (status in ('pending', 'merged', 'dismissed')),
  created_at text not null default (datetime('now'))
);

create table if not exists listings (
  id text primary key,
  product_id text references products(id) on delete set null,
  url text not null unique,
  domain text not null,
  source text not null default 'scrape' check (source in ('feed', 'scrape')),
  is_used integer not null default 0,
  status text not null default 'active' check (status in ('active', 'inactive', 'unsupported')),
  consecutive_scheduled_failures integer not null default 0,
  item_kind text not null default 'component',
  expected_category text,
  title text,
  last_checked_at text,
  created_at text not null default (datetime('now')),
  updated_at text not null default (datetime('now'))
);
create index if not exists listings_product_id_idx on listings (product_id);

create table if not exists listing_variants (
  id text primary key,
  listing_id text not null references listings(id) on delete cascade,
  provider_id text not null,
  label text not null,
  option_labels text not null default '[]',
  frame_size text,
  wheel_size_inches text,
  price real not null,
  currency text not null,
  in_stock integer not null default 1,
  missing_confirmations integer not null default 0,
  first_seen_at text not null,
  last_seen_at text not null,
  created_at text not null default (datetime('now')),
  updated_at text not null default (datetime('now')),
  unique (listing_id, provider_id)
);
create index if not exists listing_variants_listing_id_idx on listing_variants (listing_id);

create table if not exists watches (
  id text primary key,
  owner_id text not null references owners(id) on delete cascade,
  target_type text not null check (target_type in ('product', 'listing')),
  product_id text references products(id) on delete cascade,
  listing_id text references listings(id) on delete cascade,
  display_title text,
  title_source text not null default 'auto' check (title_source in ('user', 'auto')),
  frame_size text,
  wheel_size_inches text,
  variant_selection text not null default 'all' check (variant_selection in ('all', 'specific')),
  listing_variant_id text references listing_variants(id) on delete set null,
  created_at text not null default (datetime('now')),
  check (
    (target_type = 'product' and product_id is not null and listing_id is null)
    or (target_type = 'listing' and listing_id is not null and product_id is null)
  )
);
create index if not exists watches_owner_id_idx on watches (owner_id);
create unique index if not exists watches_owner_listing_unique on watches (owner_id, listing_id) where listing_id is not null;
create unique index if not exists watches_owner_product_unique on watches (owner_id, product_id) where product_id is not null;

create table if not exists price_points (
  id text primary key,
  listing_id text not null references listings(id) on delete cascade,
  watch_id text references watches(id) on delete cascade,
  price real not null,
  currency text not null,
  in_stock integer not null,
  scraped_at text not null,
  created_at text not null default (datetime('now'))
);
create index if not exists price_points_listing_id_idx on price_points (listing_id, scraped_at desc);
create index if not exists price_points_watch_id_idx on price_points (watch_id, scraped_at desc);

create table if not exists variant_price_points (
  id text primary key,
  variant_id text not null references listing_variants(id) on delete cascade,
  watch_id text references watches(id) on delete cascade,
  price real not null,
  currency text not null,
  in_stock integer not null,
  scraped_at text not null,
  created_at text not null default (datetime('now'))
);
create index if not exists variant_price_points_variant_id_idx on variant_price_points (variant_id, scraped_at desc);
create index if not exists variant_price_points_watch_id_idx on variant_price_points (watch_id, scraped_at desc);

create table if not exists tasks (
  id text primary key,
  owner_id text not null references owners(id) on delete cascade,
  kind text not null,
  label text not null,
  status text not null default 'queued' check (status in ('queued', 'active', 'succeeded', 'partial', 'failed')),
  origin text not null default 'user' check (origin in ('user', 'sweep')),
  created_at text not null default (datetime('now')),
  updated_at text not null default (datetime('now'))
);
create index if not exists tasks_owner_id_idx on tasks (owner_id, created_at desc);

create table if not exists jobs (
  id text primary key,
  task_id text not null references tasks(id) on delete cascade,
  kind text not null,
  status text not null default 'queued' check (status in ('queued', 'leased', 'succeeded', 'failed', 'cancelled')),
  attempt integer not null default 0,
  input text not null,
  output text,
  error text,
  leased_by text,
  lease_expires_at text,
  depends_on_job_id text references jobs(id) on delete set null,
  lease_token text,
  created_at text not null default (datetime('now')),
  updated_at text not null default (datetime('now'))
);
create index if not exists jobs_task_id_idx on jobs (task_id);
create index if not exists jobs_claimable_idx on jobs (status, created_at) where status = 'queued';
create index if not exists jobs_depends_on_idx on jobs (depends_on_job_id) where depends_on_job_id is not null;
create index if not exists jobs_claimable_dep_idx on jobs (created_at) where status = 'queued';
create index if not exists jobs_expired_lease_idx on jobs (lease_expires_at) where status = 'leased';

create table if not exists job_stages (
  id text primary key,
  job_id text not null references jobs(id) on delete cascade,
  name text not null check (name in ('fetch', 'validate', 'extract', 'resolve', 'persist')),
  status text not null default 'pending' check (status in ('pending', 'running', 'succeeded', 'failed')),
  attempt integer not null default 0,
  artifact_id text,
  error text,
  started_at text,
  finished_at text,
  unique (job_id, name)
);

create table if not exists artifacts (
  id text primary key,
  job_id text not null references jobs(id) on delete cascade,
  stage text not null,
  content_type text not null,
  path text not null,
  byte_size integer not null,
  created_at text not null default (datetime('now'))
);

insert into owners (id, name)
select '00000000-0000-0000-0000-000000000001', 'Local Rider'
where not exists (select 1 from owners where id = '00000000-0000-0000-0000-000000000001');
