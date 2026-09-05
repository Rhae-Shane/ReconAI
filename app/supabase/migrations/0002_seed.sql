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
