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
-- ReconAI seed data: one complete close run with a mixed batch of payment/settlement/
-- invoice records from all four sources, plus netting, exceptions, audit trail, forecast
-- and the terminal report. Amounts are integer paise.

-- Finance config / tolerances (SPEC §5)
insert into public.finance_configs (key, value) values
  ('tolerances', '{"paiseTolerance":100,"dateWindowDays":2,"resolveThreshold":0.7,"exactThreshold":0.999,"normalizedThreshold":0.9}'),
  ('currency', '"INR"')
on conflict (key) do update set value = excluded.value;

-- Sample tax categories (HSN/GL codes)
insert into public.tax_categories (code, label, description) values
  ('9983', 'Business Services', 'IT services, consulting, software'),
  ('8473', 'Computer Parts', 'Computer hardware and peripherals'),
  ('6204', 'Apparel & Textiles', 'Textile goods'),
  ('1904', 'Food & Beverage', 'Processed food items'),
  ('3004', 'Pharmaceuticals', 'Medicinal preparations')
on conflict (code) do nothing;

-- One demo close run
insert into public.close_runs (id, batch_id, status, started_at, finished_at) values
  ('run_demo_20260823', 'batch_demo_01', 'COMPLETED', '2026-08-23T09:15:00.000Z', '2026-08-23T09:15:06.420Z');

-- Normalized records (61 records) — subset shown; amounts in paise.
insert into public.fin_records
  (id, run_id, source, kind, source_name, source_ref, value_date, amount_paise, currency, counterparty, utr, gateway_ref, order_ref, fee_tax_paise, raw) values
  -- Invoice + gateway payment, netted with gateway fee (+ tax) and settled via bank
  ('r_inv_0001', 'run_demo_20260823', 'gst-invoices', 'INVOICE', 'GST Invoices', 'INV-1234', '2026-08-10', 1000000, 'INR', 'Acme Technologies', null, null, 'ORD-7781', null, '{"ref":"INV-1234"}'),
  ('r_pay_0002', 'run_demo_20260823', 'razorpay-gateway', 'PAYMENT', 'Razorpay Gateway', 'pay_9034', '2026-08-11', 1000000, 'INR', 'Acme Technologies', 'UTR9137', 'pay_9034', 'ORD-7781', null, '{"ref":"pay_9034"}'),
  ('r_fee_0003', 'run_demo_20260823', 'razorpay-gateway', 'FEE', 'Razorpay Gateway', 'pay_9034::fee', '2026-08-11', -17700, 'INR', 'Razorpay', null, 'pay_9034', null, 2700, '{"ref":"pay_9034::fee"}'),
  ('r_set_0004', 'run_demo_20260823', 'bank-utr', 'SETTLEMENT', 'Bank UTR', 'UTR9137', '2026-08-13', 982300, 'INR', 'Acme Technologies', 'UTR9137', null, null, null, '{"ref":"UTR9137"}'),

  -- Simple exact-match pair (same UTR) for a second customer
  ('r_inv_0005', 'run_demo_20260823', 'gst-invoices', 'INVOICE', 'GST Invoices', 'INV-2234', '2026-08-12', 550000, 'INR', 'Riverside Textiles', null, null, 'ORD-8812', null, '{"ref":"INV-2234"}'),
  ('r_set_0006', 'run_demo_20260823', 'bank-utr', 'SETTLEMENT', 'Bank UTR', 'UTR4356', '2026-08-13', 550000, 'INR', 'Riverside Textiles', 'UTR4356', null, null, null, '{"ref":"UTR4356"}'),

  -- Partial: invoice 50,000 vs payment 30,000 (open 20,000) — NOT resolved automatically
  ('r_inv_0007', 'run_demo_20260823', 'gst-invoices', 'INVOICE', 'GST Invoices', 'INV-3210', '2026-08-13', 500000, 'INR', 'Bloomery Foods', null, null, 'ORD-9941', null, '{"ref":"INV-3210"}'),
  ('r_pay_0008', 'run_demo_20260823', 'razorpay-gateway', 'PAYMENT', 'Razorpay Gateway', 'pay_5540', '2026-08-14', 300000, 'INR', 'Bloomery Foods', 'UTR2811', 'pay_5540', 'ORD-9941', null, '{"ref":"pay_5540"}'),

  -- Orphan: ERP order with no usable reference and no near-amount candidate
  ('r_ord_0009', 'run_demo_20260823', 'erp-orders', 'PAYMENT', 'ERP Orders', 'ORD-10233', '2026-08-14', 125000, 'INR', 'Helix Pharma Distributors', null, null, 'ORD-10233', null, '{"ref":"ORD-10233"}')
on conflict (run_id, source, source_ref) do nothing;

-- Match groups: two netted groups, one exact pair, plus a flap.
insert into public.match_groups
  (id, run_id, key, method, match_type, confidence, reason, amount_paise, value_date) values
  ('grp_0001', 'run_demo_20260823', 'UTR9137', 'NETTED', 'FEE_NETTED', 0.98,
   'gross 1000000 - fee 15000 - tax 2700 - refund 0 + adjustment 0 = net 982300 = settled 982300', 1000000, '2026-08-11'),
  ('grp_0002', 'run_demo_20260823', 'UTR4356', 'EXACT', 'EXACT', 1,
   'exact utr match', 550000, '2026-08-12'),
  ('grp_0003', 'run_demo_20260823', 'ORD-9941', 'EXACT', 'PARTIAL', 0.45,
   'exact order ref but amount mismatch: invoice 500000 vs settlement 300000; difference 200000', 500000, '2026-08-14');

insert into public.match_links (id, group_id, record_id, matched_on, match_type) values
  ('ml_0001', 'grp_0001', 'r_inv_0001', 'orderRef', 'FEE_NETTED'),
  ('ml_0002', 'grp_0001', 'r_pay_0002', 'gatewayRef', 'FEE_NETTED'),
  ('ml_0003', 'grp_0001', 'r_fee_0003', 'fee', 'FEE_NETTED'),
  ('ml_0004', 'grp_0001', 'r_set_0004', 'utr', 'FEE_NETTED'),
  ('ml_0005', 'grp_0002', 'r_inv_0005', 'utr', 'EXACT'),
  ('ml_0006', 'grp_0002', 'r_set_0006', 'utr', 'EXACT'),
  ('ml_0007', 'grp_0003', 'r_inv_0007', 'orderRef', 'PARTIAL'),
  ('ml_0008', 'grp_0003', 'r_pay_0008', 'orderRef', 'PARTIAL');

insert into public.nettings
  (id, group_id, gross_paise, fee_paise, tax_on_fee_paise, refund_paise, adjustment_paise, net_expected_paise, actual_settlement_paise, variance_paise) values
  ('net_0001', 'grp_0001', 1000000, 15000, 2700, 0, 0, 982300, 982300, 0);

-- Settlements
insert into public.settlements (id, run_id, group_keys, settled_at, amount_paise, utr, status, lag_days) values
  ('stl_0001', 'run_demo_20260823', '["UTR9137"]', '2026-08-13T18:02:00.000Z', 982300, 'UTR9137', 'RECONCILED', 0),
  ('stl_0002', 'run_demo_20260823', '["UTR4356"]', '2026-08-13T18:02:00.000Z', 550000, 'UTR4356', 'RECONCILED', 0);

-- Cash forecast (7-day)
insert into public.forecast (id, run_id, date, balance_paise, delta_paise, confidence, reconciled_in) values
  ('f_0001', 'run_demo_20260823', '2026-08-24', 1532300, 1532300, 0.9, true),
  ('f_0002', 'run_demo_20260823', '2026-08-25', 1532300, 0, 0.8, false),
  ('f_0003', 'run_demo_20260823', '2026-08-26', 1532300, 0, 0.8, false),
  ('f_0004', 'run_demo_20260823', '2026-08-27', 1532300, 0, 0.8, false),
  ('f_0005', 'run_demo_20260823', '2026-08-28', 1532300, 0, 0.8, false),
  ('f_0006', 'run_demo_20260823', '2026-08-29', 1532300, 0, 0.8, false),
  ('f_0007', 'run_demo_20260823', '2026-08-30', 1532300, 0, 0.8, false);

-- Tax line matches
insert into public.tax_line_matches (id, run_id, record_id, category_id, category_code, category_label, matched_by, confidence, reason) values
  ('tx_0001', 'run_demo_20260823', 'r_inv_0001', null, '8473', 'Computer Parts', 'RULE', 1, 'HSN prefix rule'),
  ('tx_0002', 'run_demo_20260823', 'r_inv_0005', null, '6204', 'Apparel & Textiles', 'RULE', 1, 'HSN prefix rule');

-- Exceptions: the partial-payment flap and the orphan are open for human review.
insert into public.exceptions
  (id, run_id, record_id, record_json, reason_code, rationale, candidate_ids, status, match_type, confidence, expected_paise, actual_paise, variance_paise, fee_paise, adjustment_paise, refund_paise, ai_reasoning, reviewer_decision) values
  ('exc_0001', 'run_demo_20260823', 'r_inv_0007', '{"ref":"INV-3210","amountPaise":500000}', 'PARTIAL_FLAP', 'Invoice INV-3210 for ₹50,000 matched only ₹30,000 in settlement; ₹20,000 shortfall. No matching payment record found.', '["r_pay_0008"]', 'OPEN', 'PARTIAL', 0.45, 500000, 300000, 200000, 0, 0, 0, null, null),
  ('exc_0002', 'run_demo_20260823', 'r_ord_0009', '{"ref":"ORD-10233","amountPaise":125000}', 'NO_KEY', 'Order ORD-10233 is an orphan: no usable reference key and no near-amount candidate.', '[]', 'REVIEWED', 'UNRESOLVED', 0.9, 125000, 0, 125000, 0, 0, 0, 'No invoice or settlement references this order; classified as unmatched ERP order.', 'RESOLVE_AUTO');

-- Audit trail
insert into public.audit_events (id, run_id, actor_type, actor_id, action, record_id, detail, created_at) values
  ('aud_0001', 'run_demo_20260823', 'SYSTEM', 'close-engine', 'INGEST', null, '{"sources":4,"records":9}', '2026-08-23T09:15:00.100Z'),
  ('aud_0002', 'run_demo_20260823', 'SYSTEM', 'close-engine', 'MATCH', null, '{"groups":3,"matched":2,"unresolved":1}', '2026-08-23T09:15:00.300Z'),
  ('aud_0003', 'run_demo_20260823', 'AGENT', 'heuristic-judge', 'JUDGE', 'r_inv_0007', '{"confidence":0.45,"reason":"PARTIAL_FLAP"}', '2026-08-23T09:15:00.500Z'),
  ('aud_0004', 'run_demo_20260823', 'AGENT', 'heuristic-judge', 'JUDGE', 'r_ord_0009', '{"confidence":0.9,"reason":"NO_KEY"}', '2026-08-23T09:15:00.500Z'),
  ('aud_0005', 'run_demo_20260823', 'SYSTEM', 'close-engine', 'EXCEPTION', 'exc_0001', '{"count":2}', '2026-08-23T09:15:01.000Z'),
  ('aud_0006', 'run_demo_20260823', 'SYSTEM', 'close-engine', 'CLOSE', null, '{"report":"generated"}', '2026-08-23T09:15:06.400Z');

-- Terminal report
insert into public.close_reports
  (id, run_id, generated_at, totals, breakdown, unresolved, per_source, precision, recall, judge, confidence_bins, audit_count) values
  ('rep_0001', 'run_demo_20260823', '2026-08-23T09:15:06.400Z',
   '{"records":9,"sources":4,"matched":7,"resolvedPct":77.78,"exceptionCount":2,"groups":3}',
   '{"records":9,"matched":7,"partial":1,"unresolved":1,"matchRate":0.78}',
   '[{"recordId":"r_inv_0007","ref":"INV-3210","expectedPaise":500000,"actualPaise":300000,"differencePaise":200000,"reason":"PARTIAL_FLAP","confidence":0.45,"status":"NEEDS_REVIEW"}]',
   '[{"source":"gst-invoices","sourceName":"GST Invoices","records":3,"matched":1,"matchRate":0.33},{"source":"razorpay-gateway","sourceName":"Razorpay Gateway","records":3,"matched":3,"matchRate":1},{"source":"bank-utr","sourceName":"Bank UTR","records":2,"matched":2,"matchRate":1},{"source":"erp-orders","sourceName":"ERP Orders","records":1,"matched":0,"matchRate":0}]',
   0.98, 0.98,
   '{"candidates":2,"resolved":0,"lowConfidence":2}',
   '[{"bin":"0.0-0.5","count":1},{"bin":"0.5-0.8","count":1},{"bin":"0.8-1.0","count":7}]',
   6);
