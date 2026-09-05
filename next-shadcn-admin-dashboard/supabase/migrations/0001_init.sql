-- ReconAI – AI Finance Controller: initial schema.
-- Mirrors prisma/schema.prisma (ReconAI domain, replacing the template's Reactor
-- Design Tool tables). Async reconciliation jobs persist to Redis/Upstash; this
-- Postgres schema stores the durable ledger side: runs, normalized records, match
-- groups/netting, exceptions, audit events, settlements, forecast and tax matches.
--
-- Auth: single internal team with equal access -> every table enables RLS with one
-- permissive policy on the `authenticated` role. The app connects with the
-- publishable (anon) key; the seed script uses the secret key.

-- Remove the template's reactor tables if they were ever created (they are not
-- part of ReconAI and must not linger).
drop table if exists public.winding_matrix;
drop table if exists public.busbar_cross_sizes;
drop table if exists public.insulator_dimensions;
drop table if exists public.item_densities;
drop table if exists public.material_constants;
drop table if exists public.skin_depth;
drop table if exists public.bobbin_sizes;
drop table if exists public.stock_items;
drop table if exists public.raw_material_prices;
drop table if exists public.design_revisions;
drop table if exists public.designs;

-- ── Runs ───────────────────────────────────────────────────────────────────
create table if not exists public.close_runs (
  id          text primary key,
  batch_id    text,
  status      text not null default 'PENDING',   -- PENDING | RUNNING | COMPLETED | FAILED
  started_at  timestamptz not null default now(),
  finished_at timestamptz,
  created_at  timestamptz not null default now()
);
create index if not exists close_runs_status_idx on public.close_runs (status);
create index if not exists close_runs_started_at_idx on public.close_runs (started_at desc);

-- ── Normalized finance records ─────────────────────────────────────────────
create table if not exists public.fin_records (
  id           text primary key,
  run_id       text not null references public.close_runs(id) on delete cascade,
  source       text not null,   -- razorpay-gateway | bank-utr | erp-orders | gst-invoices
  kind         text not null,   -- PAYMENT | SETTLEMENT | REFUND | FEE | INVOICE | CHARGEBACK | ADJUSTMENT
  source_name  text,
  source_ref   text not null,
  value_date   date not null,
  amount_paise bigint not null, -- signed: + inflow, - outflow
  currency     text not null default 'INR',
  counterparty text,
  description  text,
  utr          text,
  gateway_ref  text,
  order_ref    text,
  fee_tax_paise bigint,          -- magnitude (>= 0), on FEE records
  raw          jsonb,
  unique (run_id, source, source_ref)
);
create index if not exists fin_records_run_utr_idx on public.fin_records (run_id, utr);
create index if not exists fin_records_run_gateway_idx on public.fin_records (run_id, gateway_ref);
create index if not exists fin_records_run_order_idx on public.fin_records (run_id, order_ref);

-- ── Match groups + links ───────────────────────────────────────────────────
create table if not exists public.match_groups (
  id          text primary key,
  run_id      text not null references public.close_runs(id) on delete cascade,
  key         text not null,
  method      text not null,   -- EXACT | NORMALIZED | JUDGED | NETTED
  match_type  text not null,   -- EXACT | NORMALIZED | *_NETTED | PARTIAL | FUZZY | AI_RESOLVED | UNRESOLVED
  confidence  double precision not null,
  reason      text not null,
  amount_paise bigint not null,
  value_date  date
);
create index if not exists match_groups_run_idx on public.match_groups (run_id);

create table if not exists public.match_links (
  id         text primary key,
  group_id   text not null references public.match_groups(id) on delete cascade,
  record_id  text not null references public.fin_records(id) on delete cascade,
  matched_on text not null,  -- utr | gatewayRef | orderRef | normalizedRef | judge
  match_type text,           -- explicit decision label for this link
  unique (group_id, record_id)
);
create index if not exists match_links_record_idx on public.match_links (record_id);

-- ── Netting mathematics (review P0 identity) ──────────────────────────────
-- gross - gateway_fee - tax_on_fee - refund + adjustment = net_expected
-- variance = actual_settlement - net_expected  (~0 when the net balances)
create table if not exists public.nettings (
  id                     text primary key default gen_random_uuid(),
  group_id               text not null unique references public.match_groups(id) on delete cascade,
  gross_paise            bigint not null,
  fee_paise              bigint not null,
  tax_on_fee_paise       bigint not null,
  refund_paise           bigint not null,
  adjustment_paise       bigint not null,  -- signed, +/-
  net_expected_paise     bigint not null,
  actual_settlement_paise bigint not null,
  variance_paise         bigint not null
);

-- ── Settlements ───────────────────────────────────────────────────────────
create table if not exists public.settlements (
  id          text primary key,
  run_id      text not null references public.close_runs(id) on delete cascade,
  group_keys  jsonb not null,   -- string[]
  settled_at  timestamptz,
  amount_paise bigint not null,
  utr         text,
  status      text not null default 'EXPECTED',  -- EXPECTED | RECEIVED | MISSING | RECONCILED
  lag_days    int,
  lines       jsonb            -- SettlementLine[]
);
create index if not exists settlements_run_idx on public.settlements (run_id);

-- ── Cash forecast ─────────────────────────────────────────────────────────
create table if not exists public.forecast (
  id            text primary key,
  run_id        text not null references public.close_runs(id) on delete cascade,
  date          date not null,
  balance_paise bigint not null,
  delta_paise   bigint not null,
  confidence    double precision not null,
  reconciled_in boolean not null default false
);
create index if not exists forecast_run_date_idx on public.forecast (run_id, date);

-- ── Tax categories ────────────────────────────────────────────────────────
create table if not exists public.tax_categories (
  id          text primary key default gen_random_uuid(),
  code        text not null unique,   -- HSN or GL code
  label       text not null,
  description text
);

-- ── Tax line matches ──────────────────────────────────────────────────────
create table if not exists public.tax_line_matches (
  id            text primary key,
  run_id        text not null references public.close_runs(id) on delete cascade,
  record_id     text not null,
  category_id   text,
  category_code text,
  category_label text,
  matched_by    text not null,   -- RULE | JUDGED
  confidence    double precision not null,
  reason        text not null
);
create index if not exists tax_line_matches_run_idx on public.tax_line_matches (run_id);

-- ── Exception ledger (append-only; nothing is ever silently dropped) ──────
create table if not exists public.exceptions (
  id               text primary key,
  run_id           text not null references public.close_runs(id) on delete cascade,
  record_id        text,
  record_json      jsonb not null,
  reason_code      text not null,  -- NO_KEY | AMOUNT_MISMATCH | PARTIAL_FLAP | DATE_SKEW | LOW_CONFIDENCE | DUPLICATE | UNKNOWN_SOURCE
  rationale        text not null,
  candidate_ids    jsonb not null, -- string[]
  status           text not null default 'OPEN',  -- OPEN | REVIEWED | OVERRIDDEN | RESOLVED
  match_type       text,           -- how this residual was classed
  confidence       double precision,
  expected_paise   bigint,
  actual_paise     bigint,
  variance_paise   bigint,
  fee_paise        bigint,
  adjustment_paise bigint,
  refund_paise     bigint,
  ai_reasoning     text,
  reviewer_decision text,
  created_at       timestamptz not null default now(),
  resolved_at      timestamptz
);
create index if not exists exceptions_run_status_idx on public.exceptions (run_id, status);

-- ── Audit trail ───────────────────────────────────────────────────────────
create table if not exists public.audit_events (
  id         text primary key,
  run_id     text not null references public.close_runs(id) on delete cascade,
  actor_type text not null,   -- AGENT | SYSTEM | USER
  actor_id   text not null,
  action     text not null,   -- INGEST | MATCH | JUDGE | SETTLE | FORECAST | TAX | EXCEPTION | CLOSE
  record_id  text,
  detail     jsonb,
  created_at timestamptz not null default now()
);
create index if not exists audit_events_run_created_idx on public.audit_events (run_id, created_at);

-- ── Close report (terminal deliverable; summary payloads as jsonb) ────────
create table if not exists public.close_reports (
  id             text primary key default gen_random_uuid(),
  run_id         text not null unique references public.close_runs(id) on delete cascade,
  generated_at   timestamptz not null default now(),
  totals         jsonb not null,
  breakdown      jsonb not null,
  unresolved     jsonb not null,
  per_source     jsonb not null,
  precision      double precision,
  recall         double precision,
  judge          jsonb,
  confidence_bins jsonb,
  audit_count    int
);

-- ── Settings / tolerance model (SPEC §5) ──────────────────────────────────
create table if not exists public.finance_configs (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now()
);

-- ── RLS: single permissive policy for the authenticated role ──────────────
ALTER TABLE public.close_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fin_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.match_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.match_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nettings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.forecast ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tax_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tax_line_matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exceptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.close_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_configs ENABLE ROW LEVEL SECURITY;

create policy "authenticated_read_all" on public.close_runs for select to authenticated using (true);
create policy "authenticated_read_all" on public.fin_records for select to authenticated using (true);
create policy "authenticated_read_all" on public.match_groups for select to authenticated using (true);
create policy "authenticated_read_all" on public.match_links for select to authenticated using (true);
create policy "authenticated_read_all" on public.nettings for select to authenticated using (true);
create policy "authenticated_read_all" on public.settlements for select to authenticated using (true);
create policy "authenticated_read_all" on public.forecast for select to authenticated using (true);
create policy "authenticated_read_all" on public.tax_categories for select to authenticated using (true);
create policy "authenticated_read_all" on public.tax_line_matches for select to authenticated using (true);
create policy "authenticated_read_all" on public.exceptions for select to authenticated using (true);
create policy "authenticated_read_all" on public.audit_events for select to authenticated using (true);
create policy "authenticated_read_all" on public.close_reports for select to authenticated using (true);
create policy "authenticated_read_all" on public.finance_configs for select to authenticated using (true);

-- Service role bypasses RLS by default; grants for completeness.
grant select on all tables in schema public to authenticated;
grant all on all tables in schema public to service_role;
